import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";
import { getCurrentWeekKey } from "@/lib/server/week-key";
import {
  TEST_REWARD,
  TEST_IDS,
  REQUIRED_TEST_COUNT,
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

type ActivityType = "test" | "poll" | "game" | "game-step" | "completion";

// Сумму (delta) и сам reward_key определяет ТОЛЬКО сервер по этой таблице —
// клиент присылает лишь activityType+id, никогда явно сумму. Так даже
// прямой вызов этого API (в обход UI) ограничен конечным набором реально
// существующих активностей с их настоящей ценой, а не произвольным числом.
// sync-quiz (pair_quiz_duel.sql) награждает за каждый вопрос дуэли
// ключом "sync-quiz:<duelId>:<position>" — duelId случайный uuid на
// каждую дуэль, его нельзя перечислить заранее как bottle:b1..b16 и
// т.п. Вместо статического списка проверяем формат здесь и реальное
// состояние дуэли в БД ниже (resolveReward сам ничего не трогает в
// базе — только резолвит, что именно проверять).
const SYNC_QUIZ_STEP_KEY = /^sync-quiz:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([0-5])$/i;

function resolveReward(
  activityType: ActivityType,
  id: string
): { rewardKey: string; delta: number; syncQuizCheck?: { duelId: string; position: number } } | null {
  if (activityType === "test") {
    if (!TEST_IDS.includes(id as (typeof TEST_IDS)[number])) return null;
    return { rewardKey: `test:${id}`, delta: TEST_REWARD };
  }

  if (activityType === "poll") {
    if (!POLL_IDS.includes(id)) return null;
    return { rewardKey: `poll:${id}`, delta: POLL_REWARD };
  }

  if (activityType === "game-step") {
    const syncQuizMatch = id.match(SYNC_QUIZ_STEP_KEY);
    if (syncQuizMatch) {
      return {
        rewardKey: `game-step:${id}`,
        delta: GAME_STEP_REWARD,
        syncQuizCheck: { duelId: syncQuizMatch[1], position: Number(syncQuizMatch[2]) },
      };
    }

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

    let pairId = profile?.pair_id ?? null;

    // pair_id появляется на профиле уже в момент создания пары — ДО
    // того, как партнёр реально подключился (см. hasPairCreated vs
    // hasFullPair в PairScreen). Если передать такой pair_id в
    // award_activity_points как есть, очки пары (pairs.total_points,
    // "Уровень пары") начнут расти у пары, где по факту участвует
    // только один человек — что и происходило до этой проверки.
    // Личные solo_points при этом всё равно начисляются нормально
    // (award_activity_points сам решает, что делать без pair_id).
    if (pairId) {
      const { data: pairRow, error: pairError } = await supabaseAdmin
        .from("pairs")
        .select("partner_2_telegram_id")
        .eq("id", pairId)
        .maybeSingle();

      if (pairError) {
        console.error("ACTIVITY AWARD pair lookup error:", pairError);
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 }
        );
      }

      if (!pairRow?.partner_2_telegram_id) {
        pairId = null;
      }
    }

    // sync-quiz: duelId непредсказуем, поэтому нельзя доверять одному
    // только формату ключа (иначе любой мог бы прислать
    // "sync-quiz:<случайный-uuid>:0" и фармить очки бесконечно) —
    // проверяем, что дуэль реально принадлежит паре звонящего и что
    // на эту позицию реально ответили ОБА (т.е. reveal уже наступил).
    if (resolved.syncQuizCheck) {
      const { duelId, position } = resolved.syncQuizCheck;

      const { data: duelRow, error: duelError } = await supabaseAdmin
        .from("pair_quiz_duels")
        .select("pair_id")
        .eq("id", duelId)
        .maybeSingle();

      if (duelError) {
        console.error("ACTIVITY AWARD sync-quiz duel lookup error:", duelError);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
      }

      if (!duelRow || !pairId || duelRow.pair_id !== pairId) {
        return NextResponse.json({ awarded: false, reason: "invalid-activity" }, { status: 400 });
      }

      const { count, error: answerCountError } = await supabaseAdmin
        .from("pair_quiz_duel_answers")
        .select("telegram_id", { count: "exact", head: true })
        .eq("duel_id", duelId)
        .eq("question_position", position);

      if (answerCountError) {
        console.error("ACTIVITY AWARD sync-quiz answers count error:", answerCountError);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
      }

      if ((count ?? 0) < 2) {
        return NextResponse.json({ awarded: false, reason: "not-revealed-yet" }, { status: 400 });
      }
    }

    // "completion" дополнительно проверяем: реально ли пройдены ВСЕ
    // позиции этого типа (не просто локальный флаг с устройства).
    if (activityType === "completion") {
      const prefix = id === "polls" ? "poll:" : "test:";
      const requiredCount = id === "polls" ? POLL_IDS.length : REQUIRED_TEST_COUNT;

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
