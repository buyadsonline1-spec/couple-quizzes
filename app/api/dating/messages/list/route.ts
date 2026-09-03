import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";
import { checkIsPremium } from "@/lib/server/pair-state";

// Забор сообщений поллингом (клиент вызывает раз в несколько секунд,
// пока открыт чат) — сознательно не realtime, см. комментарий в
// supabase/dating.sql. Требует Premium — переписка платная, лента и
// мэтчи нет (см. комментарий в messages/send).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const validation = await validateRequestAuth(body);

    if (!validation.valid || !validation.telegramId) {
      return NextResponse.json(
        { error: "Invalid Telegram data" },
        { status: 401 }
      );
    }

    const isPremium = await checkIsPremium(validation.telegramId);

    if (!isPremium) {
      return NextResponse.json(
        { ok: false, reason: "premium-required" },
        { status: 403 }
      );
    }

    const matchId = typeof body.matchId === "string" ? body.matchId : "";

    if (!matchId) {
      return NextResponse.json(
        { ok: false, reason: "invalid-match" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc("get_dating_messages", {
      p_match_id: matchId,
      p_telegram_id: validation.telegramId,
    });

    if (error || !data?.ok) {
      return NextResponse.json(
        { ok: false, reason: data?.reason || "internal-error" },
        { status: data?.reason === "not-in-match" ? 403 : 500 }
      );
    }

    return NextResponse.json({ ok: true, messages: data.messages ?? [] });
  } catch (error) {
    console.error("DATING LIST MESSAGES ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
