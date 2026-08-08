import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Валидация initData и клиент service-role — тот же паттерн, что и в
// app/api/giveaway/complete-action/route.ts и app/api/rewards/spin/route.ts,
// намеренно без изменений.

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!botToken) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set");
}

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL is not set");
}

if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Возвращает не только telegramId, но и start_param — оба значения идут
// из ОДНОЙ подписанной initData, поэтому referrerTelegramId (из start_param
// вида "ref_<id>") настолько же надёжен, насколько сам telegramId. Клиент
// никогда не присылает referrerTelegramId/invitedTelegramId напрямую —
// иначе можно было бы вызвать claim с любыми двумя существующими
// telegram_id и приписать себе чужое приглашение.
function validateTelegramInitData(initData: string): {
  valid: boolean;
  telegramId?: number;
  startParam?: string;
} {
  try {
    const params = new URLSearchParams(initData);

    const receivedHash = params.get("hash");
    const authDateRaw = params.get("auth_date");
    const userRaw = params.get("user");
    const startParam = params.get("start_param") ?? undefined;

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

    // Не принимаем initData старше 24 часов.
    if (!Number.isFinite(authDate) || now - authDate > 86400) {
      return { valid: false };
    }

    const user = JSON.parse(userRaw);
    const telegramId = Number(user.id);

    if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
      return { valid: false };
    }

    return { valid: true, telegramId, startParam };
  } catch {
    return { valid: false };
  }
}

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

    const initData = typeof body.initData === "string" ? body.initData : "";

    const validation = validateTelegramInitData(initData);

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
