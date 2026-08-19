import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";
import {
  TEST_REWARD,
  TEST_IDS,
  POLL_REWARD,
  POLL_IDS,
  COMPLETION_BONUS,
  GAME_STEP_REWARD,
  VALID_GAME_STEP_KEYS,
} from "@/config/reward-catalog";

// Раньше здесь была собственная копия validateTelegramInitData —
// из-за этого endpoint не понимал Supabase-сессию standalone
// iOS-клиента (Phase 1 плана про App Store), только Telegram
// initData. Переведено на общий validateRequestAuth (см.
// app/api/bootstrap/route.ts) — понимает оба источника, для
// Telegram-пути поведение не меняется.

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

    const activityType = body.activityType as ActivityType;
    const id = typeof body.id === "string" ? body.id : "";

    const validation = await validateRequestAuth(body);

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
