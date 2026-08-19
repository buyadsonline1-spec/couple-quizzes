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

    const actionType =
      body.actionType === "poll"
        ? "poll"
        : body.actionType === "test"
          ? "test"
          : null;

    if (!actionType) {
      return NextResponse.json(
        { error: "Invalid action type" },
        { status: 400 }
      );
    }

    const validation = await validateRequestAuth(body);

    if (!validation.valid || !validation.telegramId) {
      return NextResponse.json(
        { error: "Invalid Telegram data" },
        { status: 401 }
      );
    }

    const telegramId = validation.telegramId;

    const { data: entry, error: entryError } =
      await supabaseAdmin
        .from("giveaway_entries")
        .select(
          "telegram_id, subscription_verified, app_action_verified, referral_count, status, verified_at"
        )
        .eq("telegram_id", telegramId)
        .maybeSingle();

    if (entryError) {
      throw entryError;
    }

    // Пользователь ещё не нажимал «Участвовать».
    if (!entry) {
      return NextResponse.json(
        {
          success: false,
          reason: "not_registered",
        },
        { status: 404 }
      );
    }

    const referralCount = Number(entry.referral_count || 0);

    const tickets = Math.min(
      5,
      1 + referralCount + 1
    );

    const fullyVerified =
      Boolean(entry.subscription_verified);

    const nextStatus =
      entry.status === "blocked" ||
      entry.status === "winner"
        ? entry.status
        : fullyVerified
          ? "verified"
          : "pending";

    const { data: updatedEntry, error: updateError } =
      await supabaseAdmin
        .from("giveaway_entries")
        .update({
          app_action_verified: true,
          tickets,
          status: nextStatus,
          verified_at: fullyVerified
            ? entry.verified_at || new Date().toISOString()
            : null,
        })
        .eq("telegram_id", telegramId)
        .select(
          "telegram_id, app_action_verified, tickets, referral_count, status"
        )
        .single();

    if (updateError) {
      throw updateError;
    }

    // Если приглашённый прошёл действие, сохраняем это и в реферале.
    await supabaseAdmin
      .from("giveaway_referrals")
      .update({
        app_action_verified: true,
      })
      .eq("invited_id", telegramId);

    return NextResponse.json({
      success: true,
      actionType,
      entry: updatedEntry,
    });
  } catch (error) {
    console.error(
      "GIVEAWAY COMPLETE ACTION ERROR:",
      error
    );

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}