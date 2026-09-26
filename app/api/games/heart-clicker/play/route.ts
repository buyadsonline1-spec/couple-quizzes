import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";
import { checkIsPremium } from "@/lib/server/pair-state";

// Кликер с сердечком — Premium-only игра (заменила "Я никогда не..." в
// списке, см. GAMES в app/page.tsx). Клиент присылает только taps
// (сколько раз реально тапнул за раунд) — цену за тап, потолок тапов
// на раунд и дневной лимит раундов считает исключительно RPC
// (play_heart_clicker_round, см. supabase/heart_clicker_game.sql),
// клиентскому числу тапов не доверяем, оно только клэмпится.

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

    const taps = typeof body.taps === "number" ? Math.trunc(body.taps) : 0;

    const { data, error } = await supabaseAdmin.rpc("play_heart_clicker_round", {
      p_telegram_id: validation.telegramId,
      p_taps: taps,
    });

    if (error) {
      console.error("PLAY_HEART_CLICKER_ROUND RPC ERROR:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("HEART CLICKER PLAY ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
