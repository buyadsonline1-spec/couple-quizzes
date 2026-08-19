import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

// Раньше здесь была собственная копия validateTelegramInitData (тот же
// паттерн, что в giveaway/complete-action и rewards/spin) — из-за этого
// endpoint не понимал Supabase-сессию standalone iOS-клиента (Phase 1
// плана про App Store): шимованный initData ("supabase-token:<jwt>")
// не проходил Telegram-HMAC-проверку и бонус не начислялся. Переведено
// на общий validateRequestAuth (см. app/api/bootstrap/route.ts) —
// понимает оба источника, для Telegram-пути поведение не меняется.

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

    // Какой сейчас день серии и сколько это стоит — целиком определяет
    // сама RPC-функция по profiles.daily_bonus_streak_day/last_claim_date,
    // а не клиент. См. supabase/daily_bonus_server_side.sql.
    const { data, error } = await supabaseAdmin.rpc("claim_daily_bonus", {
      p_telegram_id: validation.telegramId,
    });

    if (error) {
      console.error("CLAIM_DAILY_BONUS RPC ERROR:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("DAILY BONUS ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
