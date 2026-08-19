import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

// Раньше здесь была собственная копия validateTelegramInitData —
// из-за этого endpoint не понимал Supabase-сессию standalone
// iOS-клиента (Phase 1 плана про App Store), только Telegram
// initData. Переведено на общий validateRequestAuth (см.
// app/api/bootstrap/route.ts) — понимает оба источника, для
// Telegram-пути поведение не меняется.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Только "предложение" — реально используется лишь один раз, пока
    // reward_market ещё не выбран и не заблокирован (см. RPC). Подмена
    // этого поля не даёт финансового преимущества: она может изменить
    // только страну/валюту приза, а не его ценность или списываемую сумму.
    const suggestedMarket =
      body.suggestedMarket === "en" ||
      body.suggestedMarket === "ru" ||
      body.suggestedMarket === "fi"
        ? body.suggestedMarket
        : null;

    const validation = await validateRequestAuth(body);

    if (!validation.valid || !validation.telegramId) {
      return NextResponse.json(
        { error: "Invalid Telegram data" },
        { status: 401 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc(
      "spin_reward_wheel",
      {
        p_telegram_id: validation.telegramId,
        p_suggested_market: suggestedMarket,
      }
    );

    if (error) {
      console.error("SPIN_REWARD_WHEEL RPC ERROR:", error);

      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("REWARDS SPIN ERROR:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
