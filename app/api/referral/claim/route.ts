import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";
import { getCurrentWeekKey } from "@/lib/server/week-key";

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

    const startParam = validation.startParam ?? "";

    // Автоматический путь (Telegram): referrerTelegramId идёт из
    // криптографически подписанного start_param, подделать нельзя.
    // Запасной путь (в первую очередь iOS, где start_param в принципе
    // не существует — см. комментарий у TelegramInitDataValidation.
    // startParam) — приглашённый вручную вводит код друга (см. ручной
    // ввод в ReferralsScreen). "Код" — это просто telegram_id
    // реферера (может быть отрицательным синтетическим id для
    // iOS-пользователя, см. bootstrap_profile_from_auth), поэтому
    // здесь разрешаем любой ненулевой safe integer, а не только > 0.
    const manualCode =
      typeof body.referrerCode === "string" ? body.referrerCode.trim() : "";

    let referrerTelegramId: number;

    if (startParam.startsWith("ref_")) {
      referrerTelegramId = Number(startParam.replace("ref_", ""));
    } else if (manualCode) {
      referrerTelegramId = Number(manualCode);
    } else {
      return NextResponse.json({ ok: false, reason: "no-referral" });
    }

    if (!Number.isSafeInteger(referrerTelegramId) || referrerTelegramId === 0) {
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
