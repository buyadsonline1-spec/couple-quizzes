// Серверный порт чистых функций getScaleResult/getLoveLanguageResult/
// getPersonalityResult из app/page.tsx (там они считают результат теста
// на клиенте по сырым индексам ответов, чтобы показать TestResult сразу
// после прохождения). Дублируем логику здесь намеренно — там она внутри
// клиентского компонента и завязана на TestResult/локальный UI, а нам
// нужна только "какой лейбл получился" на сервере (для personality
// summary анкеты Знакомств и для подсказок начала переписки). Держать в
// одном месте не получится без большого рефакторинга общего кода между
// клиентом и сервером — при правке одной стороны проверяй другую.
//
// Тройка тестов и их id — см. TESTS в app/page.tsx (trust-level,
// love-language, personality-strengths). Новый тест в TESTS = новая
// строка в TEST_KIND_BY_ID здесь, иначе его результат просто не попадёт
// в personality summary/icebreakers (не сломается — молча проигнорится).

type TestKind = "scale" | "love-language" | "personality";

const TEST_KIND_BY_ID: Record<string, TestKind> = {
  "trust-level": "scale",
  "love-language": "love-language",
  "personality-strengths": "personality",
};

const TRUST_LEVEL_LABELS = [
  "Низкий уровень доверия",
  "Средний уровень доверия",
  "Высокий уровень доверия",
];

function scaleLabel(answers: number[]): string {
  const totalScore = answers.reduce((sum, value) => sum + value, 0);
  const maxScore = answers.length * 4;
  const ratio = maxScore > 0 ? totalScore / maxScore : 0;

  if (ratio < 0.45) return TRUST_LEVEL_LABELS[0];
  if (ratio < 0.75) return TRUST_LEVEL_LABELS[1];
  return TRUST_LEVEL_LABELS[2];
}

const LOVE_LANGUAGE_LABELS = [
  "Слова поддержки",
  "Прикосновения",
  "Подарки",
  "Время вместе",
  "Помощь и забота",
];

const PERSONALITY_LABELS = [
  "Заботливый",
  "Уверенный",
  "Романтичный",
  "Спокойный",
  "Энергичный",
];

function topIndexLabel(answers: number[], labels: string[]): string | null {
  const counts = new Array(labels.length).fill(0);
  answers.forEach((idx) => {
    if (idx >= 0 && idx < counts.length) counts[idx] += 1;
  });

  let topIndex = 0;
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] > counts[topIndex]) topIndex = i;
  }

  return labels[topIndex] ?? null;
}

function computeTestLabel(testId: string, answers: number[]): string | null {
  const kind = TEST_KIND_BY_ID[testId];
  if (!kind || !Array.isArray(answers) || answers.length === 0) return null;

  if (kind === "scale") return scaleLabel(answers);
  if (kind === "love-language") return topIndexLabel(answers, LOVE_LANGUAGE_LABELS);
  return topIndexLabel(answers, PERSONALITY_LABELS);
}

export type PersonalitySummary = {
  trustLevel?: string;
  loveLanguage?: string;
  topStrength?: string;
};

export function buildPersonalitySummary(
  submissions: Array<{ test_id: string; answers: unknown }>
): PersonalitySummary {
  const summary: PersonalitySummary = {};

  for (const sub of submissions) {
    const answers = Array.isArray(sub.answers)
      ? sub.answers.map((v) => Number(v))
      : [];
    const label = computeTestLabel(sub.test_id, answers);
    if (!label) continue;

    if (sub.test_id === "trust-level") summary.trustLevel = label;
    else if (sub.test_id === "love-language") summary.loveLanguage = label;
    else if (sub.test_id === "personality-strengths") summary.topStrength = label;
  }

  return summary;
}

// 3-4 заготовленные фразы для первого сообщения мэтчу, построенные по
// сходству/различию результатов тестов — видны всем (даже без Premium),
// отправка сообщения всё равно отдельно гейтится Premium'ом на уровне
// API route. Список никогда не пустой: если ни один тест не пройден ни
// у кого, остаются только общие фразы-заглушки.
export function buildDatingIcebreakers(
  selfSummary: PersonalitySummary,
  partnerSummary: PersonalitySummary,
  partnerDisplayName: string
): string[] {
  const lines: string[] = [];

  if (selfSummary.loveLanguage && partnerSummary.loveLanguage) {
    if (selfSummary.loveLanguage === partnerSummary.loveLanguage) {
      lines.push(
        `Судя по тестам, у нас один и тот же язык любви — ${partnerSummary.loveLanguage.toLowerCase()}. Как это обычно выглядит у тебя?`
      );
    } else {
      lines.push(
        `Твой язык любви — ${partnerSummary.loveLanguage.toLowerCase()}, у меня — ${selfSummary.loveLanguage.toLowerCase()}. Расскажи, как это ощущается на практике?`
      );
    }
  }

  if (partnerSummary.topStrength) {
    lines.push(
      `Заметил(а), что твоя сильная сторона — ${partnerSummary.topStrength.toLowerCase()}. Было в жизни что-то, где это особенно пригодилось?`
    );
  }

  if (
    selfSummary.topStrength &&
    partnerSummary.topStrength &&
    selfSummary.topStrength !== partnerSummary.topStrength
  ) {
    lines.push(
      `У меня сильная сторона — ${selfSummary.topStrength.toLowerCase()}, у тебя — ${partnerSummary.topStrength.toLowerCase()}. Как думаешь, сработались бы?`
    );
  }

  const fillers = [
    `Привет, ${partnerDisplayName}! Какой из тестов в приложении показался тебе самым точным?`,
    "Судя по совместимости, нам точно есть о чём поговорить — с чего начнём?",
    "Привет! Задам странный вопрос сразу: ты за долгую переписку или сразу звонок?",
  ];

  for (const filler of fillers) {
    if (lines.length >= 4) break;
    lines.push(filler);
  }

  return lines.slice(0, 4);
}
