import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";
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

    // Telegram Mini App присылает initData; standalone iOS-клиент
    // (Phase 1 плана про App Store) присылает supabaseAccessToken —
    // validateRequestAuth понимает оба и возвращает одинаковый шейп.
    const validation = await validateRequestAuth(body);

    if (!validation.valid || !validation.telegramId) {
      return NextResponse.json(
        { error: "Invalid Telegram data" },
        { status: 401 }
      );
    }

    const telegramId = validation.telegramId;

    // Для Supabase Auth профиль уже создан/обновлён внутри
    // validateRequestAuth (bootstrap_profile_from_auth) — вызывать
    // bootstrap_profile второй раз нельзя (она отклоняет telegramId
    // <= 0, а тут синтетический отрицательный id).
    let profileData: {
      soloPoints?: number;
      soloWeeklyPoints?: number;
      soloWeeklyPointsWeek?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      displayNameCustom?: boolean;
    } = {};

    if (validation.authMethod === "supabase") {
      // validateRequestAuth уже сходил в bootstrap_profile_from_auth —
      // берём готовые данные оттуда вместо пустого объекта, иначе
      // клиент никогда не узнáет сохранённое в profiles имя (в т.ч.
      // кастомный ник) для standalone iOS-аккаунтов.
      profileData = {
        soloPoints: validation.soloPoints,
        soloWeeklyPoints: validation.soloWeeklyPoints,
        soloWeeklyPointsWeek: validation.soloWeeklyPointsWeek,
        firstName: validation.dbFirstName,
        lastName: validation.dbLastName,
        displayNameCustom: validation.displayNameCustom,
      };
    } else {
      // Профиль: та же bootstrap_profile RPC, что и /api/profile/bootstrap
      // (display-поля из initData, никогда из тела запроса) — здесь же
      // получаем soloPoints/soloWeeklyPoints одним вызовом.
      const { data, error: profileError } = await supabaseAdmin.rpc(
        "bootstrap_profile",
        {
          p_telegram_id: telegramId,
          p_first_name: validation.firstName,
          p_last_name: validation.lastName,
          p_username: validation.username,
          p_photo_url: validation.photoUrl,
        }
      );

      if (profileError || !data?.ok) {
        console.error("BOOTSTRAP profile error:", profileError || data);
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 }
        );
      }

      profileData = data;
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
        firstName: profileData.firstName ?? null,
        lastName: profileData.lastName ?? null,
        displayNameCustom: Boolean(profileData.displayNameCustom),
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
