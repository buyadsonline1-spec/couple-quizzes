import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateTelegramInitData } from "@/lib/server/telegram-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const initData = typeof body.initData === "string" ? body.initData : "";
    const conversationId =
      typeof body.conversationId === "string" ? body.conversationId : null;

    const validation = validateTelegramInitData(initData);

    if (!validation.valid || !validation.telegramId) {
      return NextResponse.json(
        { error: "Invalid Telegram data" },
        { status: 401 }
      );
    }

    const { data: conversations, error: conversationsError } =
      await supabaseAdmin
        .from("ai_psychologist_conversations")
        .select("id, title, pair_context_enabled, language, updated_at")
        .eq("telegram_id", validation.telegramId)
        .order("updated_at", { ascending: false });

    if (conversationsError) {
      console.error("PSYCHOLOGIST STATE conversations error:", conversationsError);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    // Явно переданный conversationId — иначе самый свежий разговор
    // этого пользователя (или null, если разговоров ещё не было).
    const activeId = conversationId ?? conversations?.[0]?.id ?? null;

    let messages: Array<{ role: string; content: string; createdAt: string }> =
      [];

    if (activeId) {
      // Владение разговором проверяем через сам список conversations
      // (он уже отфильтрован по telegram_id) — если activeId туда не
      // входит, это либо чужой, либо несуществующий разговор.
      const belongsToUser = conversations?.some((c) => c.id === activeId);

      if (belongsToUser) {
        const { data: messageRows, error: messagesError } = await supabaseAdmin
          .from("ai_psychologist_messages")
          .select("role, content, created_at")
          .eq("conversation_id", activeId)
          .order("created_at", { ascending: true });

        if (messagesError) {
          console.error("PSYCHOLOGIST STATE messages error:", messagesError);
          return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
          );
        }

        messages = (messageRows ?? []).map((row) => ({
          role: row.role,
          content: row.content,
          createdAt: row.created_at,
        }));
      }
    }

    return NextResponse.json({
      ok: true,
      conversations: conversations ?? [],
      activeConversationId: activeId,
      messages,
    });
  } catch (error) {
    console.error("PSYCHOLOGIST STATE ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
