import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

const supabaseAdmin = createClient(
  supabaseUrl,
  serviceRoleKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

function validateTelegramInitData(
  initData: string
): {
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

    // Не принимаем initData старше 24 часов.
    if (
      !Number.isFinite(authDate) ||
      now - authDate > 86400
    ) {
      return { valid: false };
    }

    const user = JSON.parse(userRaw);
    const telegramId = Number(user.id);

    if (
      !Number.isSafeInteger(telegramId) ||
      telegramId <= 0
    ) {
      return { valid: false };
    }

    return {
      valid: true,
      telegramId,
    };
  } catch {
    return { valid: false };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const initData =
      typeof body.initData === "string"
        ? body.initData
        : "";

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

    const validation = validateTelegramInitData(initData);

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