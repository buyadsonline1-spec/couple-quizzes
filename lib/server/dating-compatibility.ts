// Серверный порт алгоритма совместимости из app/page.tsx
// (calculatePollMatchPercent + групп тем из buildCompatibilityProfile).
// Оригинал живёт в клиентском компоненте и сравнивает ответы ВНУТРИ
// одной пары (boy-theme против girl-theme одного pairId). Здесь та же
// математика применяется между ДВУМЯ ЛЮБЫМИ людьми — poll_submissions
// теперь хранит ответы по telegram_id независимо от пары (см.
// allow_solo_poll_submissions.sql), так что у каждого дейтера есть
// собственный набор "boy-communication"/"girl-communication" и т.д.,
// tagged его собственным полом — сравниваем их напрямую, той же
// функцией, что и для существующих пар.
//
// Сознательно НЕ переиспользует функцию из app/page.tsx напрямую —
// это клиентский компонент ("use client"), импортировать его в
// серверный route было бы архитектурно грязно. Держим одну и ту же
// математику в двух местах — если поменяется формула скоринга, нужно
// поменять в обоих; так и должно быть, пока это остаётся мелкой
// чистой функцией без внешних зависимостей.

const COMPATIBILITY_THEME_GROUPS = [
  "communication",
  "love",
  "conflicts",
  "trust",
  "understanding",
  "romance",
  "space",
  "future",
  "life",
  "jealousy",
  "roles",
  "fidelity",
  "family",
  "quality-time",
];

// Психологические тесты (не парные опросы) тоже считаются точками
// сравнения — тот же результат, где оба ответили ближе, даёт более
// высокую совместимость по этому "тесту", ровно как и с темами
// опросов ниже. ID совпадают с TESTS в app/page.tsx.
const COMPATIBILITY_TEST_IDS = [
  "trust-level",
  "love-language",
  "personality-strengths",
];

function calculatePollMatchPercent(
  answersA: number[] | undefined,
  answersB: number[] | undefined
): number | null {
  if (!answersA || !answersB) return null;
  if (!answersA.length || !answersB.length) return null;

  const length = Math.min(answersA.length, answersB.length);
  if (!length) return null;

  let total = 0;

  for (let i = 0; i < length; i++) {
    const a = Number(answersA[i]);
    const b = Number(answersB[i]);

    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;

    const diff = Math.abs(a - b);

    let score = 0;
    if (diff === 0) score = 100;
    else if (diff === 1) score = 75;
    else if (diff === 2) score = 50;
    else if (diff === 3) score = 25;
    else score = 0;

    total += score;
  }

  return Math.round(total / length);
}

// test_submissions.answers приходит как unknown (jsonb) — приводим к
// { test_id -> number[] } тем же способом, что и для ответов опросов,
// чтобы calculateDatingCompatibility могла сравнить тесты той же
// формулой. Общий helper — используется и в candidates, и в likes.
export function toTestAnswersMap(
  submissions: Array<{ test_id: string; answers: unknown }>
): Record<string, number[]> {
  const map: Record<string, number[]> = {};
  for (const row of submissions) {
    if (!row?.test_id || !Array.isArray(row.answers)) continue;
    map[row.test_id] = row.answers.map((v) => Number(v));
  }
  return map;
}

export type DatingCompatibilityResult = {
  overallPercent: number;
  completedThemes: number;
  totalThemes: number;
};

export function calculateDatingCompatibility(
  answersA: Record<string, number[]>,
  genderA: "boy" | "girl",
  answersB: Record<string, number[]>,
  genderB: "boy" | "girl",
  // Ответы психологических тестов (test_id -> answers), опциональны —
  // старые вызовы без них продолжают работать, просто без вклада
  // тестов в скор (только опросы).
  testAnswersA?: Record<string, number[]>,
  testAnswersB?: Record<string, number[]>
): DatingCompatibilityResult {
  const themeScores: number[] = [];

  for (const group of COMPATIBILITY_THEME_GROUPS) {
    const percent = calculatePollMatchPercent(
      answersA[`${genderA}-${group}`],
      answersB[`${genderB}-${group}`]
    );

    if (percent !== null) {
      themeScores.push(percent);
    }
  }

  if (testAnswersA && testAnswersB) {
    for (const testId of COMPATIBILITY_TEST_IDS) {
      const percent = calculatePollMatchPercent(
        testAnswersA[testId],
        testAnswersB[testId]
      );

      if (percent !== null) {
        themeScores.push(percent);
      }
    }
  }

  const overallPercent = themeScores.length
    ? Math.round(
        themeScores.reduce((sum, value) => sum + value, 0) / themeScores.length
      )
    : 0;

  return {
    overallPercent,
    completedThemes: themeScores.length,
    totalThemes: COMPATIBILITY_THEME_GROUPS.length + COMPATIBILITY_TEST_IDS.length,
  };
}
