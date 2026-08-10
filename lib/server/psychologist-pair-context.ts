import {
  loadDailyPairHistoryForPair,
  loadPairPollAnswersForPair,
} from "@/lib/server/reads";

// Серверная сводка о паре для AI-психолога (Pair Context, второй проход
// по плану ChatGPT). Строгое правило: только агрегированные данные,
// которые пользователь и так видит в интерфейсе после совместного
// прохождения — никаких сырых ответов партнёра, telegram_id, username
// или внутренних DB id. Модель получает готовую текстовую сводку, а не
// произвольный доступ к БД.

const THEME_TITLES: Record<string, string> = {
  communication: "Общение",
  love: "Любовь",
  conflicts: "Конфликты",
  trust: "Доверие",
  understanding: "Понимание",
  romance: "Романтика",
  space: "Личное пространство",
  future: "Будущее",
  life: "Быт",
  jealousy: "Ревность",
};

const THEME_TITLES_EN: Record<string, string> = {
  communication: "Communication",
  love: "Love",
  conflicts: "Conflicts",
  trust: "Trust",
  understanding: "Understanding",
  romance: "Romance",
  space: "Personal space",
  future: "Future",
  life: "Daily life",
  jealousy: "Jealousy",
};

const COMPATIBILITY_GROUPS = Object.keys(THEME_TITLES);

const PAIR_LEVELS = [
  { level: 1, title: "Новички" },
  { level: 2, title: "Искра" },
  { level: 3, title: "Сближение" },
  { level: 4, title: "Тёплая связь" },
  { level: 5, title: "На одной волне" },
  { level: 6, title: "Сильная пара" },
  { level: 7, title: "Идеальный союз" },
  { level: 8, title: "Легенды любви" },
] as const;

const PAIR_LEVEL_THRESHOLDS = [0, 300, 700, 1200, 1800, 2500, 3500, 5000];

// Тот же алгоритм, что и клиентский calculatePollMatchPercent — сходство
// пары по одной теме опроса, из реальных ответов обоих (poll_submissions),
// не из чего-либо, что клиент мог бы подделать напрямую (эта таблица уже
// server-only на запись, см. /api/poll/submit).
function calculatePollMatchPercent(
  boyAnswers: number[] | undefined,
  girlAnswers: number[] | undefined
): number | null {
  if (!boyAnswers?.length || !girlAnswers?.length) return null;

  const length = Math.min(boyAnswers.length, girlAnswers.length);
  if (!length) return null;

  let total = 0;

  for (let i = 0; i < length; i++) {
    const a = Number(boyAnswers[i]);
    const b = Number(girlAnswers[i]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;

    const diff = Math.abs(a - b);
    total += diff === 0 ? 100 : diff === 1 ? 75 : diff === 2 ? 50 : diff === 3 ? 25 : 0;
  }

  return Math.round(total / length);
}

// Тот же алгоритм, что и клиентский calculateDailyPairStreak — серия
// дней подряд, когда оба партнёра ответили на вопрос дня.
function calculateCurrentStreak(
  history: Array<{
    date: string;
    boyAnswerIndex: number | null;
    girlAnswerIndex: number | null;
  }>
): number {
  const completedDates = history
    .filter((item) => item.boyAnswerIndex !== null && item.girlAnswerIndex !== null)
    .map((item) => item.date)
    .sort((a, b) => b.localeCompare(a));

  if (!completedDates.length) return 0;

  let streak = 1;

  for (let i = 0; i < completedDates.length - 1; i++) {
    const currentDate = new Date(`${completedDates[i]}T00:00:00`);
    currentDate.setDate(currentDate.getDate() - 1);
    const expected = currentDate.toISOString().slice(0, 10);

    if (completedDates[i + 1] === expected) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}

function getPairLevel(totalPoints: number): { level: number; title: string } {
  const safePoints = Math.max(0, totalPoints);
  let current: { level: number; title: string } = PAIR_LEVELS[0];

  for (let i = 0; i < PAIR_LEVELS.length; i++) {
    if (safePoints >= PAIR_LEVEL_THRESHOLDS[i]) {
      current = PAIR_LEVELS[i];
    } else {
      break;
    }
  }

  return current;
}

export type PsychologistPairContext = {
  pairLevel: number;
  pairLevelTitle: string;
  compatibilityPercent: number | null;
  completedPairPolls: number;
  strongestTopics: string[];
  weakestTopics: string[];
  dailyPairStreak: number;
};

export async function buildPsychologistPairContext(
  pairId: string,
  pairTotalPoints: number
): Promise<PsychologistPairContext> {
  const [pairPollAnswers, dailyHistory] = await Promise.all([
    loadPairPollAnswersForPair(pairId),
    loadDailyPairHistoryForPair(pairId),
  ]);

  const themes: Array<{ key: string; title: string; percent: number }> = [];

  for (const group of COMPATIBILITY_GROUPS) {
    const percent = calculatePollMatchPercent(
      pairPollAnswers[`boy-${group}`],
      pairPollAnswers[`girl-${group}`]
    );

    if (percent !== null) {
      themes.push({ key: group, title: THEME_TITLES[group], percent });
    }
  }

  const overallPercent = themes.length
    ? Math.round(themes.reduce((sum, t) => sum + t.percent, 0) / themes.length)
    : null;

  const sortedHigh = [...themes].sort((a, b) => b.percent - a.percent);
  const sortedLow = [...themes].sort((a, b) => a.percent - b.percent);

  const level = getPairLevel(pairTotalPoints);

  return {
    pairLevel: level.level,
    pairLevelTitle: level.title,
    compatibilityPercent: overallPercent,
    completedPairPolls: themes.length,
    strongestTopics: sortedHigh.slice(0, 2).map((t) => t.title),
    weakestTopics: sortedLow.slice(0, 2).map((t) => t.title),
    dailyPairStreak: calculateCurrentStreak(dailyHistory),
  };
}

export function formatPairContextForPrompt(
  context: PsychologistPairContext,
  language: "ru" | "en"
): string {
  if (language === "en") {
    const themeTitlesEn = (keys: string[]) =>
      keys.map((ruTitle) => {
        const entry = Object.entries(THEME_TITLES).find(([, v]) => v === ruTitle);
        return entry ? THEME_TITLES_EN[entry[0]] : ruTitle;
      });

    return `PAIR_CONTEXT

Pair level: ${context.pairLevel} — ${context.pairLevelTitle}
${
  context.compatibilityPercent !== null
    ? `Compatibility: ${context.compatibilityPercent}% (based on ${context.completedPairPolls} shared quiz topics)`
    : "Compatibility: not enough shared quizzes completed yet"
}
${
  context.strongestTopics.length
    ? `Strong areas: ${themeTitlesEn(context.strongestTopics).join(", ")}`
    : ""
}
${
  context.weakestTopics.length
    ? `Areas with more differences: ${themeTitlesEn(context.weakestTopics).join(", ")}`
    : ""
}
Current shared daily streak: ${context.dailyPairStreak} day(s)

Use this only as supporting context. Do not treat these scores as diagnoses or absolute truth. Do not claim you know the partner's motives or feelings beyond what's given here.`;
  }

  return `PAIR_CONTEXT

Уровень пары: ${context.pairLevel} — ${context.pairLevelTitle}
${
  context.compatibilityPercent !== null
    ? `Совместимость: ${context.compatibilityPercent}% (по ${context.completedPairPolls} общим темам опросов)`
    : "Совместимость: пока пройдено недостаточно общих опросов"
}
${
  context.strongestTopics.length
    ? `Сильные темы: ${context.strongestTopics.join(", ")}`
    : ""
}
${
  context.weakestTopics.length
    ? `Темы с наибольшими расхождениями: ${context.weakestTopics.join(", ")}`
    : ""
}
Текущая серия совместных ответов на вопрос дня: ${context.dailyPairStreak} дн.

Используй это только как вспомогательный контекст. Не считай эти цифры диагнозом или абсолютной истиной. Не утверждай, что знаешь мотивы или чувства партнёра сверх того, что здесь дано.`;
}
