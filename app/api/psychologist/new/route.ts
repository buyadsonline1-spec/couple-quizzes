import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateTelegramInitData } from "@/lib/server/telegram-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const initData = typeof body.initData === "string" ? body.initData : "";
    const pairContextEnabled = Boolean(body.pairContextEnabled);
    const language = body.language === "en" ? "en" : "ru";

    const validation = validateTelegramInitData(initData);

    if (!validation.valid || !validation.telegramId) {
      return NextResponse.json(
        { error: "Invalid Telegram data" },
        { status: 401 }
      );
    }

    // pairId сервер достаёт сам из профиля — клиент не передаёт.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("pair_id")
      .eq("telegram_id", validation.telegramId)
      .maybeSingle();

    const { data: conversation, error } = await supabaseAdmin
      .from("ai_psychologist_conversations")
      .insert({
        telegram_id: validation.telegramId,
        pair_id: profile?.pair_id ?? null,
        pair_context_enabled: pairContextEnabled,
        language,
      })
      .select("id")
      .single();

    if (error || !conversation) {
      console.error("PSYCHOLOGIST NEW ERROR:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, conversationId: conversation.id });
  } catch (error) {
    console.error("PSYCHOLOGIST NEW ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
