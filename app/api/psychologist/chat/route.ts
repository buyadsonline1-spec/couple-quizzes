import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";
import { getOpenAIClient, AI_PSYCHOLOGIST_MODEL } from "@/lib/server/openai-client";
import {
  buildRelationshipPsychologistPrompt,
  getSafetyModeResponse,
} from "@/lib/ai/relationship-psychologist-prompt";
import {
  buildPsychologistPairContext,
  formatPairContextForPrompt,
} from "@/lib/server/psychologist-pair-context";

// Категории OpenAI Moderation, которые мы считаем "серьёзной опасностью"
// (не просто грубость/хейт) — при срабатывании любой из них НЕ отдаём
// сообщение в обычную модель психолога, а отвечаем фиксированной
// safety-веткой. См. lib/ai/relationship-psychologist-prompt.ts.
const DANGER_CATEGORIES = [
  "self-harm",
  "self-harm/intent",
  "self-harm/instructions",
  "violence",
  "violence/graphic",
  "harassment/threatening",
] as const;

const MAX_HISTORY_MESSAGES = 16;
const MAX_MESSAGE_LENGTH = 4000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const conversationId =
      typeof body.conversationId === "string" ? body.conversationId : "";
    const message =
      typeof body.message === "string" ? body.message.trim() : "";

    const validation = await validateRequestAuth(body);

    if (!validation.valid || !validation.telegramId) {
      return NextResponse.json(
        { error: "Invalid Telegram data" },
        { status: 401 }
      );
    }

    if (!conversationId) {
      return NextResponse.json(
        { ok: false, reason: "invalid-conversation" },
        { status: 400 }
      );
    }

    if (!message || message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { ok: false, reason: "invalid-message" },
        { status: 400 }
      );
    }

    const telegramId = validation.telegramId;

    // Владение разговором — не просто "есть ли такой id", а именно
    // принадлежит ли он этому telegramId.
    const { data: conversation, error: conversationError } = await supabaseAdmin
      .from("ai_psychologist_conversations")
      .select("id, telegram_id, language, pair_id, pair_context_enabled")
      .eq("id", conversationId)
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (conversationError) {
      console.error("PSYCHOLOGIST CHAT conversation lookup error:", conversationError);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    if (!conversation) {
      return NextResponse.json(
        { ok: false, reason: "conversation-not-found" },
        { status: 404 }
      );
    }

    const language = conversation.language === "en" ? "en" : "ru";

    // Pair Context (второй проход, согласован с ChatGPT): только если
    // пользователь явно включил тумблер для ЭТОГО разговора и реально
    // состоит в паре. Собираем строго агрегированные данные (уровень
    // пары, % совместимости, сильные/слабые темы, серия вопроса дня) —
    // никаких сырых ответов партнёра, telegram_id или username. Если
    // сбор контекста не удался — не блокируем чат, просто продолжаем
    // без контекста (тот же уровень доступности, что и раньше).
    let pairContextText: string | null = null;

    if (conversation.pair_context_enabled && conversation.pair_id) {
      try {
        const { data: pairRow } = await supabaseAdmin
          .from("pairs")
          .select("total_points")
          .eq("id", conversation.pair_id)
          .maybeSingle();

        const pairContext = await buildPsychologistPairContext(
          conversation.pair_id,
          pairRow?.total_points ?? 0
        );

        pairContextText = formatPairContextForPrompt(pairContext, language);
      } catch (error) {
        console.error("PSYCHOLOGIST CHAT pair context error:", error);
      }
    }

    // Дневной лимит — атомарно на сервере, тот же паттерн, что и
    // consume_daily_access для тестов, но с premium-aware лимитом
    // (3 free / 50 premium), потому что каждое сообщение реально
    // стоит денег на OpenAI API.
    const { data: accessData, error: accessError } = await supabaseAdmin.rpc(
      "consume_psychologist_message_access",
      { p_telegram_id: telegramId }
    );

    if (accessError || !accessData?.ok) {
      console.error("PSYCHOLOGIST CHAT access RPC error:", accessError || accessData);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    if (!accessData.allowed) {
      return NextResponse.json({
        ok: false,
        reason: "limit-reached",
        used: accessData.used,
        limit: accessData.limit,
        isPremium: accessData.isPremium,
      });
    }

    const openai = getOpenAIClient();

    if (!openai) {
      console.error("PSYCHOLOGIST CHAT: OPENAI_API_KEY is not configured");
      return NextResponse.json(
        { ok: false, reason: "ai-not-configured" },
        { status: 503 }
      );
    }

    // Всегда сохраняем реальное сообщение пользователя, независимо от
    // того, пойдёт ли оно в обычную модель или в safety-ветку.
    const { error: userInsertError } = await supabaseAdmin
      .from("ai_psychologist_messages")
      .insert({
        conversation_id: conversationId,
        role: "user",
        content: message,
      });

    if (userInsertError) {
      console.error("PSYCHOLOGIST CHAT user insert error:", userInsertError);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    // Moderation ПЕРЕД основной моделью — если сообщение отмечено как
    // самоповреждение/насилие/угроза, не продолжаем обычный "разбор
    // отношений", а отвечаем фиксированной безопасной веткой.
    let flaggedCategory: string | null = null;

    try {
      const moderation = await openai.moderations.create({ input: message });
      const result = moderation.results?.[0];

      if (result?.flagged) {
        const categories = result.categories as unknown as Record<
          string,
          boolean
        >;
        flaggedCategory =
          DANGER_CATEGORIES.find((category) => categories?.[category]) ?? null;
      }
    } catch (error) {
      // Если moderation недоступна — не блокируем пользователя из-за
      // сбоя стороннего сервиса, но и не отправляем в основную модель
      // молча без проверки; логируем и продолжаем как обычный запрос
      // (тот же уровень риска, что и до появления moderation вообще).
      console.error("PSYCHOLOGIST CHAT moderation error:", error);
    }

    let replyText: string;
    let safetyMode: string | null = null;

    if (flaggedCategory) {
      replyText = getSafetyModeResponse(language);
      safetyMode = flaggedCategory;
    } else {
      const { data: historyRows, error: historyError } = await supabaseAdmin
        .from("ai_psychologist_messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(MAX_HISTORY_MESSAGES);

      if (historyError) {
        console.error("PSYCHOLOGIST CHAT history error:", historyError);
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 }
        );
      }

      const history = (historyRows ?? []).reverse();

      const instructions = pairContextText
        ? `${buildRelationshipPsychologistPrompt({ language })}\n\n${pairContextText}`
        : buildRelationshipPsychologistPrompt({ language });

      try {
        const response = await openai.responses.create({
          model: AI_PSYCHOLOGIST_MODEL,
          instructions,
          input: history.map((row) => ({
            role: row.role as "user" | "assistant",
            content: row.content,
          })),
          store: false,
        });

        replyText =
          response.output_text?.trim() ||
          (language === "en"
            ? "Sorry, I couldn't come up with a reply just now — could you try rephrasing?"
            : "Извини, не получилось сформулировать ответ — попробуй переформулировать вопрос?");
      } catch (error) {
        console.error("PSYCHOLOGIST CHAT OpenAI error:", error);
        return NextResponse.json(
          { ok: false, reason: "ai-request-failed" },
          { status: 502 }
        );
      }
    }

    const { error: assistantInsertError } = await supabaseAdmin
      .from("ai_psychologist_messages")
      .insert({
        conversation_id: conversationId,
        role: "assistant",
        content: replyText,
        safety_mode: safetyMode,
      });

    if (assistantInsertError) {
      console.error("PSYCHOLOGIST CHAT assistant insert error:", assistantInsertError);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    await supabaseAdmin
      .from("ai_psychologist_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    return NextResponse.json({
      ok: true,
      reply: replyText,
      safetyMode,
      pairContextUsed: Boolean(pairContextText),
      used: accessData.used,
      limit: accessData.limit,
      isPremium: accessData.isPremium,
    });
  } catch (error) {
    console.error("PSYCHOLOGIST CHAT ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
