import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

// Акция "3 друга -> Premium на месяц" (11-25.10.2026, см.
// supabase/referral_promo_oct2026.sql). claim_referral_promo_premium
// только проверяет условие и фиксирует идемпотентный клейм — сам
// грант Premium (апдейт subscriptions) делаем здесь, тем же приёмом,
// что и в app/api/check-free-premium: продлеваем до максимума из
// текущего срока и +30 дней, никогда не укорачивая уже купленную
// подписку.
const PROMO_PREMIUM_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

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

    const telegramId = validation.telegramId;

    const { data, error } = await supabaseAdmin.rpc("claim_referral_promo_premium", {
      p_telegram_id: telegramId,
    });

    if (error) {
      console.error("CLAIM_REFERRAL_PROMO_PREMIUM RPC ERROR:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    if (!data?.ok) {
      return NextResponse.json(data);
    }

    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("plan, status, expires_at")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    const now = new Date();
    const monthFromNow = new Date(now.getTime() + PROMO_PREMIUM_DURATION_MS);

    const existingExpiresAt = existing?.expires_at ? new Date(existing.expires_at) : null;
    const existingIsActive =
      existing?.status === "active" && existingExpiresAt !== null && existingExpiresAt > now;

    const nextExpiresAt =
      existingIsActive && existingExpiresAt! > monthFromNow
        ? existingExpiresAt!.toISOString()
        : monthFromNow.toISOString();

    const nextPlan = existingIsActive ? existing!.plan : "referral_promo";

    const { error: subError } = await supabaseAdmin.from("subscriptions").upsert(
      {
        telegram_id: telegramId,
        plan: nextPlan,
        status: "active",
        expires_at: nextExpiresAt,
        updated_at: now.toISOString(),
      },
      { onConflict: "telegram_id" }
    );

    if (subError) {
      console.error("REFERRAL PROMO subscription upsert error:", subError);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    return NextResponse.json({ ...data, expiresAt: nextExpiresAt });
  } catch (error) {
    console.error("REFERRAL PROMO CLAIM ERROR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
