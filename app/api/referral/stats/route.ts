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

    const validation = await validateRequestAuth(body);

    if (!validation.valid || !validation.telegramId) {
      return NextResponse.json(
        { error: "Invalid Telegram data" },
        { status: 401 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("referrals")
      .select("invited_telegram_id,reward_points")
      .eq("inviter_telegram_id", validation.telegramId);

    if (error) {
      console.error("REFERRAL STATS ERROR:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    const rows = data ?? [];

    return NextResponse.json({
      invitedUsers: rows.map((r) => String(r.invited_telegram_id)),
      totalReward: rows.reduce((sum, r) => sum + (r.reward_points ?? 0), 0),
    });
  } catch (error) {
    console.error("REFERRAL STATS ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
