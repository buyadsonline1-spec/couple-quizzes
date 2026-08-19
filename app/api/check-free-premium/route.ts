import { NextResponse } from "next/server";
import TelegramBot from "node-telegram-bot-api";
import { supabaseAdmin } from "@/bot/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, {
  polling: false,
});

const RELATIONS_CHANNEL = -1003903610001;
const CQ_CHANNEL = -1003660140515;

const allowedStatuses = ["member", "administrator", "creator"];

const FREE_PREMIUM_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 1 неделя

// Раньше здесь была собственная копия validateTelegramInitData —
// заменено на общий validateRequestAuth (см. app/api/bootstrap/route.ts).
// Сама акция завязана на членство в конкретных Telegram-каналах, поэтому
// она в принципе неприменима к standalone iOS-аккаунтам (Phase 1 плана
// про App Store) — для них ниже отдельная явная ветка вместо попытки
// вызвать Telegram Bot API с синтетическим (несуществующим) telegramId.
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const validation = await validateRequestAuth(body);

    if (!validation.valid || !validation.telegramId) {
      return NextResponse.json(
        { success: false, error: "Invalid Telegram data" },
        { status: 401 }
      );
    }

    if (validation.authMethod === "supabase") {
      return NextResponse.json({
        success: false,
        subscribed: false,
        reason: "telegram_only",
      });
    }

    const telegramId = validation.telegramId;

    console.log("Checking Premium for:", telegramId);

    const relationMember = await bot.getChatMember(RELATIONS_CHANNEL, telegramId);
    const cqMember = await bot.getChatMember(CQ_CHANNEL, telegramId);

    console.log("Relation channel:", relationMember.status);
    console.log("CQ channel:", cqMember.status);

    const subscribed =
      allowedStatuses.includes(relationMember.status) &&
      allowedStatuses.includes(cqMember.status);

    if (!subscribed) {
      return NextResponse.json({
        success: false,
        subscribed: false,
        relationStatus: relationMember.status,
        cqStatus: cqMember.status,
      });
    }

    // Даём 1 неделю, а не бессрочно (раньше expires_at:null + плашка
    // "free_premium" читалась как вечный премиум — реальный срок для
    // этой акции никогда не был реализован). Если у пользователя уже
    // есть активная подписка, которая кончается ПОЗЖЕ, чем через
    // неделю (например, купленная за Stars) — не укорачиваем её и не
    // переименовываем план: только продлеваем до максимума из двух
    // сроков, сохраняя исходный план.
    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("plan, status, expires_at")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    const now = new Date();
    const weekFromNow = new Date(now.getTime() + FREE_PREMIUM_DURATION_MS);

    const existingExpiresAt = existing?.expires_at
      ? new Date(existing.expires_at)
      : null;

    const existingIsActive =
      existing?.status === "active" &&
      existingExpiresAt !== null &&
      existingExpiresAt > now;

    const nextExpiresAt =
      existingIsActive && existingExpiresAt! > weekFromNow
        ? existingExpiresAt!.toISOString()
        : weekFromNow.toISOString();

    const nextPlan = existingIsActive ? existing!.plan : "free_premium";

    const { error } = await supabaseAdmin.from("subscriptions").upsert(
      {
        telegram_id: telegramId,
        plan: nextPlan,
        status: "active",
        expires_at: nextExpiresAt,
        updated_at: now.toISOString(),
      },
      { onConflict: "telegram_id" }
    );

    if (error) {
      console.error("SUPABASE ERROR:", error);

      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    console.log("Premium activated:", telegramId, "until", nextExpiresAt);

    return NextResponse.json({
      success: true,
      subscribed: true,
      expiresAt: nextExpiresAt,
    });
  } catch (error) {
    console.error("FREE PREMIUM ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
