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

    // Не принимаем initData старше 24 часов.
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

    // pairId сервер достаёт сам — клиент его не присылает. Сама RPC ещё
    // раз проверяет, что telegramId реально состоит в этой паре.
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("pair_id")
      .eq("telegram_id", validation.telegramId)
      .maybeSingle();

    if (profileError) {
      console.error("CLAIM WEEKLY TOP profile lookup error:", profileError);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    if (!profile?.pair_id) {
      return NextResponse.json({ awarded: false, reason: "no-pair" });
    }

    const { data, error } = await supabaseAdmin.rpc(
      "claim_weekly_pair_top_reward",
      {
        p_pair_id: profile.pair_id,
        p_telegram_id: validation.telegramId,
      }
    );

    if (error) {
      console.error("CLAIM_WEEKLY_PAIR_TOP_REWARD RPC ERROR:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("CLAIM WEEKLY TOP ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
