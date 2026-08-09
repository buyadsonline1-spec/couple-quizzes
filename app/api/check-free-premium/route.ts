import crypto from "crypto";
import { NextResponse } from "next/server";
import TelegramBot from "node-telegram-bot-api";
import { supabaseAdmin } from "@/bot/supabase-admin";

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, {
  polling: false,
});

const RELATIONS_CHANNEL = -1003903610001;
const CQ_CHANNEL = -1003660140515;

const allowedStatuses = ["member", "administrator", "creator"];

const FREE_PREMIUM_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 1 неделя

const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set");
}

// telegramId раньше принимался прямо из тела запроса, без всякой
// проверки — можно было дёрнуть эндпоинт с произвольным чужим
// telegramId. Теперь берём его только из подписанного initData, тем
// же паттерном, что и в остальных app/api/*/route.ts.
function validateTelegramInitData(initData: string): {
  valid: boolean;
  telegramId?: number;
} {
  try {
    const params = new URLSearchParams(initData);

    const receivedHash = params.get("hash");
    const authDateRaw = params.get("auth_date");
    const userRaw = params.get("user");

    if (!receivedHash || !authDateRaw || !userRaw) {
      return { valid: false };
    }

    params.delete("hash");

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken!)
      .digest();

    const calculatedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    const receivedBuffer = Buffer.from(receivedHash, "hex");
    const calculatedBuffer = Buffer.from(calculatedHash, "hex");

    if (
      receivedBuffer.length !== calculatedBuffer.length ||
      !crypto.timingSafeEqual(receivedBuffer, calculatedBuffer)
    ) {
      return { valid: false };
    }

    const authDate = Number(authDateRaw);
    const now = Math.floor(Date.now() / 1000);

    if (!Number.isFinite(authDate) || now - authDate > 86400) {
      return { valid: false };
    }

    const user = JSON.parse(userRaw);
    const telegramId = Number(user.id);

    if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
      return { valid: false };
    }

    return { valid: true, telegramId };
  } catch {
    return { valid: false };
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const initData = typeof body.initData === "string" ? body.initData : "";

    const validation = validateTelegramInitData(initData);

    if (!validation.valid || !validation.telegramId) {
      return NextResponse.json(
        { success: false, error: "Invalid Telegram data" },
        { status: 401 }
      );
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
