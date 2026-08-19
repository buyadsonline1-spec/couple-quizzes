import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

// Раньше здесь была собственная копия validateTelegramInitData —
// из-за этого endpoint не понимал Supabase-сессию standalone
// iOS-клиента (Phase 1 плана про App Store), только Telegram
// initData. Переведено на общий validateRequestAuth (см.
// app/api/bootstrap/route.ts) — понимает оба источника, для
// Telegram-пути поведение не меняется.

// Единственный реально используемый activityType сейчас — "test" (1
// бесплатный тест в день для не-Premium). Опросы гейтятся по темам
// (isFreePoll), у игр лимита нет — см. комментарий в
// supabase/pairs_profiles_server_side.sql.
type DailyLimitActivityType = "test";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const activityType = body.activityType as DailyLimitActivityType;

    const validation = await validateRequestAuth(body);

    if (!validation.valid || !validation.telegramId) {
      return NextResponse.json(
        { error: "Invalid Telegram data" },
        { status: 401 }
      );
    }

    if (activityType !== "test") {
      return NextResponse.json(
        { ok: false, reason: "invalid-activity-type" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc("consume_daily_access", {
      p_telegram_id: validation.telegramId,
      p_activity_type: activityType,
    });

    if (error) {
      console.error("CONSUME_DAILY_ACCESS RPC ERROR:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("CONSUME DAILY LIMIT ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
