import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";
import { checkIsPremium } from "@/lib/server/pair-state";

// Бесплатный буст (30 минут) раз в 7 дней — только для Premium
// (см. claim_free_dating_boost для проверки самого срока давности).
// Платные тарифы буста покупаются через Stars-инвойс и начисляются
// ботом (bot/bot.ts, successful_payment), не этим роутом.
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

    const { data, error } = await supabaseAdmin.rpc("claim_free_dating_boost", {
      p_telegram_id: validation.telegramId,
    });

    if (error || !data?.ok) {
      return NextResponse.json(
        { ok: false, reason: data?.reason || "internal-error", nextAvailableAt: data?.nextAvailableAt ?? null },
        { status: data?.reason === "no-profile" ? 400 : data?.reason === "not-eligible" ? 409 : 500 }
      );
    }

    return NextResponse.json({ ok: true, boostedUntil: data.boostedUntil });
  } catch (error) {
    console.error("DATING FREE BOOST ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
