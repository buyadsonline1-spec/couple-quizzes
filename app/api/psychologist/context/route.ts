import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

// Переключение "✨ Учитывать данные нашей пары" для УЖЕ существующего
// разговора (при создании через /api/psychologist/new это тоже можно
// задать сразу) — по умолчанию OFF. Хранится на самом conversation, а
// не глобально на пользователя, чтобы один диалог мог быть личным,
// другой — с контекстом пары.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const conversationId =
      typeof body.conversationId === "string" ? body.conversationId : "";
    const enabled = Boolean(body.enabled);

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

    const { data, error } = await supabaseAdmin
      .from("ai_psychologist_conversations")
      .update({ pair_context_enabled: enabled })
      .eq("id", conversationId)
      .eq("telegram_id", validation.telegramId)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("PSYCHOLOGIST CONTEXT ERROR:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, reason: "conversation-not-found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, enabled });
  } catch (error) {
    console.error("PSYCHOLOGIST CONTEXT ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
