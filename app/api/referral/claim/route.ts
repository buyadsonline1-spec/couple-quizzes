import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

// Раньше здесь была собственная копия validateTelegramInitData —
// из-за этого endpoint не понимал Supabase-сессию standalone
// iOS-клиента (Phase 1 плана про App Store), только Telegram
// initData. Переведено на общий validateRequestAuth (см.
// app/api/bootstrap/route.ts) — понимает оба источника, для
// Telegram-пути поведение не меняется.

function getCurrentWeekKey(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
  const week = Math.ceil(dayOfYear / 7);
  return `${now.getFullYear()}-W${week}`;
}

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

    const startParam = validation.startParam ?? "";

    if (!startParam.startsWith("ref_")) {
      return NextResponse.json({ ok: false, reason: "no-referral" });
    }

    const referrerTelegramId = Number(startParam.replace("ref_", ""));

    if (!Number.isSafeInteger(referrerTelegramId) || referrerTelegramId <= 0) {
      return NextResponse.json({ ok: false, reason: "invalid-referrer" });
    }

    const invitedTelegramId = validation.telegramId;

    if (referrerTelegramId === invitedTelegramId) {
      return NextResponse.json({ ok: false, reason: "self-referral" });
    }

    const { data, error } = await supabaseAdmin.rpc(
      "claim_referral_reward_points",
      {
        p_referrer_telegram_id: referrerTelegramId,
        p_invited_telegram_id: invitedTelegramId,
        p_week_key: getCurrentWeekKey(),
      }
    );

    if (error) {
      console.error("CLAIM_REFERRAL_REWARD_POINTS RPC ERROR:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("REFERRAL CLAIM ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
