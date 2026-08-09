import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateTelegramInitData } from "@/lib/server/telegram-auth";
import { checkIsPremium, loadPairStateForTelegramId } from "@/lib/server/pair-state";
import {
  loadDailyPairAnswersForDateServer,
  loadDailyPairHistoryForPair,
  loadPairPollAnswersForPair,
} from "@/lib/server/reads";

// Единая точка входа при старте приложения — заменяет россыпь прямых
// клиентских supabase.from(...).select(...) по profiles/pairs/
// subscriptions/daily_pair_answers/poll_submissions одним
// авторизованным запросом. Согласовано с ChatGPT: это последний шаг
// перед тем, как эти таблицы можно будет закрыть на SELECT для
// anon/authenticated (см. supabase/bootstrap_reads_lockdown.sql —
// применяется отдельно, после деплоя и проверки).

function todayInHelsinki(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Helsinki",
  });
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

    const telegramId = validation.telegramId;

    // Профиль: та же bootstrap_profile RPC, что и /api/profile/bootstrap
    // (display-поля из initData, никогда из тела запроса) — здесь же
    // получаем soloPoints/soloWeeklyPoints одним вызовом.
    const { data: profileData, error: profileError } = await supabaseAdmin.rpc(
      "bootstrap_profile",
      {
        p_telegram_id: telegramId,
        p_first_name: validation.firstName,
        p_last_name: validation.lastName,
        p_username: validation.username,
        p_photo_url: validation.photoUrl,
      }
    );

    if (profileError || !profileData?.ok) {
      console.error("BOOTSTRAP profile error:", profileError || profileData);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    const [isPremium, pair] = await Promise.all([
      checkIsPremium(telegramId),
      loadPairStateForTelegramId(telegramId),
    ]);

    let pairPollAnswers: Record<string, number[]> = {};
    let dailyPairToday: Awaited<
      ReturnType<typeof loadDailyPairAnswersForDateServer>
    > = [];
    let dailyPairHistory: Awaited<
      ReturnType<typeof loadDailyPairHistoryForPair>
    > = [];

    if (pair.pairId) {
      const today = todayInHelsinki();

      [pairPollAnswers, dailyPairToday, dailyPairHistory] = await Promise.all([
        loadPairPollAnswersForPair(pair.pairId),
        loadDailyPairAnswersForDateServer(pair.pairId, today),
        loadDailyPairHistoryForPair(pair.pairId),
      ]);
    }

    return NextResponse.json({
      ok: true,
      profile: {
        telegramId,
        soloPoints: Number(profileData.soloPoints ?? 0),
        soloWeeklyPoints: Number(profileData.soloWeeklyPoints ?? 0),
        soloWeeklyPointsWeek: profileData.soloWeeklyPointsWeek ?? null,
      },
      isPremium,
      pair,
      pairPollAnswers,
      dailyPair: {
        today: dailyPairToday,
        history: dailyPairHistory,
      },
    });
  } catch (error) {
    console.error("BOOTSTRAP ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
