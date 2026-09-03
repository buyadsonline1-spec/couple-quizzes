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

export type Market = "ru" | "en" | "fi";

type TestKind = "scale" | "love-language" | "personality";

const TEST_KIND_BY_ID: Record<string, TestKind> = {
  "trust-level": "scale",
  "love-language": "love-language",
  "personality-strengths": "personality",
};

const TRUST_LEVEL_LABELS: Record<Market, string[]> = {
  ru: ["Низкий уровень доверия", "Средний уровень доверия", "Высокий уровень доверия"],
  en: ["Low trust level", "Medium trust level", "High trust level"],
  fi: ["Matala luottamustaso", "Keskitason luottamus", "Korkea luottamustaso"],
};

function scaleLabel(answers: number[], market: Market): string {
  const totalScore = answers.reduce((sum, value) => sum + value, 0);
  const maxScore = answers.length * 4;
  const ratio = maxScore > 0 ? totalScore / maxScore : 0;

  const labels = TRUST_LEVEL_LABELS[market];
  if (ratio < 0.45) return labels[0];
  if (ratio < 0.75) return labels[1];
  return labels[2];
}

const LOVE_LANGUAGE_LABELS: Record<Market, string[]> = {
  ru: ["Слова поддержки", "Прикосновения", "Подарки", "Время вместе", "Помощь и забота"],
  en: ["Words of affirmation", "Touch", "Gifts", "Quality time", "Acts of service"],
  fi: ["Kannustavat sanat", "Kosketus", "Lahjat", "Yhteinen aika", "Palvelusteot"],
};

const PERSONALITY_LABELS: Record<Market, string[]> = {
  ru: ["Заботливый", "Уверенный", "Романтичный", "Спокойный", "Энергичный"],
  en: ["Caring", "Confident", "Romantic", "Calm", "Energetic"],
  fi: ["Huolehtivainen", "Itsevarma", "Romanttinen", "Rauhallinen", "Energinen"],
};

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

function computeTestLabel(testId: string, answers: number[], market: Market): string | null {
  const kind = TEST_KIND_BY_ID[testId];
  if (!kind || !Array.isArray(answers) || answers.length === 0) return null;

  if (kind === "scale") return scaleLabel(answers, market);
  if (kind === "love-language") return topIndexLabel(answers, LOVE_LANGUAGE_LABELS[market]);
  return topIndexLabel(answers, PERSONALITY_LABELS[market]);
}

export type PersonalitySummary = {
  trustLevel?: string;
  loveLanguage?: string;
  topStrength?: string;
};

export function buildPersonalitySummary(
  submissions: Array<{ test_id: string; answers: unknown }>,
  market: Market
): PersonalitySummary {
  const summary: PersonalitySummary = {};

  for (const sub of submissions) {
    const answers = Array.isArray(sub.answers)
      ? sub.answers.map((v) => Number(v))
      : [];
    const label = computeTestLabel(sub.test_id, answers, market);
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
// у кого, остаются только общие фразы-заглушки. Локализовано под
// маркет ЗАПРАШИВАЮЩЕГО (это подсказка ЕМУ, а не партнёру) — как и
// остальной UI-текст, а не контент профиля (bio/имя всегда на языке
// автора анкеты, это отдельная история).
const ICEBREAKER_TEXT: Record<
  Market,
  {
    sameLoveLanguage: (lang: string) => string;
    diffLoveLanguage: (theirs: string, mine: string) => string;
    partnerStrength: (strength: string) => string;
    diffStrength: (mine: string, theirs: string) => string;
    fillers: (partnerName: string) => string[];
  }
> = {
  ru: {
    sameLoveLanguage: (lang) =>
      `Судя по тестам, у нас один и тот же язык любви — ${lang.toLowerCase()}. Как это обычно выглядит у тебя?`,
    diffLoveLanguage: (theirs, mine) =>
      `Твой язык любви — ${theirs.toLowerCase()}, у меня — ${mine.toLowerCase()}. Расскажи, как это ощущается на практике?`,
    partnerStrength: (strength) =>
      `Заметил(а), что твоя сильная сторона — ${strength.toLowerCase()}. Было в жизни что-то, где это особенно пригодилось?`,
    diffStrength: (mine, theirs) =>
      `У меня сильная сторона — ${mine.toLowerCase()}, у тебя — ${theirs.toLowerCase()}. Как думаешь, сработались бы?`,
    fillers: (name) => [
      `Привет, ${name}! Какой из тестов в приложении показался тебе самым точным?`,
      "Судя по совместимости, нам точно есть о чём поговорить — с чего начнём?",
      "Привет! Задам странный вопрос сразу: ты за долгую переписку или сразу звонок?",
    ],
  },
  en: {
    sameLoveLanguage: (lang) =>
      `Turns out we have the same love language — ${lang.toLowerCase()}. What does that usually look like for you?`,
    diffLoveLanguage: (theirs, mine) =>
      `Your love language is ${theirs.toLowerCase()}, mine is ${mine.toLowerCase()}. What does that feel like in practice?`,
    partnerStrength: (strength) =>
      `I noticed your top strength is being ${strength.toLowerCase()}. Was there a time in your life where that really helped?`,
    diffStrength: (mine, theirs) =>
      `My strength is being ${mine.toLowerCase()}, yours is ${theirs.toLowerCase()}. Think we'd make a good team?`,
    fillers: (name) => [
      `Hey ${name}! Which of the tests in the app felt the most accurate to you?`,
      "Judging by our compatibility, we definitely have something to talk about — where should we start?",
      "Hi! Random question right off the bat: long text threads or a call?",
    ],
  },
  fi: {
    sameLoveLanguage: (lang) =>
      `Testien mukaan meillä on sama rakkauden kieli — ${lang.toLowerCase()}. Miltä se sinulla yleensä näyttää?`,
    diffLoveLanguage: (theirs, mine) =>
      `Sinun rakkauden kielesi on ${theirs.toLowerCase()}, minun ${mine.toLowerCase()}. Miltä se tuntuu käytännössä?`,
    partnerStrength: (strength) =>
      `Huomasin, että vahvuutesi on ${strength.toLowerCase()}. Oliko elämässäsi tilannetta, jossa siitä oli erityisesti apua?`,
    diffStrength: (mine, theirs) =>
      `Minun vahvuuteni on ${mine.toLowerCase()}, sinun ${theirs.toLowerCase()}. Toimisimmeko hyvin yhdessä?`,
    fillers: (name) => [
      `Hei ${name}! Mikä sovelluksen testeistä tuntui osuvimmalta?`,
      "Yhteensopivuuden perusteella meillä on varmasti puhuttavaa — mistä aloitetaan?",
      "Hei! Outo kysymys heti alkuun: pitkät viestiketjut vai suoraan puhelu?",
    ],
  },
};

export function buildDatingIcebreakers(
  selfSummary: PersonalitySummary,
  partnerSummary: PersonalitySummary,
  partnerDisplayName: string,
  market: Market
): string[] {
  const lines: string[] = [];
  const text = ICEBREAKER_TEXT[market];

  if (selfSummary.loveLanguage && partnerSummary.loveLanguage) {
    if (selfSummary.loveLanguage === partnerSummary.loveLanguage) {
      lines.push(text.sameLoveLanguage(partnerSummary.loveLanguage));
    } else {
      lines.push(text.diffLoveLanguage(partnerSummary.loveLanguage, selfSummary.loveLanguage));
    }
  }

  if (partnerSummary.topStrength) {
    lines.push(text.partnerStrength(partnerSummary.topStrength));
  }

  if (
    selfSummary.topStrength &&
    partnerSummary.topStrength &&
    selfSummary.topStrength !== partnerSummary.topStrength
  ) {
    lines.push(text.diffStrength(selfSummary.topStrength, partnerSummary.topStrength));
  }

  for (const filler of text.fillers(partnerDisplayName)) {
    if (lines.length >= 4) break;
    lines.push(filler);
  }

  return lines.slice(0, 4);
}
