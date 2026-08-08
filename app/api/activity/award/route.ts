import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  TEST_REWARD,
  TEST_IDS,
  POLL_REWARD,
  POLL_IDS,
  COMPLETION_BONUS,
  GAME_STEP_REWARD,
  VALID_GAME_STEP_KEYS,
} from "@/config/reward-catalog";

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

function getCurrentWeekKey(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
  const week = Math.ceil(dayOfYear / 7);
  return `${now.getFullYear()}-W${week}`;
}

type ActivityType = "test" | "poll" | "game" | "game-step" | "completion";

// Сумму (delta) и сам reward_key определяет ТОЛЬКО сервер по этой таблице —
// клиент присылает лишь activityType+id, никогда явно сумму. Так даже
// прямой вызов этого API (в обход UI) ограничен конечным набором реально
// существующих активностей с их настоящей ценой, а не произвольным числом.
function resolveReward(
  activityType: ActivityType,
  id: string
): { rewardKey: string; delta: number } | null {
  if (activityType === "test") {
    if (!TEST_IDS.includes(id as (typeof TEST_IDS)[number])) return null;
    return { rewardKey: `test:${id}`, delta: TEST_REWARD };
  }

  if (activityType === "poll") {
    if (!POLL_IDS.includes(id)) return null;
    return { rewardKey: `poll:${id}`, delta: POLL_REWARD };
  }

  if (activityType === "game-step") {
    if (!VALID_GAME_STEP_KEYS.has(id)) return null;
    return { rewardKey: `game-step:${id}`, delta: GAME_STEP_REWARD };
  }

  if (activityType === "game") {
    // Сейчас у всех игр в каталоге reward = 0 (пошаговые награды идут
    // через "game-step"). Оставляем ветку на будущее, но пока всегда
    // отклоняем — начислять нечего.
    return null;
  }

  if (activityType === "completion") {
    if (id !== "polls" && id !== "tests") return null;
    return { rewardKey: `completion:${id}`, delta: COMPLETION_BONUS };
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const initData = typeof body.initData === "string" ? body.initData : "";
    const activityType = body.activityType as ActivityType;
    const id = typeof body.id === "string" ? body.id : "";

    const validation = validateTelegramInitData(initData);

    if (!validation.valid || !validation.telegramId) {
      return NextResponse.json(
        { error: "Invalid Telegram data" },
        { status: 401 }
      );
    }

    const resolved = resolveReward(activityType, id);

    if (!resolved) {
      return NextResponse.json(
        { awarded: false, reason: "invalid-activity" },
        { status: 400 }
      );
    }

    // pairId сервер достаёт сам из профиля — клиент его не присылает.
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("pair_id")
      .eq("telegram_id", validation.telegramId)
      .maybeSingle();

    if (profileError) {
      console.error("ACTIVITY AWARD profile lookup error:", profileError);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    const pairId = profile?.pair_id ?? null;

    // "completion" дополнительно проверяем: реально ли пройдены ВСЕ
    // позиции этого типа (не просто локальный флаг с устройства).
    if (activityType === "completion") {
      const prefix = id === "polls" ? "poll:" : "test:";
      const requiredCount = id === "polls" ? POLL_IDS.length : TEST_IDS.length;

      const { count, error: countError } = await supabaseAdmin
        .from("activity_point_claims")
        .select("reward_key", { count: "exact", head: true })
        .eq("telegram_id", validation.telegramId)
        .like("reward_key", `${prefix}%`);

      if (countError) {
        console.error("ACTIVITY AWARD completion count error:", countError);
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 }
        );
      }

      if ((count ?? 0) < requiredCount) {
        return NextResponse.json({
          awarded: false,
          reason: "not-all-completed",
        });
      }
    }

    const { data, error } = await supabaseAdmin.rpc("award_activity_points", {
      p_telegram_id: validation.telegramId,
      p_pair_id: pairId,
      p_reward_key: resolved.rewardKey,
      p_delta: resolved.delta,
      p_week_key: getCurrentWeekKey(),
    });

    if (error) {
      console.error("AWARD_ACTIVITY_POINTS RPC ERROR:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("ACTIVITY AWARD ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
