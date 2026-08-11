// Единый источник правды по суммам наград за активность в приложении.
// Используется и клиентом (app/page.tsx — для отображения "+N очков" и
// для полей TESTS/POLLS reward), и сервером (app/api/activity/award —
// чтобы самому считать правильную сумму, а не доверять delta от клиента).
//
// ВАЖНО: если добавляешь новый тест/опрос/игровой шаг — добавь его и
// сюда. Если id есть в контенте, но нет в каталоге (или наоборот),
// awardActivity() на сервере отклонит начисление как invalid-activity.

export const TEST_REWARD = 60;
export const TEST_IDS = [
  "trust-level",
  "love-language",
  "personality-strengths",
] as const;

export const POLL_REWARD = 60;
// 14 тем опросов, каждая даёт пару "boy-<key>"/"girl-<key>" (см. POLL_THEMES
// и POLLS в app/page.tsx).
const POLL_THEME_KEYS = [
  "communication",
  "jealousy",
  "love",
  "conflicts",
  "trust",
  "understanding",
  "romance",
  "space",
  "future",
  "life",
  "roles",
  "fidelity",
  "family",
  "quality-time",
] as const;
export const POLL_IDS = POLL_THEME_KEYS.flatMap((key) => [
  `boy-${key}`,
  `girl-${key}`,
]);

export const COMPLETION_BONUS = 200;

export const GAME_STEP_REWARD = 10;
// Полный набор реально существующих шаговых наград — see app/page.tsx:
// BOTTLE_TASKS (b1..b16), LOVE_QUESTIONS (lq1..lq90), never-have-i-ever
// cards (nh1..nh59), и разовая награда AI-психолога.
const BOTTLE_TASK_IDS = Array.from({ length: 16 }, (_, i) => `b${i + 1}`);
const LOVE_QUESTION_IDS = Array.from({ length: 90 }, (_, i) => `lq${i + 1}`);
const NEVER_HAVE_CARD_IDS = Array.from({ length: 59 }, (_, i) => `nh${i + 1}`);

export const VALID_GAME_STEP_KEYS = new Set<string>([
  "game-ai-psychologist",
  ...BOTTLE_TASK_IDS.map((id) => `bottle:${id}`),
  ...LOVE_QUESTION_IDS.map((id) => `love-questions:${id}`),
  ...NEVER_HAVE_CARD_IDS.map((id) => `never-have:${id}`),
]);

// Дневной бонус: индекс 0 = день 1, ..., индекс 8 = день 9 (дальше цикл).
export const DAILY_BONUS_REWARDS = [
  25, 50, 75, 100, 150, 200, 300, 400, 500,
];

export function getDailyBonusReward(day: number): number {
  const index = Math.max(
    0,
    Math.min(day - 1, DAILY_BONUS_REWARDS.length - 1)
  );
  return DAILY_BONUS_REWARDS[index];
}
