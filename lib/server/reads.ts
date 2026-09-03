import { supabaseAdmin } from "@/lib/server/supabase-admin";

export type SoloProfilePayload = {
  soloPoints: number;
  soloWeeklyPoints: number;
  soloWeeklyPointsWeek: string | null;
};

export async function loadSoloProfileForTelegramId(
  telegramId: number
): Promise<SoloProfilePayload> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("solo_points, solo_weekly_points, solo_weekly_points_week")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (error || !data) {
    return { soloPoints: 0, soloWeeklyPoints: 0, soloWeeklyPointsWeek: null };
  }

  return {
    soloPoints: Number(data.solo_points ?? 0),
    soloWeeklyPoints: Number(data.solo_weekly_points ?? 0),
    soloWeeklyPointsWeek: data.solo_weekly_points_week ?? null,
  };
}

// Серверные копии клиентских read-хелперов (loadPairPollAnswers,
// loadDailyPairAnswersForDate, loadDailyPairHistory из app/page.tsx) —
// используются в /api/bootstrap, чтобы эти чтения больше не шли
// анонимным ключом прямо с клиента.

export async function loadPairPollAnswersForPair(
  pairId: string
): Promise<Record<string, number[]>> {
  const { data, error } = await supabaseAdmin
    .from("poll_submissions")
    .select("poll_id, answers")
    .eq("pair_id", pairId);

  if (error || !data) {
    console.error("loadPairPollAnswersForPair error:", error);
    return {};
  }

  const result: Record<string, number[]> = {};

  for (const row of data) {
    if (row?.poll_id && Array.isArray(row.answers)) {
      result[row.poll_id] = row.answers.map((value: unknown) => Number(value));
    }
  }

  return result;
}

// Для Знакомств: ответы конкретного человека (не пары) — теперь, когда
// /api/poll/submit сохраняет ответы независимо от наличия пары (см.
// allow_solo_poll_submissions.sql), у одиночек тоже есть что читать.
export async function loadPollAnswersForTelegramId(
  telegramId: number
): Promise<Record<string, number[]>> {
  const { data, error } = await supabaseAdmin
    .from("poll_submissions")
    .select("poll_id, answers")
    .eq("telegram_id", telegramId);

  if (error || !data) {
    console.error("loadPollAnswersForTelegramId error:", error);
    return {};
  }

  const result: Record<string, number[]> = {};

  for (const row of data) {
    if (row?.poll_id && Array.isArray(row.answers)) {
      result[row.poll_id] = row.answers.map((value: unknown) => Number(value));
    }
  }

  return result;
}

// Раздельно от poll-ответов — test_submissions хранит результаты
// психологических тестов (Trust Level/Love Language/Personal
// Strengths), нужных для personality summary анкеты Знакомств и
// подсказок для начала переписки (см. lib/server/test-results.ts).
export async function loadTestSubmissionsForTelegramId(
  telegramId: number
): Promise<Array<{ test_id: string; answers: unknown }>> {
  const { data, error } = await supabaseAdmin
    .from("test_submissions")
    .select("test_id, answers")
    .eq("telegram_id", telegramId);

  if (error || !data) {
    console.error("loadTestSubmissionsForTelegramId error:", error);
    return [];
  }

  return data;
}

// Батчем для набора telegram_id сразу (кандидаты/мэтчи), а не по
// одному — тот же принцип, что и с poll_submissions в
// /api/dating/candidates.
export async function loadTestSubmissionsForTelegramIds(
  telegramIds: number[]
): Promise<Map<number, Array<{ test_id: string; answers: unknown }>>> {
  const result = new Map<number, Array<{ test_id: string; answers: unknown }>>();
  if (telegramIds.length === 0) return result;

  const { data, error } = await supabaseAdmin
    .from("test_submissions")
    .select("telegram_id, test_id, answers")
    .in("telegram_id", telegramIds);

  if (error || !data) {
    console.error("loadTestSubmissionsForTelegramIds error:", error);
    return result;
  }

  for (const row of data) {
    if (!row?.telegram_id) continue;
    const existing = result.get(row.telegram_id) ?? [];
    existing.push({ test_id: row.test_id, answers: row.answers });
    result.set(row.telegram_id, existing);
  }

  return result;
}

export type DailyPairAnswerRow = {
  telegram_id: number;
  question_id: string;
  answer_index: number;
};

export async function loadDailyPairAnswersForDateServer(
  pairId: string,
  date: string
): Promise<DailyPairAnswerRow[]> {
  const { data, error } = await supabaseAdmin
    .from("daily_pair_answers")
    .select("telegram_id, question_id, answer_index, created_at")
    .eq("pair_id", pairId)
    .eq("answer_date", date)
    .order("created_at", { ascending: true });

  if (error || !data) {
    console.error("loadDailyPairAnswersForDateServer error:", error);
    return [];
  }

  return data.map((row) => ({
    telegram_id: Number(row.telegram_id),
    question_id: String(row.question_id),
    answer_index: Number(row.answer_index),
  }));
}

export type DailyPairHistoryItem = {
  date: string;
  questionId: string;
  boyAnswerIndex: number | null;
  girlAnswerIndex: number | null;
};

export async function loadDailyPairHistoryForPair(
  pairId: string
): Promise<DailyPairHistoryItem[]> {
  const { data, error } = await supabaseAdmin
    .from("daily_pair_answers")
    .select("answer_date, question_id, telegram_id, answer_index, created_at")
    .eq("pair_id", pairId)
    .order("answer_date", { ascending: false })
    .order("created_at", { ascending: true });

  if (error || !data) {
    console.error("loadDailyPairHistoryForPair error:", error);
    return [];
  }

  const grouped = new Map<string, DailyPairHistoryItem>();

  for (const row of data) {
    const key = String(row.answer_date);

    if (!grouped.has(key)) {
      grouped.set(key, {
        date: key,
        questionId: String(row.question_id),
        boyAnswerIndex: null,
        girlAnswerIndex: null,
      });
    }

    const item = grouped.get(key)!;

    if (item.boyAnswerIndex === null) {
      item.boyAnswerIndex = Number(row.answer_index);
    } else if (item.girlAnswerIndex === null) {
      item.girlAnswerIndex = Number(row.answer_index);
    }
  }

  return Array.from(grouped.values());
}
