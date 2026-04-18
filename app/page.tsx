"use client";

import { CSSProperties, useEffect, useMemo, useState } from "react";
import { getMarket } from "@/config/markets";
import { REWARD_CATEGORIES_RU } from "@/config/rewards-ru";
import { REWARD_CATEGORIES_EN } from "@/config/rewards-en";

import { supabase } from "@/lib/supabase";
import confetti from "canvas-confetti";
import { TEXT_RU } from "@/config/text-ru";
import { TEXT_EN } from "@/config/text-en";

const market = getMarket();
const t = market === "en" ? TEXT_EN : TEXT_RU;

const REWARD_CATEGORIES =
  market === "en" ? REWARD_CATEGORIES_EN : REWARD_CATEGORIES_RU;




declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        openInvoice?: (url: string, callback?: (status: string) => void) => void;
        openTelegramLink?: (url: string) => void;
        ready?: () => void;
        expand?: () => void;
        initDataUnsafe?: {
  user?: {
    id?: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
  };
  start_param?: string;
};
      };
    };
  }
}

type Screen =
  | "welcome"
  | "start"
  | "language-select"
  | "menu"
  | "polls"
  | "polls-boy"
  | "polls-girl"
  | "games"
  | "tests"
  | "rewards"
  | "referrals"
  | "pair"
  | "pair-invite"
  | "top"
  | "profile"
  | "gender-select"
  | "daily-pair-question"
  | "pair-streak-info"
  | "paywall"
  | "pair-compatibility-info";



type TgUser = {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

type DailyBonusState = {
  streakDay: number;
  lastClaimDate: string | null;
  totalPointsEarnedFromBonus: number;
};

type AppStats = {
  pollsCompleted: number;
  gamesPlayed: number;
  testsCompleted: number;
  rewardsRedeemed: number;
};

type WonReward = {
  id: string;
  title: string;
  categoryId: string;
  categoryTitle: string;
  wonAt: string;
};


type AppState = {
  points: number;
  isPremium: boolean;
 

  completionBonusesClaimed: {
  polls: boolean;
  tests: boolean;
  games: boolean;
};


  referrals: {
  invitedUsers: string[];
  totalReward: number;
};

loveQuestionsAnsweredIds: string[];


playedGameRewardKeys: string[];

lastDailyBonusPopupDate: string | null;

dailyPairMatchBonusClaimedDates: string[];


  dailyBonus: {
    streakDay: number;
    lastClaimDate: string | null;
    totalPointsEarnedFromBonus: number;
  };

  stats: {
    pollsCompleted: number;
    gamesPlayed: number;
    testsCompleted: number;
    rewardsRedeemed: number;
  };

  completedPollIds: string[];
  wonRewards: WonReward[];
  completedTestIds: string[];
  completedGameIds: string[];
  pollAnswers: Record<string, number[]>;
  pairPollAnswers: Record<string, number[]>;
  weeklyTopRewardClaimedWeek: string | null;

  loveQuestionsProgress: {
  currentIndex: number;
};

  pair: PairState;

  dailyPair: {
    boy: DailyPairAnswerState;
    girl: DailyPairAnswerState;
  };

  dailyPairHistory: Array<{
  date: string;
  questionId: string;
  boyAnswerIndex: number | null;
  girlAnswerIndex: number | null;
}>;

dailyPairStreak: {
  current: number;
  reachedMilestones: number[];
};



  profile: {
  displayName: string;
  avatar: string | null;
  gender: "boy" | "girl" | null;
};
};

type PollQuestion = {
  id: string;
  text: string;
  textRu: string;
  textEn: string;
  options: string[];
  optionsRu: string[];
  optionsEn: string[];
};

type Poll = {
  id: string;


  title: string;
  description: string;
  
  titleRu?: string;
  titleEn?: string;
  descriptionRu?: string;
  descriptionEn?: string;

  reward: number;
  gender: "boy" | "girl";
  page: number;
  theme?: string;
  matchGroup?: string;

  questions: PollQuestion[];
};

type RewardItem = {
  id: string;
  title: string;
  weight?: number;
};

type RewardCategory = {
  id: string;
  title: string;
  emoji: string;
  weight: number;
  items: RewardItem[];
};

type Game = {
  id: string;
  title: string;
  description: string;
  reward: number;
    comingSoon?: boolean;
  questions: {
    id: string;
    text: string;
    options: string[];
    correctIndex: number;
  }[];
};

type LoveQuestion = {
  id: string;
  text: string;
};

type TestKind = "scale" | "love-language" | "personality";

type TestQuestion = {
  id: string;
  text: string;
  textRu: string;
  textEn: string;
  options: string[];
  optionsRu: string[];
  optionsEn: string[];
};

type TestDefinition = {
  id: string;
  title: string;
  titleRu: string;
  titleEn: string;
  description: string;
  descriptionRu: string;
  descriptionEn: string;
  reward: number;
  kind: TestKind;
  questions: TestQuestion[];
};

type TestResult = {
  title: string;
  subtitle: string;
  description: string;
};

type PairLevelInfo = {
  level: number;
  title: string;
  currentLevelPoints: number;
  nextLevelPoints: number | null;
  progressInLevel: number;
  progressMax: number;
  progressPercent: number;
};


type BottleTask = {
  id: string;
  target: "boy" | "girl";
  text: string;
};

type PairMember = {
  telegramId: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
};

type PairState = {
  pairId: string | null;
  inviteCode: string | null;
  partner: PairMember | null;
  createdByTelegramId: number | null;
  totalPoints: number;
};

type DailyPairQuestion = {
  id: string;
  text: string;
  options: string[];
};

type DailyPairAnswerState = {
  date: string | null;
  questionId: string | null;
  answerIndex: number | null;
};

type WeeklyPairLeaderboardRow = {
  id: string;
  week_key: string;
  pair_id: string;
  pair_title: string;
  total_points: number;
  updated_at: string;
};



const DAILY_REWARDS = [25, 50, 75, 100, 150, 200, 300, 400, 500];
const STORAGE_KEY = "couple-quizzes-miniapp-v6";
const WHEEL_SPIN_COST = 2000;


const SCALE_OPTIONS_RU = ["Никогда", "Редко", "Иногда", "Часто", "Всегда"];
const SCALE_OPTIONS_EN = ["Never", "Rarely", "Sometimes", "Often", "Always"];

const TESTS: TestDefinition[] = [
  {
    id: "trust-level",
    title:
      market === "en"
        ? "Trust Level in a Relationship"
        : "Уровень доверия к партнёру",
    titleRu: "Уровень доверия к партнёру",
    titleEn: "Trust Level in a Relationship",
    description:
      market === "en"
        ? "Shows how calm, secure, and confident you feel in your relationship."
        : "Покажет, насколько спокойно и уверенно ты чувствуешь себя в отношениях.",
    descriptionRu:
      "Покажет, насколько спокойно и уверенно ты чувствуешь себя в отношениях.",
    descriptionEn:
      "Shows how calm, secure, and confident you feel in your relationship.",
    reward: 60,
    kind: "scale",
    questions: [
      {
        id: "t1",
        text:
          market === "en"
            ? "I feel comfortable sharing my worries with my partner."
            : "Мне комфортно делиться с партнёром своими переживаниями.",
        textRu: "Мне комфортно делиться с партнёром своими переживаниями.",
        textEn: "I feel comfortable sharing my worries with my partner.",
        options: market === "en" ? SCALE_OPTIONS_EN : SCALE_OPTIONS_RU,
        optionsRu: SCALE_OPTIONS_RU,
        optionsEn: SCALE_OPTIONS_EN,
      },
      {
        id: "t2",
        text:
          market === "en"
            ? "I am not afraid that my partner will judge my feelings."
            : "Я не боюсь, что партнёр осудит мои чувства.",
        textRu: "Я не боюсь, что партнёр осудит мои чувства.",
        textEn: "I am not afraid that my partner will judge my feelings.",
        options: market === "en" ? SCALE_OPTIONS_EN : SCALE_OPTIONS_RU,
        optionsRu: SCALE_OPTIONS_RU,
        optionsEn: SCALE_OPTIONS_EN,
      },
      {
        id: "t3",
        text:
          market === "en"
            ? "I trust my partner's words without unnecessary doubt."
            : "Я верю словам партнёра без лишних сомнений.",
        textRu: "Я верю словам партнёра без лишних сомнений.",
        textEn: "I trust my partner's words without unnecessary doubt.",
        options: market === "en" ? SCALE_OPTIONS_EN : SCALE_OPTIONS_RU,
        optionsRu: SCALE_OPTIONS_RU,
        optionsEn: SCALE_OPTIONS_EN,
      },
      {
        id: "t4",
        text:
          market === "en"
            ? "I feel calm when my partner spends time without me."
            : "Мне спокойно, когда партнёр проводит время без меня.",
        textRu: "Мне спокойно, когда партнёр проводит время без меня.",
        textEn: "I feel calm when my partner spends time without me.",
        options: market === "en" ? SCALE_OPTIONS_EN : SCALE_OPTIONS_RU,
        optionsRu: SCALE_OPTIONS_RU,
        optionsEn: SCALE_OPTIONS_EN,
      },
      {
        id: "t5",
        text:
          market === "en"
            ? "I feel safe when I am with my partner."
            : "Я чувствую себя в безопасности рядом с партнёром.",
        textRu: "Я чувствую себя в безопасности рядом с партнёром.",
        textEn: "I feel safe when I am with my partner.",
        options: market === "en" ? SCALE_OPTIONS_EN : SCALE_OPTIONS_RU,
        optionsRu: SCALE_OPTIONS_RU,
        optionsEn: SCALE_OPTIONS_EN,
      },
      {
        id: "t6",
        text:
          market === "en"
            ? "If a problem comes up, I believe we can talk it through."
            : "Если возникает проблема, я верю, что мы сможем её обсудить.",
        textRu: "Если возникает проблема, я верю, что мы сможем её обсудить.",
        textEn: "If a problem comes up, I believe we can talk it through.",
        options: market === "en" ? SCALE_OPTIONS_EN : SCALE_OPTIONS_RU,
        optionsRu: SCALE_OPTIONS_RU,
        optionsEn: SCALE_OPTIONS_EN,
      },
      {
        id: "t7",
        text:
          market === "en"
            ? "I do not expect tricks or betrayal from my partner."
            : "Я не жду подвоха от партнёра.",
        textRu: "Я не жду подвоха от партнёра.",
        textEn: "I do not expect tricks or betrayal from my partner.",
        options: market === "en" ? SCALE_OPTIONS_EN : SCALE_OPTIONS_RU,
        optionsRu: SCALE_OPTIONS_RU,
        optionsEn: SCALE_OPTIONS_EN,
      },
      {
        id: "t8",
        text:
          market === "en"
            ? "It is easy for me to be myself in this relationship."
            : "Мне легко быть собой в этих отношениях.",
        textRu: "Мне легко быть собой в этих отношениях.",
        textEn: "It is easy for me to be myself in this relationship.",
        options: market === "en" ? SCALE_OPTIONS_EN : SCALE_OPTIONS_RU,
        optionsRu: SCALE_OPTIONS_RU,
        optionsEn: SCALE_OPTIONS_EN,
      },
    ],
  },

  {
    id: "love-language",
    title: market === "en" ? "Love Language" : "Язык любви",
    titleRu: "Язык любви",
    titleEn: "Love Language",
    description:
      market === "en"
        ? "Helps determine how you most naturally feel love and care."
        : "Определит, как тебе приятнее всего чувствовать любовь и заботу.",
    descriptionRu:
      "Определит, как тебе приятнее всего чувствовать любовь и заботу.",
    descriptionEn:
      "Helps determine how you most naturally feel love and care.",
    reward: 60,
    kind: "love-language",
    questions: [
      {
        id: "l1",
        text:
          market === "en"
            ? "What would feel nicest to receive from your partner?"
            : "Что приятнее получить от партнёра?",
        textRu: "Что приятнее получить от партнёра?",
        textEn: "What would feel nicest to receive from your partner?",
        options:
          market === "en"
            ? [
                "Warm words and compliments",
                "Hugs and touch",
                "A gift or surprise",
                "Quality time together",
                "Help with everyday things",
              ]
            : [
                "Тёплые слова и комплименты",
                "Объятия и прикосновения",
                "Подарок или сюрприз",
                "Совместное время только вдвоём",
                "Помощь в делах",
              ],
        optionsRu: [
          "Тёплые слова и комплименты",
          "Объятия и прикосновения",
          "Подарок или сюрприз",
          "Совместное время только вдвоём",
          "Помощь в делах",
        ],
        optionsEn: [
          "Warm words and compliments",
          "Hugs and touch",
          "A gift or surprise",
          "Quality time together",
          "Help with everyday things",
        ],
      },
      {
        id: "l2",
        text:
          market === "en"
            ? "When do you feel especially happy in a relationship?"
            : "Когда тебе особенно хорошо в отношениях?",
        textRu: "Когда тебе особенно хорошо в отношениях?",
        textEn: "When do you feel especially happy in a relationship?",
        options:
          market === "en"
            ? [
                "When I am praised and supported",
                "When I am hugged and kissed",
                "When I get unexpected gifts",
                "When I get full attention",
                "When I am helped without asking",
              ]
            : [
                "Когда меня хвалят и поддерживают",
                "Когда меня обнимают и целуют",
                "Когда делают неожиданные подарки",
                "Когда уделяют мне всё внимание",
                "Когда помогают без просьб",
              ],
        optionsRu: [
          "Когда меня хвалят и поддерживают",
          "Когда меня обнимают и целуют",
          "Когда делают неожиданные подарки",
          "Когда уделяют мне всё внимание",
          "Когда помогают без просьб",
        ],
        optionsEn: [
          "When I am praised and supported",
          "When I am hugged and kissed",
          "When I get unexpected gifts",
          "When I get full attention",
          "When I am helped without asking",
        ],
      },
      {
        id: "l3",
        text:
          market === "en"
            ? "What do you remember the most?"
            : "Что ты запоминаешь сильнее всего?",
        textRu: "Что ты запоминаешь сильнее всего?",
        textEn: "What do you remember the most?",
        options:
          market === "en"
            ? [
                "Beautiful words",
                "Tender gestures",
                "Material signs of attention",
                "Time spent together",
                "Real care shown through actions",
              ]
            : [
                "Красивые слова",
                "Нежные жесты",
                "Материальные знаки внимания",
                "Проведённое вместе время",
                "Реальную заботу в действиях",
              ],
        optionsRu: [
          "Красивые слова",
          "Нежные жесты",
          "Материальные знаки внимания",
          "Проведённое вместе время",
          "Реальную заботу в действиях",
        ],
        optionsEn: [
          "Beautiful words",
          "Tender gestures",
          "Material signs of attention",
          "Time spent together",
          "Real care shown through actions",
        ],
      },
      {
        id: "l4",
        text:
          market === "en"
            ? "What makes it easiest for you to feel loved?"
            : "Как тебе легче почувствовать любовь?",
        textRu: "Как тебе легче почувствовать любовь?",
        textEn: "What makes it easiest for you to feel loved?",
        options:
          market === "en"
            ? [
                "Hearing it in words",
                "Feeling it physically",
                "Receiving something symbolic",
                "Spending longer time together",
                "Seeing help and involvement",
              ]
            : [
                "Услышать это словами",
                "Почувствовать физически",
                "Получить что-то символичное",
                "Побыть рядом подольше",
                "Увидеть помощь и участие",
              ],
        optionsRu: [
          "Услышать это словами",
          "Почувствовать физически",
          "Получить что-то символичное",
          "Побыть рядом подольше",
          "Увидеть помощь и участие",
        ],
        optionsEn: [
          "Hearing it in words",
          "Feeling it physically",
          "Receiving something symbolic",
          "Spending longer time together",
          "Seeing help and involvement",
        ],
      },
      {
        id: "l5",
        text:
          market === "en"
            ? "What upsets you the most when it is missing?"
            : "Что тебя расстраивает сильнее всего, когда этого не хватает?",
        textRu: "Что тебя расстраивает сильнее всего, когда этого не хватает?",
        textEn: "What upsets you the most when it is missing?",
        options:
          market === "en"
            ? [
                "Support and words",
                "Tenderness",
                "Gifts and surprises",
                "Time together",
                "Help and care",
              ]
            : [
                "Поддержки и слов",
                "Нежности",
                "Подарков и сюрпризов",
                "Времени вместе",
                "Помощи и заботы",
              ],
        optionsRu: [
          "Поддержки и слов",
          "Нежности",
          "Подарков и сюрпризов",
          "Времени вместе",
          "Помощи и заботы",
        ],
        optionsEn: [
          "Support and words",
          "Tenderness",
          "Gifts and surprises",
          "Time together",
          "Help and care",
        ],
      },
      {
        id: "l6",
        text:
          market === "en"
            ? "What feels more romantic to you?"
            : "Что для тебя романтичнее?",
        textRu: "Что для тебя романтичнее?",
        textEn: "What feels more romantic to you?",
        options:
          market === "en"
            ? [
                "A sincere confession",
                "Long hugs",
                "An unexpected gift",
                "An evening for two",
                "Being cared for through actions",
              ]
            : [
                "Искреннее признание",
                "Долгие объятия",
                "Неожиданный подарок",
                "Вечер вдвоём",
                "Когда о тебе заботятся делом",
              ],
        optionsRu: [
          "Искреннее признание",
          "Долгие объятия",
          "Неожиданный подарок",
          "Вечер вдвоём",
          "Когда о тебе заботятся делом",
        ],
        optionsEn: [
          "A sincere confession",
          "Long hugs",
          "An unexpected gift",
          "An evening for two",
          "Being cared for through actions",
        ],
      },
    ],
  },

  {
    id: "personality-strengths",
    title:
      market === "en"
        ? "Personal Strengths"
        : "Сильные стороны личности",
    titleRu: "Сильные стороны личности",
    titleEn: "Personal Strengths",
    description:
      market === "en"
        ? "Shows which of your inner strengths stands out the most in life and relationships."
        : "Покажет, какая твоя энергия сильнее всего проявляется в жизни и отношениях.",
    descriptionRu:
      "Покажет, какая твоя энергия сильнее всего проявляется в жизни и отношениях.",
    descriptionEn:
      "Shows which of your inner strengths stands out the most in life and relationships.",
    reward: 60,
    kind: "personality",
    questions: [
      {
        id: "p1",
        text:
          market === "en"
            ? "In a difficult situation, you are more likely to..."
            : "В сложной ситуации ты чаще...",
        textRu: "В сложной ситуации ты чаще...",
        textEn: "In a difficult situation, you are more likely to...",
        options:
          market === "en"
            ? [
                "Support others",
                "Take responsibility",
                "Try to keep warmth and romance",
                "Stay calm",
                "Energize everyone around you",
              ]
            : [
                "Поддерживаешь других",
                "Берёшь ответственность на себя",
                "Стараешься сохранить романтику и тепло",
                "Сохраняешь спокойствие",
                "Быстро заряжаешь всех энергией",
              ],
        optionsRu: [
          "Поддерживаешь других",
          "Берёшь ответственность на себя",
          "Стараешься сохранить романтику и тепло",
          "Сохраняешь спокойствие",
          "Быстро заряжаешь всех энергией",
        ],
        optionsEn: [
          "Support others",
          "Take responsibility",
          "Try to keep warmth and romance",
          "Stay calm",
          "Energize everyone around you",
        ],
      },
      {
        id: "p2",
        text:
          market === "en"
            ? "People most often value in you..."
            : "Люди чаще ценят в тебе...",
        textRu: "Люди чаще ценят в тебе...",
        textEn: "People most often value in you...",
        options:
          market === "en"
            ? [
                "Kindness",
                "Confidence",
                "Sensitivity",
                "Reliability",
                "Charisma",
              ]
            : [
                "Доброту",
                "Уверенность",
                "Чувственность",
                "Надёжность",
                "Харизму",
              ],
        optionsRu: [
          "Доброту",
          "Уверенность",
          "Чувственность",
          "Надёжность",
          "Харизму",
        ],
        optionsEn: [
          "Kindness",
          "Confidence",
          "Sensitivity",
          "Reliability",
          "Charisma",
        ],
      },
      {
        id: "p3",
        text:
          market === "en"
            ? "In relationships, you are mostly about..."
            : "В отношениях ты больше про...",
        textRu: "В отношениях ты больше про...",
        textEn: "In relationships, you are mostly about...",
        options:
          market === "en"
            ? [
                "Care",
                "Strength of character",
                "Romance",
                "Stability",
                "Emotion and drive",
              ]
            : [
                "Заботу",
                "Силу характера",
                "Романтику",
                "Стабильность",
                "Эмоции и драйв",
              ],
        optionsRu: [
          "Заботу",
          "Силу характера",
          "Романтику",
          "Стабильность",
          "Эмоции и драйв",
        ],
        optionsEn: [
          "Care",
          "Strength of character",
          "Romance",
          "Stability",
          "Emotion and drive",
        ],
      },
      {
        id: "p4",
        text:
          market === "en"
            ? "What is your biggest strength?"
            : "Какой твой главный плюс?",
        textRu: "Какой твой главный плюс?",
        textEn: "What is your biggest strength?",
        options:
          market === "en"
            ? [
                "Empathy",
                "Determination",
                "Tenderness",
                "Balance",
                "Energy",
              ]
            : [
                "Эмпатия",
                "Решительность",
                "Нежность",
                "Уравновешенность",
                "Энергичность",
              ],
        optionsRu: [
          "Эмпатия",
          "Решительность",
          "Нежность",
          "Уравновешенность",
          "Энергичность",
        ],
        optionsEn: [
          "Empathy",
          "Determination",
          "Tenderness",
          "Balance",
          "Energy",
        ],
      },
      {
        id: "p5",
        text:
          market === "en"
            ? "When someone close is рядом, you more often..."
            : "Когда рядом близкий человек, ты чаще...",
        textRu: "Когда рядом близкий человек, ты чаще...",
        textEn: "When someone close is nearby, you more often...",
        options:
          market === "en"
            ? [
                "Support",
                "Protect",
                "Inspire",
                "Calm",
                "Charge with energy",
              ]
            : [
                "Поддерживаешь",
                "Защищаешь",
                "Вдохновляешь",
                "Успокаиваешь",
                "Заряжаешь",
              ],
        optionsRu: [
          "Поддерживаешь",
          "Защищаешь",
          "Вдохновляешь",
          "Успокаиваешь",
          "Заряжаешь",
        ],
        optionsEn: [
          "Support",
          "Protect",
          "Inspire",
          "Calm",
          "Charge with energy",
        ],
      },
      {
        id: "p6",
        text:
          market === "en"
            ? "Your ideal self-image is..."
            : "Твой идеальный образ себя — это...",
        textRu: "Твой идеальный образ себя — это...",
        textEn: "Your ideal self-image is...",
        options:
          market === "en"
            ? [
                "A caring person",
                "A strong personality",
                "A romantic soul",
                "A calm and wise person",
                "A bright source of energy",
              ]
            : [
                "Заботливый человек",
                "Сильная личность",
                "Романтичная натура",
                "Спокойный и мудрый человек",
                "Яркий источник энергии",
              ],
        optionsRu: [
          "Заботливый человек",
          "Сильная личность",
          "Романтичная натура",
          "Спокойный и мудрый человек",
          "Яркий источник энергии",
        ],
        optionsEn: [
          "A caring person",
          "A strong personality",
          "A romantic soul",
          "A calm and wise person",
          "A bright source of energy",
        ],
      },
    ],
  },
];

type CompatibilityThemeResult = {
  key: string;
  title: string;
  percent: number;
};

type CompatibilityProfile = {
  overallPercent: number;
  completedThemes: number;
  totalThemes: number;
  themes: CompatibilityThemeResult[];
  strongSides: string[];
  growthZones: string[];
  pairType: string;
  description: string;
};

function getThemeTitle(matchGroup: string) {
  switch (matchGroup) {
    case "communication":
      return "Общение";
    case "love":
      return "Любовь";
    case "conflicts":
      return "Конфликты";
    case "trust":
      return "Доверие";
    case "understanding":
      return "Понимание";
    case "romance":
      return "Романтика";
    case "space":
      return "Личное пространство";
    case "future":
      return "Будущее";
    case "life":
      return "Быт";
    case "jealousy":
      return "Ревность";
    default:
      return matchGroup;
  }
}

function calculatePollMatchPercent(
  boyAnswers: number[] | undefined,
  girlAnswers: number[] | undefined
) {
  if (!boyAnswers || !girlAnswers) return null;
  if (!boyAnswers.length || !girlAnswers.length) return null;

  const length = Math.min(boyAnswers.length, girlAnswers.length);
  if (!length) return null;

  let total = 0;

  for (let i = 0; i < length; i++) {
    const a = Number(boyAnswers[i]);
    const b = Number(girlAnswers[i]);

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

function buildCompatibilityProfile(
  pollAnswers: Record<string, number[]>
): CompatibilityProfile {
  const groups = [
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
  ];

  const themes: CompatibilityThemeResult[] = [];

  for (const group of groups) {
    const boyAnswers = pollAnswers[`boy-${group}`];
    const girlAnswers = pollAnswers[`girl-${group}`];

    const percent = calculatePollMatchPercent(boyAnswers, girlAnswers);

    if (percent !== null) {
      themes.push({
        key: group,
        title: getThemeTitle(group),
        percent,
      });
    }
  }

  const overallPercent = themes.length
    ? Math.round(themes.reduce((sum, item) => sum + item.percent, 0) / themes.length)
    : 0;

  const sortedHigh = [...themes].sort((a, b) => b.percent - a.percent);
  const sortedLow = [...themes].sort((a, b) => a.percent - b.percent);

  const strongSides = sortedHigh.slice(0, 3).map((item) => item.title);
  const growthZones = sortedLow.slice(0, 2).map((item) => item.title);

  const topKeys = strongSides.join(" | ");
  let pairType = "Уникальная пара";
  let description =
    "У вас есть свои сильные стороны и свой характер отношений. Продолжайте узнавать друг друга глубже.";

  const themeMap = Object.fromEntries(themes.map((t) => [t.key, t.percent]));

  const love = themeMap.love ?? 0;
  const romance = themeMap.romance ?? 0;
  const understanding = themeMap.understanding ?? 0;
  const trust = themeMap.trust ?? 0;
  const communication = themeMap.communication ?? 0;
  const future = themeMap.future ?? 0;
  const space = themeMap.space ?? 0;
  const jealousy = themeMap.jealousy ?? 0;

  if (love >= 80 && romance >= 75 && understanding >= 75) {
    pairType = "Нежная и романтичная пара";
    description =
      "Вы хорошо чувствуете друг друга, цените близость, заботу и атмосферу в отношениях. Ваш союз строится на тепле, эмоциях и умении быть рядом.";
  } else if (trust >= 80 && communication >= 75 && future >= 75) {
    pairType = "Зрелая и надёжная пара";
    description =
      "Ваши отношения опираются на доверие, честность и умение договариваться. Вы хорошо смотрите в одну сторону и умеете строить общее будущее.";
  } else if (space >= 75 && trust >= 75 && jealousy <= 55) {
    pairType = "Свободная и осознанная пара";
    description =
      "Вы уважаете границы друг друга, цените личное пространство и строите отношения без лишнего давления. Это союз с доверием и внутренней свободой.";
  } else if (overallPercent >= 80) {
    pairType = "Гармоничная пара";
    description =
      "У вас высокий уровень совместимости по многим важным темам. Вы неплохо понимаете друг друга и умеете сохранять баланс в отношениях.";
  } else if (overallPercent >= 65) {
    pairType = "Перспективная пара";
    description =
      "У вас уже есть крепкая база, но некоторые различия ещё требуют внимания. При открытом диалоге ваша совместимость может стать ещё сильнее.";
  } else {
    pairType = "Контрастная пара";
    description =
      "Вы заметно различаетесь во взглядах, и это может создавать как притяжение, так и сложности. Ваш рост как пары зависит от диалога, принятия и гибкости.";
  }

  return {
    overallPercent,
    completedThemes: themes.length,
    totalThemes: groups.length,
    themes,
    strongSides,
    growthZones,
    pairType,
    description,
  };
}

function launchLevelConfetti() {
  confetti({
  particleCount: 120,
  spread: 90,
  origin: { y: 0.6 },
});

  const duration = 1800;
  const end = Date.now() + duration;

  const colors = ["#ff6ec7", "#6b46ff", "#ffd166", "#5ddcff"];

  (function frame() {
    confetti({
      particleCount: 6,
      angle: 60,
      spread: 70,
      origin: { x: 0 },
      colors,
    });

    confetti({
      particleCount: 6,
      angle: 120,
      spread: 70,
      origin: { x: 1 },
      colors,
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  })();
}

async function loadPremiumStatus(telegramId: number) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("status, expires_at")
    .eq("telegram_id", telegramId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    console.error("LOAD PREMIUM STATUS ERROR:", error);
    return false;
  }

  return !!data;
}



function createPollQuestions(
  theme: string,
  gender: "boy" | "girl"
): PollQuestion[] {
  const optionsRu = [
    "Полностью согласен",
    "Скорее согласен",
    "Сложно сказать",
    "Скорее не согласен",
    "Совсем не согласен",
  ];

  const optionsEn = [
    "Strongly agree",
    "Somewhat agree",
    "Not sure",
    "Somewhat disagree",
    "Strongly disagree",
  ];

  const make = (id: string, textRu: string, textEn: string): PollQuestion => ({
    id,
    text: market === "en" ? textEn : textRu,
    textRu,
    textEn,
    options: market === "en" ? optionsEn : optionsRu,
    optionsRu,
    optionsEn,
  });

  switch (theme) {
    case "communication":
      return gender === "boy"
        ? [
            make("q1", "Мне проще говорить о проблеме прямо, чем намекать.", "It is easier for me to talk about a problem directly than to hint at it."),
            make("q2", "Я ценю, когда разговор короткий и по делу.", "I appreciate conversations that are brief and to the point."),
            make("q3", "Мне важно, чтобы партнёр говорил честно без игр и молчания.", "It matters to me that my partner speaks honestly without games or silent treatment."),
            make("q4", "Если что-то не нравится, лучше сказать сразу.", "If something feels wrong, it is better to say it right away."),
            make("q5", "Я уважаю спокойный разговор без лишней драмы.", "I value calm conversations without unnecessary drama."),
            make("q6", "Мне важно чувствовать, что меня слушают, а не перебивают.", "It is important for me to feel heard rather than interrupted."),
          ]
        : [
            make("q1", "Мне важно, чтобы со мной говорили мягко и внимательно.", "It is important to me that people speak to me gently and attentively."),
            make("q2", "Я замечаю не только слова, но и тон общения.", "I notice not only words, but also the tone of communication."),
            make("q3", "Мне важно обсуждать чувства, а не только факты.", "It is important to me to discuss feelings, not just facts."),
            make("q4", "Я ценю, когда партнёр сам инициирует откровенный разговор.", "I appreciate it when my partner initiates an open conversation first."),
            make("q5", "Мне важно, чтобы мои эмоции не обесценивали.", "It matters to me that my emotions are not dismissed."),
            make("q6", "После сложного разговора мне важно чувствовать тепло и близость.", "After a difficult conversation, it is important for me to feel warmth and closeness."),
          ];

case "love":
      return gender === "boy"
        ? [
            make("q1", "Для меня любовь — это прежде всего поддержка в жизни.", "For me, love is прежде всего support in life."),
            make("q2", "Я показываю любовь больше поступками, чем словами.", "I show love more through actions than words."),
            make("q3", "Мне важно чувствовать уважение так же сильно, как нежность.", "It is important for me to feel respect as strongly as tenderness."),
            make("q4", "Когда меня ценят, я сильнее раскрываюсь в отношениях.", "When I feel valued, I open up more in a relationship."),
            make("q5", "Мне важно знать, что мы команда в любых обстоятельствах.", "It is important for me to know that we are a team in any situation."),
            make("q6", "Любовь для меня — это когда рядом спокойно и надёжно.", "For me, love is when being together feels calm and secure."),
          ]
        : [
            make("q1", "Для меня любовь — это забота, внимание и эмоциональная близость.", "For me, love is care, attention, and emotional closeness."),
            make("q2", "Я чувствую любовь сильнее, когда мне говорят тёплые слова.", "I feel love more strongly when I hear warm words."),
            make("q3", "Мне важно ощущать нежность не только в особые моменты, но и в мелочах.", "It is important for me to feel tenderness not only in special moments, but also in small everyday things."),
            make("q4", "Когда мной искренне интересуются, я чувствую себя любимой.", "When someone takes a genuine interest in me, I feel loved."),
            make("q5", "Любовь для меня — это когда меня принимают вместе с эмоциями.", "For me, love is being accepted together with my emotions."),
            make("q6", "Мне важно чувствовать, что отношения — это не привычка, а живое чувство.", "It is important for me to feel that a relationship is not just a habit, but a living feeling."),
          ];

    case "conflicts":
      return gender === "boy"
        ? [
            make("q1", "Во время ссоры мне нужно немного времени, чтобы остыть.", "During an argument, I need a little time to cool down."),
            make("q2", "Я лучше решаю конфликт спокойно, без крика и давления.", "I handle conflict better calmly, without yelling or pressure."),
            make("q3", "Мне трудно продолжать разговор, если на меня давят эмоциями.", "It is hard for me to continue talking when strong emotions are pushed onto me."),
            make("q4", "Я считаю важным обсуждать не только чувства, но и конкретное решение.", "I think it is important to discuss not only feelings, but also a concrete solution."),
            make("q5", "После конфликта мне важно быстро вернуть нормальное общение.", "After a conflict, it is important for me to return to normal communication fairly quickly."),
            make("q6", "Я легче иду на примирение, когда со мной разговаривают уважительно.", "It is easier for me to reconcile when I am spoken to respectfully."),
          ]
        : [
            make("q1", "Во время ссоры мне важно, чтобы мои чувства не игнорировали.", "During an argument, it is important to me that my feelings are not ignored."),
            make("q2", "Мне легче мириться, когда партнёр сам делает шаг навстречу.", "It is easier for me to make up when my partner takes the first step."),
            make("q3", "В конфликте мне важно не только решение, но и то, как со мной говорят.", "In conflict, not only the solution matters to me, but also how I am spoken to."),
            make("q4", "Мне тяжело, когда после ссоры партнёр уходит в молчание.", "It is hard for me when my partner goes silent after an argument."),
            make("q5", "После конфликта мне важно услышать, что меня поняли.", "After a conflict, it is important for me to hear that I was understood."),
            make("q6", "Даже в ссоре я хочу чувствовать, что мы всё ещё на одной стороне.", "Even during a fight, I want to feel that we are still on the same side."),
          ];

    case "trust":
      return gender === "boy"
        ? [
            make("q1", "Для меня доверие — это честность даже в неприятных темах.", "For me, trust means honesty even in uncomfortable topics."),
            make("q2", "Мне важно, чтобы в отношениях не было скрытности без причины.", "It is important to me that there is no unnecessary secrecy in a relationship."),
            make("q3", "Я сильнее доверяю, когда слова совпадают с действиями.", "I trust more when words match actions."),
            make("q4", "Мне важно чувствовать, что партнёр на моей стороне даже в сложные периоды.", "It is important for me to feel that my partner is on my side even during difficult times."),
            make("q5", "Доверие для меня строится постепенно, а не появляется сразу.", "For me, trust is built gradually, not instantly."),
            make("q6", "Мне трудно быть открытым, если я чувствую подозрение в свой адрес.", "It is difficult for me to be open when I feel suspected."),
          ]
        : [
            make("q1", "Для меня доверие — это чувство безопасности рядом с человеком.", "For me, trust is the feeling of safety next to a person."),
            make("q2", "Мне важно, чтобы со мной были искренними даже в мелочах.", "It is important for me that people are sincere with me even in small things."),
            make("q3", "Я легче доверяю, когда вижу постоянство и внимание.", "I trust more easily when I see consistency and care."),
            make("q4", "Мне важно, чтобы мои переживания не использовали против меня.", "It matters to me that my vulnerabilities are not used against me."),
            make("q5", "Я чувствую доверие, когда могу быть собой без страха осуждения.", "I feel trust when I can be myself without fear of judgment."),
            make("q6", "Для меня доверие — это когда не нужно угадывать истинное отношение человека.", "For me, trust is when I do not have to guess a person's true attitude."),
          ];

    case "understanding":
      return gender === "boy"
        ? [
            make("q1", "Мне важно, чтобы партнёр пытался понять мою логику, а не только эмоции.", "It is important to me that my partner tries to understand my logic, not only emotions."),
            make("q2", "Я ценю, когда меня не перебивают и дают договорить мысль до конца.", "I appreciate it when I am not interrupted and can finish my thought."),
            make("q3", "Мне важно, чтобы мои усилия замечали, даже если я мало говорю о них.", "It matters to me that my efforts are noticed even if I do not talk about them much."),
            make("q4", "Я чувствую понимание, когда меня не заставляют быть другим человеком.", "I feel understood when I am not pressured to be someone else."),
            make("q5", "Мне важно, чтобы мои способы проявлять чувства тоже считались значимыми.", "It is important to me that my ways of showing feelings are also seen as meaningful."),
            make("q6", "Когда меня понимают без давления, я становлюсь более открытым.", "When I am understood without pressure, I become more open."),
          ]
        : [
            make("q1", "Мне важно, чтобы партнёр замечал моё состояние даже без слов.", "It is important to me that my partner notices how I feel even without words."),
            make("q2", "Я чувствую понимание, когда мои чувства принимают всерьёз.", "I feel understood when my feelings are taken seriously."),
            make("q3", "Мне важно, чтобы со мной были бережны в трудные моменты.", "It matters to me that I am treated gently in difficult moments."),
            make("q4", "Я ценю, когда партнёр умеет слушать, а не сразу давать советы.", "I appreciate it when my partner can listen instead of immediately giving advice."),
            make("q5", "Мне важно чувствовать эмоциональный отклик, а не только формальное участие.", "It is important for me to feel emotional response, not just formal involvement."),
            make("q6", "Когда меня действительно понимают, я чувствую близость сильнее.", "When I am truly understood, I feel closeness more strongly."),
          ];

    case "romance":
      return gender === "boy"
        ? [
            make("q1", "Мне нравятся отношения, в которых есть лёгкость, флирт и страсть.", "I like relationships that have lightness, flirting, and passion."),
            make("q2", "Я ценю неожиданные романтичные моменты больше, чем формальности.", "I value unexpected romantic moments more than formal gestures."),
            make("q3", "Для меня романтика — это не только слова, но и атмосфера.", "For me, romance is not only words, but also atmosphere."),
            make("q4", "Мне важно чувствовать взаимное влечение в отношениях.", "It is important for me to feel mutual attraction in a relationship."),
            make("q5", "Я люблю, когда отношения сохраняют искру даже со временем.", "I like when a relationship keeps its spark over time."),
            make("q6", "Романтика для меня делает отношения живыми и особенными.", "For me, romance makes a relationship feel alive and special."),
          ]
        : [
            make("q1", "Мне важны красивые мелочи, сюрпризы и знаки внимания.", "Beautiful little things, surprises, and thoughtful gestures matter to me."),
            make("q2", "Я чувствую романтику в атмосфере, взглядах и настроении момента.", "I feel romance in the atmosphere, looks, and mood of the moment."),
            make("q3", "Мне нравится, когда партнёр старается делать что-то особенное для нас.", "I like it when my partner tries to do something special for us."),
            make("q4", "Для меня романтика — это способ чувствовать себя желанной и любимой.", "For me, romance is a way to feel desired and loved."),
            make("q5", "Мне важно, чтобы в отношениях оставалось место для нежности и восхищения.", "It is important to me that there is still room for tenderness and admiration in a relationship."),
            make("q6", "Я люблю, когда даже обычный день можно сделать немного волшебным.", "I love when even an ordinary day can be made a little magical."),
          ];

   case "space":
      return gender === "boy"
        ? [
            make("q1", "Мне важно иметь время только для себя без чувства вины.", "It is important for me to have time just for myself without guilt."),
            make("q2", "Я считаю нормальным, когда у каждого есть свои интересы отдельно от пары.", "I think it is normal when each person has their own interests outside the couple."),
            make("q3", "Мне легче быть в отношениях, когда мои границы уважают.", "It is easier for me to be in a relationship when my boundaries are respected."),
            make("q4", "Мне важно, чтобы близость не превращалась в полный контроль.", "It is important to me that closeness does not turn into total control."),
            make("q5", "Я ценю доверие, когда не нужно отчитываться за каждый шаг.", "I value trust when I do not need to explain every step."),
            make("q6", "Личное пространство помогает мне сохранять внутренний баланс.", "Personal space helps me keep inner balance."),
          ]
        : [
            make("q1", "Мне важно, чтобы у каждого из нас оставалось своё пространство.", "It is important to me that each of us keeps some personal space."),
            make("q2", "Я спокойно отношусь к тому, что партнёр хочет побыть один.", "I am okay with my partner wanting some time alone."),
            make("q3", "Мне важно чувствовать доверие, а не контроль.", "It is important for me to feel trust, not control."),
            make("q4", "Я считаю, что любовь не должна лишать человека свободы.", "I believe love should not take away a person's freedom."),
            make("q5", "Мне комфортнее в отношениях, где уважают границы и личное время.", "I feel more comfortable in relationships where boundaries and personal time are respected."),
            make("q6", "Для меня близость и свобода могут спокойно существовать вместе.", "For me, closeness and freedom can peacefully exist together."),
          ];

   case "future":
      return gender === "boy"
        ? [
            make("q1", "Мне важно понимать, к чему ведут отношения.", "It is important for me to understand where the relationship is heading."),
            make("q2", "Я спокойнее чувствую себя, когда у пары есть общие планы.", "I feel calmer when a couple has shared plans."),
            make("q3", "Мне важно, чтобы взгляды на серьёзность отношений совпадали.", "It is important to me that our views on how serious the relationship is match."),
            make("q4", "Я думаю о будущем охотнее, если чувствую стабильность рядом.", "I think about the future more easily when I feel stability beside me."),
            make("q5", "Для меня важно обсуждать большие решения вместе.", "It is important to me to discuss big decisions together."),
            make("q6", "Я хочу чувствовать, что мы движемся в одном направлении.", "I want to feel that we are moving in the same direction."),
          ]
        : [
            make("q1", "Мне важно чувствовать, что отношения могут перерасти во что-то серьёзное.", "It is important for me to feel that the relationship can grow into something serious."),
            make("q2", "Я хочу понимать, есть ли у нас общее видение будущего.", "I want to understand whether we share a vision of the future."),
            make("q3", "Мне важно, чтобы важные планы обсуждались вместе.", "It is important to me that important plans are discussed together."),
            make("q4", "Я чувствую себя спокойнее, когда понимаю намерения партнёра.", "I feel calmer when I understand my partner's intentions."),
            make("q5", "Для меня важно, чтобы отношения не стояли на месте слишком долго.", "It is important to me that the relationship does not stay stagnant for too long."),
            make("q6", "Я хочу видеть рядом человека, с которым можно строить жизнь.", "I want to see beside me a person with whom I can build a life."),
          ];

    case "life":
      return gender === "boy"
        ? [
            make("q1", "Мне важно, чтобы обязанности в быту распределялись справедливо.", "It is important to me that household responsibilities are shared fairly."),
            make("q2", "Я ценю комфорт и спокойствие в повседневной жизни.", "I value comfort and calm in everyday life."),
            make("q3", "Мне важно, чтобы дома было ощущение порядка и уюта.", "It is important to me that home feels orderly and cozy."),
            make("q4", "Я считаю, что бытовые мелочи сильно влияют на отношения.", "I think everyday household details strongly affect a relationship."),
            make("q5", "Мне важно, чтобы партнёр умел договариваться по бытовым вопросам.", "It is important to me that my partner can communicate and compromise about household matters."),
            make("q6", "Совместная жизнь для меня — это ещё и про командность в обычных делах.", "For me, living together is also about teamwork in ordinary things."),
          ]
        : [
            make("q1", "Мне важно, чтобы забота проявлялась и в повседневных мелочах.", "It is important to me that care shows up in everyday little things."),
            make("q2", "Я ценю, когда бытовые вопросы не ложатся только на одного человека.", "I value it when daily responsibilities do not fall on just one person."),
            make("q3", "Мне важно чувствовать, что дом — это общее пространство, а не чья-то обязанность.", "It is important to me to feel that home is a shared space, not one person's duty."),
            make("q4", "Для меня бытовая гармония влияет на эмоциональную близость.", "For me, harmony in daily life affects emotional closeness."),
            make("q5", "Мне важно, чтобы партнёр замечал, что нужно сделать без постоянных напоминаний.", "It matters to me that my partner notices what needs to be done without constant reminders."),
            make("q6", "Я чувствую больше тепла в отношениях, когда есть взаимная помощь в обычной жизни.", "I feel more warmth in a relationship when there is mutual help in ordinary life."),
          ];

   case "jealousy":
      return gender === "boy"
        ? [
            make("q1", "Я считаю важным доверять партнёру без постоянных подозрений.", "I think it is important to trust a partner without constant suspicion."),
            make("q2", "Мне некомфортно, когда ревность превращается в контроль.", "I feel uncomfortable when jealousy turns into control."),
            make("q3", "Для меня границы важнее, чем запреты.", "For me, boundaries matter more than prohibitions."),
            make("q4", "Я считаю, что внимание к другим людям не всегда угрожает отношениям.", "I believe that attention to other people does not always threaten a relationship."),
            make("q5", "Мне важно, чтобы доверие было сильнее поводов для ревности.", "It is important to me that trust is stronger than reasons for jealousy."),
            make("q6", "Спокойствие в отношениях для меня важнее драматичных проверок чувств.", "Calmness in a relationship is more important to me than dramatic tests of feelings."),
          ]
        : [
            make("q1", "Мне важно чувствовать себя особенной и выбранной в отношениях.", "It is important for me to feel special and chosen in a relationship."),
            make("q2", "Я спокойнее, когда в отношениях есть ясные границы с другими людьми.", "I feel calmer when there are clear boundaries with other people in a relationship."),
            make("q3", "Для меня ревность чаще связана со страхом потери, чем с желанием контролировать.", "For me, jealousy is more often connected to fear of loss than to a desire to control."),
            make("q4", "Мне важно чувствовать, что партнёр сам бережёт мои чувства.", "It is important for me to feel that my partner protects my feelings on their own."),
            make("q5", "Я легче справляюсь с ревностью, когда со мной честны и открыты.", "I cope with jealousy more easily when people are honest and open with me."),
            make("q6", "Для меня спокойствие в отношениях рождается из уважения и определённости.", "For me, peace in a relationship comes from respect and clarity."),
          ];

    default:
      return [];
  }
}

  const POLL_THEMES = [
    
  {
    key: "communication",
    titleRu: "Общение",
    titleEn: "Communication",
    descriptionRu:
      "Как ты общаешься, что тебе важно в разговорах и взаимопонимании.",
    descriptionEn:
      "How you communicate and what matters most to you in conversations and mutual understanding.",
    theme: "communication",
    matchGroup: "communication",
  },
  {
    key: "love",
    titleRu: "Любовь",
    titleEn: "Love",
    descriptionRu:
      "Как ты чувствуешь любовь, заботу и эмоциональную близость.",
    descriptionEn:
      "How you experience love, care, and emotional closeness.",
    theme: "love",
    matchGroup: "love",
  },
  {
    key: "conflicts",
    titleRu: "Конфликты",
    titleEn: "Conflicts",
    descriptionRu:
      "Как ты относишься к ссорам, примирению и компромиссам.",
    descriptionEn:
      "How you handle arguments, making up, and compromise.",
    theme: "conflicts",
    matchGroup: "conflicts",
  },
  {
    key: "trust",
    titleRu: "Доверие",
    titleEn: "Trust",
    descriptionRu:
      "Насколько для тебя важны честность, спокойствие и надёжность.",
    descriptionEn:
      "How important honesty, stability, and reliability are to you.",
    theme: "trust",
    matchGroup: "trust",
  },
  {
    key: "understanding",
    titleRu: "Понимание",
    titleEn: "Understanding",
    descriptionRu:
      "Насколько тебе важны эмпатия и эмоциональная близость.",
    descriptionEn:
      "How important empathy and emotional closeness are to you.",
    theme: "understanding",
    matchGroup: "understanding",
  },
  {
    key: "romance",
    titleRu: "Романтика",
    titleEn: "Romance",
    descriptionRu:
      "Про свидания, сюрпризы, страсть и атмосферу в отношениях.",
    descriptionEn:
      "About dates, surprises, passion, and the atmosphere in a relationship.",
    theme: "romance",
    matchGroup: "romance",
  },
  {
    key: "space",
    titleRu: "Личное пространство",
    titleEn: "Personal Space",
    descriptionRu:
      "Сколько свободы, независимости и личного времени тебе нужно.",
    descriptionEn:
      "How much freedom, independence, and personal time you need.",
    theme: "space",
    matchGroup: "space",
  },
  {
    key: "future",
    titleRu: "Будущее",
    titleEn: "Future",
    descriptionRu:
      "Про серьёзность отношений, планы и общие цели.",
    descriptionEn:
      "About commitment, plans, and shared goals.",
    theme: "future",
    matchGroup: "future",
  },
  {
    key: "life",
    titleRu: "Быт",
    titleEn: "Daily Life",
    descriptionRu:
      "Как ты видишь совместную жизнь, обязанности и повседневность.",
    descriptionEn:
      "How you see living together, responsibilities, and everyday life.",
    theme: "life",
    matchGroup: "life",
  },
  {
    key: "jealousy",
    titleRu: "Ревность",
    titleEn: "Jealousy",
    descriptionRu:
      "Как ты относишься к ревности, границам и вниманию к другим людям.",
    descriptionEn:
      "How you feel about jealousy, boundaries, and attention from other people.",
    theme: "jealousy",
    matchGroup: "jealousy",
  },
] as const;

const POLLS: Poll[] = POLL_THEMES.flatMap((item, index) => {
  const page = Math.floor(index / 2) + 1;

  return [
    {
      id: `boy-${item.key}`,

      title: item.titleRu,
      description: item.descriptionRu,

      titleRu: item.titleRu,
      titleEn: item.titleEn,
      descriptionRu: item.descriptionRu,
      descriptionEn: item.descriptionEn,

      reward: 60,
      gender: "boy" as const,
      page,
      theme: item.theme,
      matchGroup: item.matchGroup,
      questions: createPollQuestions(item.theme, "boy"),
    },
    {
      id: `girl-${item.key}`,

      title: item.titleRu,
      description: item.descriptionRu,

      titleRu: item.titleRu,
      titleEn: item.titleEn,
      descriptionRu: item.descriptionRu,
      descriptionEn: item.descriptionEn,

      reward: 60,
      gender: "girl" as const,
      page,
      theme: item.theme,
      matchGroup: item.matchGroup,
      questions: createPollQuestions(item.theme, "girl"),
    },
  ];
});


const GAMES: Game[] = [

{
  id: "never-have-i-ever",
  title: "Я никогда не...",
  description:
    "Скажите что-то, чего вы никогда в жизни не делали, и если ваш партнёр делал это, он выполняет задание с карточки.",
  reward: 0,
  questions: [],
},

  {
    id: "bottle",
    title: "Бутылочка",
    description: "Крути бутылку и получай романтичные и дерзкие задания для пары.",
    reward: 0,
    questions: [],
  },

    {
    id: "90-questions",
    title: "90 вопросов",
    description: "Случайные глубокие вопросы про любовь, чувства и отношения.",
    reward: 0,
    questions: [],
  },    
];

const AI_PSYCHOLOGIST_QUESTIONS = [
  {
    id: "communication-1",
    category: "communication",
    text: "Как часто вам трудно спокойно поговорить друг с другом?",
    options: ["Редко", "Иногда", "Часто"],
  },
  {
    id: "trust-1",
    category: "trust",
    text: "Бывает ли в ваших отношениях недоверие?",
    options: ["Нет", "Иногда", "Да"],
  },
  {
    id: "conflicts-1",
    category: "conflicts",
    text: "Как часто мелочи перерастают в ссору?",
    options: ["Редко", "Иногда", "Часто"],
  },
  {
    id: "closeness-1",
    category: "closeness",
    text: "Чувствуете ли вы эмоциональную близость друг к другу?",
    options: ["Да", "Иногда", "Нет"],
  },
  {
    id: "support-1",
    category: "support",
    text: "Чувствуете ли вы поддержку от партнёра?",
    options: ["Да", "Иногда", "Нет"],
  },
  {
    id: "resentment-1",
    category: "resentment",
    text: "Как часто вы копите обиды и не проговариваете их?",
    options: ["Редко", "Иногда", "Часто"],
  },
];



const BOTTLE_TASKS: BottleTask[] = [
  { id: "b1", target: "girl", text: "Скажи партнёру самый милый комплимент." },
  { id: "b2", target: "girl", text: "Обними партнёра на 15 секунд." },
  { id: "b3", target: "girl", text: "Поцелуй партнёра в щёку." },
  { id: "b4", target: "girl", text: "Расскажи, что тебе в нём нравится больше всего." },
  { id: "b5", target: "girl", text: "Скажи, какое свидание с ним было бы идеальным." },
  { id: "b6", target: "girl", text: "Проведи рукой по его волосам и улыбнись." },
  { id: "b7", target: "girl", text: "Прошепчи ему что-нибудь приятное на ухо." },
  { id: "b8", target: "girl", text: "Назови одну его привычку, которая тебя заводит." },

  { id: "b9", target: "boy", text: "Скажи партнёрше самый красивый комплимент." },
  { id: "b10", target: "boy", text: "Обними её на 15 секунд." },
  { id: "b11", target: "boy", text: "Поцелуй её в щёку." },
  { id: "b12", target: "boy", text: "Скажи три причины, почему она тебе нравится." },
  { id: "b13", target: "boy", text: "Назови её самую привлекательную черту." },
  { id: "b14", target: "boy", text: "Возьми её за руку и не отпускай 20 секунд." },
  { id: "b15", target: "boy", text: "Скажи, что бы ты хотел повторить с вашим лучшим свиданием." },
  { id: "b16", target: "boy", text: "Сделай ей короткое романтичное признание." },
];


const LOVE_QUESTIONS: LoveQuestion[] = [
  { id: "lq1", text: "Когда ты в последний раз чувствовал(а) себя по-настоящему любимым(ой)?" },
  { id: "lq2", text: "Что для тебя значит настоящая близость в отношениях?" },
  { id: "lq3", text: "Чего тебе иногда не хватает в любви?" },
  { id: "lq4", text: "Что ты боишься потерять в отношениях сильнее всего?" },
  { id: "lq5", text: "Как ты обычно показываешь, что человек тебе дорог?" },
  { id: "lq6", text: "Какие слова ты хотел(а) бы чаще слышать от партнёра?" },
  { id: "lq7", text: "Какой момент в отношениях ты считаешь самым тёплым?" },
  { id: "lq8", text: "Что делает человека по-настоящему надёжным для тебя?" },
  { id: "lq9", text: "Как ты понимаешь, что можешь доверять человеку?" },
  { id: "lq10", text: "Что в отношениях даёт тебе чувство безопасности?" },

  { id: "lq11", text: "О чём тебе бывает сложно говорить даже с близким человеком?" },
  { id: "lq12", text: "Как ты ведёшь себя, когда обижаешься?" },
  { id: "lq13", text: "Что тебе помогает мириться после ссоры?" },
  { id: "lq14", text: "За что ты можешь долго злиться?" },
  { id: "lq15", text: "Что бы ты никогда не хотел(а) пережить в отношениях снова?" },
  { id: "lq16", text: "Какая твоя самая сильная потребность в любви?" },
  { id: "lq17", text: "Какие поступки ранят тебя сильнее слов?" },
  { id: "lq18", text: "Как ты понимаешь, что человек тебя слышит?" },
  { id: "lq19", text: "Что тебе нужно в трудный день от любимого человека?" },
  { id: "lq20", text: "Как выглядит идеальная эмоциональная поддержка для тебя?" },

  { id: "lq21", text: "Что для тебя важнее: страсть, дружба или спокойствие в отношениях?" },
  { id: "lq22", text: "Что ты считаешь красным флагом в отношениях?" },
  { id: "lq23", text: "Что помогает тебе открываться человеку?" },
  { id: "lq24", text: "В какой момент ты чувствуешь себя особенно уязвимым(ой)?" },
  { id: "lq25", text: "Как ты реагируешь, когда ревнуешь?" },
  { id: "lq26", text: "Что для тебя уже считается изменой?" },
  { id: "lq27", text: "Как ты понимаешь слово «верность»?" },
  { id: "lq28", text: "Что тебе важно сохранять личным даже в отношениях?" },
  { id: "lq29", text: "Какой формат свободы в паре тебе кажется здоровым?" },
  { id: "lq30", text: "Что тебя успокаивает, когда в отношениях появляется тревога?" },

  { id: "lq31", text: "О каком будущем с любимым человеком ты мечтаешь?" },
  { id: "lq32", text: "Ты больше про стабильность или про яркие эмоции?" },
  { id: "lq33", text: "Что для тебя значит «быть командой»?" },
  { id: "lq34", text: "Какие семейные ценности тебе особенно близки?" },
  { id: "lq35", text: "Как ты представляешь идеальный совместный вечер?" },
  { id: "lq36", text: "Какой отдых с любимым человеком тебе ближе всего?" },
  { id: "lq37", text: "Какая мелочь в отношениях делает тебя счастливым(ой)?" },
  { id: "lq38", text: "Что ты особенно ценишь в заботе?" },
  { id: "lq39", text: "Какие ритуалы в паре тебе нравятся?" },
  { id: "lq40", text: "Как ты относишься к сюрпризам в отношениях?" },

  { id: "lq41", text: "Когда ты чувствуешь романтику сильнее всего?" },
  { id: "lq42", text: "Какие свидания тебе нравятся больше: тихие или яркие?" },
  { id: "lq43", text: "Что для тебя значит быть желанным(ой)?" },
  { id: "lq44", text: "Какая твоя любимая форма нежности?" },
  { id: "lq45", text: "Как ты понимаешь, что тебя по-настоящему принимают?" },
  { id: "lq46", text: "Что тебе хотелось бы чаще делать вместе с партнёром?" },
  { id: "lq47", text: "Что бы ты хотел(а) попробовать в отношениях впервые?" },
  { id: "lq48", text: "Какую мечту ты бы хотел(а) разделить с любимым человеком?" },
  { id: "lq49", text: "Какой разговор между вами ты считаешь самым важным?" },
  { id: "lq50", text: "За что тебе сложнее всего просить прощения?" },

  { id: "lq51", text: "Чего ты ждёшь от партнёра в трудные периоды жизни?" },
  { id: "lq52", text: "Что тебе помогает чувствовать связь после дистанции?" },
  { id: "lq53", text: "Что для тебя важнее: внимание или действия?" },
  { id: "lq54", text: "Какой комплимент запоминается тебе надолго?" },
  { id: "lq55", text: "Что бы ты хотел(а) изменить в своём поведении в отношениях?" },
  { id: "lq56", text: "Какой урок тебе дали прошлые отношения?" },
  { id: "lq57", text: "Что ты особенно бережёшь в любви?" },
  { id: "lq58", text: "Какие обещания в отношениях для тебя священны?" },
  { id: "lq59", text: "Как ты понимаешь, что вас двоих тянет друг к другу по-настоящему?" },
  { id: "lq60", text: "Когда тебе бывает особенно важно побыть рядом молча?" },

  { id: "lq61", text: "Что бы ты хотел(а), чтобы партнёр лучше понимал о тебе?" },
  { id: "lq62", text: "Как ты переживаешь отдаление в отношениях?" },
  { id: "lq63", text: "Что помогает тебе снова сближаться после напряжения?" },
  { id: "lq64", text: "Какая твоя слабая сторона чаще всего проявляется в любви?" },
  { id: "lq65", text: "В чём ты особенно нуждаешься, но редко об этом говоришь?" },
  { id: "lq66", text: "Что тебе сложнее: довериться или сохранить чувства?" },
  { id: "lq67", text: "Какой поступок может вернуть тебе веру в отношения?" },
  { id: "lq68", text: "Что тебе важно слышать после ссоры?" },
  { id: "lq69", text: "Как ты понимаешь, что отношения становятся серьёзными?" },
  { id: "lq70", text: "Какие границы для тебя обязательны в любви?" },

  { id: "lq71", text: "Что ты ценишь в человеке сильнее внешности?" },
  { id: "lq72", text: "Какая черта делает человека особенно привлекательным?" },
  { id: "lq73", text: "Что тебя вдохновляет любить сильнее?" },
  { id: "lq74", text: "Как ты относишься к проявлению слабости перед любимым человеком?" },
  { id: "lq75", text: "Что даёт тебе чувство «мы»?" },
  { id: "lq76", text: "В каких моментах тебе особенно нужна поддержка?" },
  { id: "lq77", text: "Как ты представляешь счастливую совместную жизнь?" },
  { id: "lq78", text: "Что для тебя важнее: совпадение характеров или усилия друг ради друга?" },
  { id: "lq79", text: "Какие слова любви для тебя звучат наиболее искренне?" },
  { id: "lq80", text: "Что ты хотел(а) бы чаще делать для любимого человека?" },

  { id: "lq81", text: "О чём ты мечтаешь рассказать партнёру, но всё откладываешь?" },
  { id: "lq82", text: "Какая общая цель могла бы сделать вашу пару сильнее?" },
  { id: "lq83", text: "Какой страх в любви тебе хотелось бы отпустить?" },
  { id: "lq84", text: "Что делает отношения для тебя зрелыми?" },
  { id: "lq85", text: "Как ты понимаешь, что человека можно назвать «своим»?" },
  { id: "lq86", text: "Что бы ты хотел(а) сохранить в отношениях на долгие годы?" },
  { id: "lq87", text: "Как ты относишься к полной честности в любви?" },
  { id: "lq88", text: "Что бы ты хотел(а) услышать от партнёра прямо сейчас?" },
  { id: "lq89", text: "Какая мечта о любви у тебя была с детства?" },
  { id: "lq90", text: "Что для тебя значит любить по-настоящему?" },
];

const PAIR_LEVELS = [
  { level: 1, title: "Новички", points: 0 },
  { level: 2, title: "Искра", points: 300 },
  { level: 3, title: "Сближение", points: 700 },
  { level: 4, title: "Тёплая связь", points: 1200 },
  { level: 5, title: "На одной волне", points: 1800 },
  { level: 6, title: "Сильная пара", points: 2500 },
  { level: 7, title: "Идеальный союз", points: 3500 },
  { level: 8, title: "Легенды любви", points: 5000 },
] as const;

function getAiPsychologistResult(answers: number[]) {
  let problemScore = 0;

  answers.forEach((value, index) => {
    const q = AI_PSYCHOLOGIST_QUESTIONS[index];
    if (!q) return;

    // Для позитивных вопросов переворачиваем шкалу
    const isPositive =
      q.category === "closeness" || q.category === "support";

    const normalized = isPositive ? 2 - value : value;
    problemScore += normalized;
  });

  if (problemScore >= 9) {
    return {
      title: "Есть напряжение, которое лучше не игнорировать",
      subtitle: "Сейчас у пары есть заметные точки напряжения",
      description:
        "Похоже, вам не всегда хватает спокойного диалога, доверия или чувства безопасности рядом друг с другом. Это не значит, что отношения плохие — скорее, им сейчас особенно нужны внимание, честный разговор и бережность.",
      advice: [
        "Обсудите одну тему без спора и взаимных обвинений",
        "Спросите друг друга: чего мне сейчас не хватает в отношениях?",
        "Не копите обиды — проговорите хотя бы одну из них спокойно",
      ],
    };
  }

  if (problemScore >= 5) {
    return {
      title: "В целом всё неплохо, но есть над чем поработать",
      subtitle: "У пары есть хороший потенциал",
      description:
        "У вас уже есть база, но некоторые моменты периодически создают дистанцию или недопонимание. Хорошая новость в том, что это можно быстро улучшить через честный контакт и внимание к чувствам друг друга.",
      advice: [
        "Выделите вечер на спокойный разговор без телефонов",
        "Обсудите, что помогает вам чувствовать близость",
        "Старайтесь замечать не только проблемы, но и сильные стороны пары",
      ],
    };
  }

  return {
    title: "У вашей пары хорошая эмоциональная база",
    subtitle: "Между вами есть близость и опора",
    description:
      "Похоже, вы умеете слышать друг друга и в ваших отношениях уже есть доверие, поддержка и контакт. Это сильная основа, которую важно продолжать укреплять маленькими действиями каждый день.",
    advice: [
      "Продолжайте говорить о чувствах открыто",
      "Поддерживайте ритуалы близости — разговоры, свидания, заботу",
      "Не забывайте замечать хорошее друг в друге",
    ],
  };
}

function getPairLevelInfo(points: number): PairLevelInfo {
  const safePoints = Math.max(0, points);

  let current: (typeof PAIR_LEVELS)[number] = PAIR_LEVELS[0];
  let next: (typeof PAIR_LEVELS)[number] | null = null;

  for (let i = 0; i < PAIR_LEVELS.length; i++) {
    const level = PAIR_LEVELS[i];
    const following = PAIR_LEVELS[i + 1] ?? null;

    if (safePoints >= level.points) {
      current = level;
      next = following;
    } else {
      break;
    }
  }

  
  const currentLevelPoints = current.points;
  const nextLevelPoints = next ? next.points : null;
  const progressInLevel = safePoints - currentLevelPoints;
  const progressMax = next ? next.points - current.points : 0;

  const progressPercent =
    next && progressMax > 0
      ? Math.max(0, Math.min(100, (progressInLevel / progressMax) * 100))
      : 100;

  return {
    level: current.level,
    title: current.title,
    currentLevelPoints,
    nextLevelPoints,
    progressInLevel,
    progressMax,
    progressPercent,
  };
}

const STREAK_BONUSES = [
  { days: 3, points: 100 },
  { days: 5, points: 200 },
  { days: 10, points: 500 },
  { days: 15, points: 750 },
];

const DAILY_PAIR_MATCH_BONUS = 25;


const REWARD_CATEGORIES_OLD: RewardCategory[] = [
  
  {
    id: "dyson",
    title: "Dyson",
    emoji: "💨",
    weight: 1,
    items: [{ id: "dyson-hairdryer", title: "Фен Dyson", weight: 1 }],
  },
  {
    id: "spa",
    title: "SPA",
    emoji: "🧖",
    weight: 2,
    items: [{ id: "spa-for-two", title: "Сертификат в SPA на двоих", weight: 1 }],
  },
  {
    id: "alisa",
    title: "Алиса",
    emoji: "🔊",
    weight: 3,
    items: [{ id: "alisa-speaker", title: "Умная колонка Алиса", weight: 1 }],
  },
  {
    id: "wb",
    title: "WB",
    emoji: "🛍️",
    weight: 6,
    items: [
      { id: "wb500", title: "Подарочный сертификат WB 500₽", weight: 10 },
      { id: "wb1000", title: "Подарочный сертификат WB 1000₽", weight: 6 },
      { id: "wb2000", title: "Подарочный сертификат WB 2000₽", weight: 3 },
      { id: "wb5000", title: "Подарочный сертификат WB 5000₽", weight: 1 },
    ],
  },
  {
    id: "goldapple",
    title: "ЗЯ",
    emoji: "💄",
    weight: 7,
    items: [
      { id: "goldapple300", title: 'Купон "Золотое яблоко" 300₽', weight: 10 },
      { id: "goldapple500", title: 'Купон "Золотое яблоко" 500₽', weight: 7 },
      { id: "goldapple1000", title: 'Купон "Золотое яблоко" 1000₽', weight: 4 },
      { id: "goldapple2000", title: 'Купон "Золотое яблоко" 2000₽', weight: 2 },
      { id: "goldapple5000", title: 'Купон "Золотое яблоко" 5000₽', weight: 1 },
    ],
  },
  {
    id: "dates",
    title: "Свидания",
    emoji: "💖",
    weight: 8,
    items: [
      { id: "photoshoot", title: "Парная фотосессия", weight: 3 },
      { id: "romantic-dinner", title: "Романтический ужин «Вкусно и точка»", weight: 7 },
    ],
  },
  {
    id: "tickets",
    title: "Билеты",
    emoji: "🎟️",
    weight: 8,
    items: [
      { id: "cinema", title: "Два билета в кино", weight: 8 },
      { id: "theatre", title: "Два билета в театр", weight: 3 },
    ],
  },
  {
    id: "pair-items",
    title: "Парные",
    emoji: "👕",
    weight: 10,
    items: [
      { id: "pajamas", title: "Парные пижамки", weight: 2 },
      { id: "tshirts", title: "Парные футболочки", weight: 4 },
      { id: "socks", title: "Носочки для него / для неё", weight: 8 },
    ],
  },
  {
    id: "food",
    title: "Еда",
    emoji: "🍣",
    weight: 12,
    items: [{ id: "rolls", title: "Доставка роллов", weight: 1 }],
  },
  {
    id: "activities",
    title: "Активности",
    emoji: "🎳",
    weight: 9,
    items: [
      { id: "pottery", title: "Мастер-класс гончарный", weight: 3 },
      { id: "bowling", title: "Боулинг на двоих", weight: 5 },
      { id: "boardgame", title: "Настольная игра для пары", weight: 6 },
    ],
  },
];

const DAILY_PAIR_QUESTIONS: DailyPairQuestion[] = [
  {
    id: "dp1",
    text: "Что важнее всего для крепких отношений?",
    options: ["Доверие", "Забота", "Страсть", "Свобода"],
  },
  {
    id: "dp2",
    text: "Как лучше всего мириться после ссоры?",
    options: ["Разговором", "Объятием", "Пауза и время", "Шуткой"],
  },
  {
    id: "dp3",
    text: "Какой идеальный вечер для пары?",
    options: ["Фильм дома", "Прогулка", "Ужин вне дома", "Поездка"],
  },
  {
    id: "dp4",
    text: "Что сильнее всего показывает любовь?",
    options: ["Слова", "Поступки", "Прикосновения", "Время вместе"],
  },
  {
    id: "dp5",
    text: "Что важнее в отношениях каждый день?",
    options: ["Поддержка", "Честность", "Нежность", "Внимание"],
  },
  {
    id: "dp6",
    text: "Как лучше проводить выходные вдвоём?",
    options: ["Дома", "Активно", "С друзьями", "Спонтанно"],
  },
  {
    id: "dp7",
    text: "Что сильнее всего разрушает близость?",
    options: ["Ложь", "Холодность", "Ревность", "Безразличие"],
  },
];

const WHEEL_COLORS = [
  "#ff8fb1",
  "#8fb8ff",
  "#c7a6ff",
  "#ffd17e",
  "#98e1d2",
  "#ffb48f",
  "#9fc4ff",
  "#d8b4ff",
  "#ff9ecf",
  "#a8e6a1",
];



const DEFAULT_STATE: AppState = {
  points: 0,
  isPremium: false,


  referrals: {
  invitedUsers: [],
  totalReward: 0,
},

 
loveQuestionsAnsweredIds: [],

profile: {
  displayName: "",
  avatar: null,
  gender: null,
},

completionBonusesClaimed: {
  polls: false,
  tests: false,
  games: false,
},

playedGameRewardKeys: [],


  dailyBonus: {
    streakDay: 1,
    lastClaimDate: null,
    totalPointsEarnedFromBonus: 0,
  },

  lastDailyBonusPopupDate: null,

  stats: {
    pollsCompleted: 0,
    gamesPlayed: 0,
    testsCompleted: 0,
    rewardsRedeemed: 0,
  },

  completedPollIds: [],
  wonRewards: [],
  weeklyTopRewardClaimedWeek: null,

  completedTestIds: [],
  completedGameIds: [],
  pollAnswers: {},
  pairPollAnswers: {},

  pair: {
  pairId: null,
  inviteCode: null,
  partner: null,
  createdByTelegramId: null,
  totalPoints: 0,
},

  dailyPair: {
    boy: {
      date: null,
      questionId: null,
      answerIndex: null,
    },
    girl: {
      date: null,
      questionId: null,
      answerIndex: null,
    },
  },

  dailyPairHistory: [],

  dailyPairMatchBonusClaimedDates: [],

  dailyPairStreak: {
  current: 0,
  reachedMilestones: [],
},

loveQuestionsProgress: {
  currentIndex: 0,
},

  


};

function getStreakBonus(streak: number): number {
  const reward = STREAK_BONUSES.find((b) => b.days === streak);
  return reward ? reward.points : 0;
}

function getNextStreakBonus(streak: number) {
  return STREAK_BONUSES.find((item) => item.days > streak) ?? null;
}

function getScaleResult(totalScore: number, maxScore: number): TestResult {
  const ratio = totalScore / maxScore;

  if (ratio < 0.45) {
    return {
      title: "Низкий уровень доверия",
      subtitle: "Есть напряжение и осторожность",
      description:
        "Похоже, в отношениях тебе пока не всегда спокойно и безопасно. Это не приговор — чаще всего доверие растёт через честные разговоры, стабильность и предсказуемость.",
    };
  }

  if (ratio < 0.75) {
    return {
      title: "Средний уровень доверия",
      subtitle: "Основа есть, но не без сомнений",
      description:
        "У вас уже есть база доверия, но в некоторых ситуациях тревога и сомнения всё ещё могут включаться. Здесь хорошо работают открытость, уважение границ и регулярный контакт.",
    };
  }

   return {
    title: "Высокий уровень доверия",
    subtitle: "В отношениях много опоры и безопасности",
    description:
      "Ты чувствуешь рядом с партнёром стабильность, принятие и эмоциональную безопасность. Это сильная основа для близких и зрелых отношений.",
  };
}
  
function getLoveLanguageResult(answerIndexes: number[]): TestResult {
  const labels = [
    "Слова поддержки",
    "Прикосновения",
    "Подарки",
    "Время вместе",
    "Помощь и забота",
  ];

  const counts = [0, 0, 0, 0, 0];
  answerIndexes.forEach((idx) => {
    if (idx >= 0 && idx < counts.length) counts[idx] += 1;
  });

  let topIndex = 0;
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] > counts[topIndex]) topIndex = i;
  }

  const secondary = [...counts.keys()]
    .filter((i) => i !== topIndex)
    .sort((a, b) => counts[b] - counts[a])[0];

  return {
    title: labels[topIndex],
    subtitle: `Дополнительный язык: ${labels[secondary]}`,
    description:
      topIndex === 0
        ? "Для тебя особенно важны слова, поддержка, комплименты и искренние признания."
        : topIndex === 1
        ? "Ты сильнее всего чувствуешь любовь через объятия, поцелуи, нежность и телесный контакт."
        : topIndex === 2
        ? "Тебе особенно приятны подарки, сюрпризы и материальные знаки внимания как символ любви."
        : topIndex === 3
        ? "Для тебя важнее всего качественное время вместе, когда внимание принадлежит только вам двоим."
        : "Ты ярче всего чувствуешь любовь через действия: помощь, заботу и участие в твоей жизни.",
  };
}

function PairScreen({
  user,
  pair,
  points,
  pairLevel,
  pairPollAnswers,
  dailyPairStreak,
  onBack,
  onOpenInvite,
  onOpenDailyQuestion,
  onOpenCompatibilityInfo,
  onOpenPolls,
  t,
}: {
  user: TgUser | null;
  pair: PairState;
  points: number;
  pairLevel: ReturnType<typeof getPairLevelInfo>;
  pairPollAnswers: Record<string, number[]>;
  dailyPairStreak: {
    current: number;
    reachedMilestones: number[];
  };
  onBack: () => void;
  onOpenInvite: () => void;
  onOpenDailyQuestion: () => void;
  onOpenCompatibilityInfo: () => void;
  onOpenPolls: () => void;
  t: any;
}) {
  const hasPairCreated = !!pair.pairId;
  const hasPartnerConnected = !!pair.partner;
  const hasFullPair = hasPairCreated && hasPartnerConnected;

  const pairStats = calculatePairStats(pairPollAnswers);
  const compatibilityProfile = buildCompatibilityProfile(pairPollAnswers || {});

  function avatarCircle(name?: string, lastName?: string, photoUrl?: string) {
    if (photoUrl) {
      return (
        <img
          src={photoUrl}
          alt={name || "User"}
          style={{
            width: 58,
            height: 58,
            borderRadius: 999,
            objectFit: "cover",
            border: "2px solid rgba(255,255,255,0.45)",
            flexShrink: 0,
          }}
        />
      );
    }

    return (
      <div
        style={{
          width: 58,
          height: 58,
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(255,255,255,0.34)",
          color: "#201a39",
          fontWeight: 900,
          fontSize: 20,
          border: "2px solid rgba(255,255,255,0.42)",
          flexShrink: 0,
        }}
      >
        {getInitials(name, lastName)}
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ ...cardBaseStyle(), padding: 18 }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: "#1f1d3a" }}>
          {t.pair.title}
        </div>

        <div
          style={{
            marginTop: 8,
            color: "#3a345c",
            fontSize: 15,
            lineHeight: 1.45,
          }}
        >
          {t.pair.subtitle}
        </div>
      </div>

      <button
        onClick={onOpenDailyQuestion}
        style={{
          ...primaryButtonStyle,
          width: "100%",
          marginTop: 10,
          marginBottom: 0,
        }}
      >
        {t.pair.dailyQuestion}
      </button>
      <div
  style={{
    marginTop: 6,
    fontSize: 13,
    color: "#4b446a",
  }}
>
  Отвечайте вместе каждый день и получайте бонусы 💞
</div>
<div
  style={{
    marginTop: 6,
    fontSize: 12,
    color: "#6b5cff",
    fontWeight: 700,
  }}
>
  🔥 Серия: {dailyPairStreak?.current || 0} дней
</div>

      {!hasPairCreated ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ ...cardBaseStyle(), padding: 18 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.30)",
                color: "#3b3158",
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              {t.pair.statusNotConnected}
            </div>

            <div
              style={{
                marginTop: 14,
                fontSize: 22,
                fontWeight: 900,
                color: "#1f1d3a",
              }}
            >
              {t.pair.noPairTitle}
            </div>

            <div
              style={{
                marginTop: 8,
                color: "#4b446a",
                lineHeight: 1.45,
                fontSize: 14,
              }}
            >
              {t.pair.noPairText}
            </div>

            <button
              onClick={onOpenInvite}
              style={{
                ...primaryButtonStyle,
                width: "100%",
                marginTop: 14,
              }}
            >
              {t.pair.invitePartner}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ marginTop: 10 }}>
            <div style={{ ...cardBaseStyle(), padding: 18 }}>
             

              <div
  style={{
    fontSize: 22,
    fontWeight: 900,
    color: "#1f1d3a",
  }}
>
  {hasFullPair ? "Вы в паре 💕" : "Вы создали пару 💞"}
</div>

<div
  style={{
    marginTop: 6,
    fontSize: 13,
    color: "#4b446a",
  }}
>
  Продолжайте узнавать друг друга 💫
</div>

              {!hasPartnerConnected && (
                <div
                  style={{
                    marginTop: 8,
                    color: "#4b446a",
                    lineHeight: 1.45,
                    fontSize: 14,
                  }}
                >
                  Отправь код или ссылку партнёру, чтобы он подключился к вашей
                  паре.
                </div>
              )}

              <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: 18,
                    background: "rgba(255,255,255,0.24)",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  {avatarCircle(
                    user?.first_name,
                    user?.last_name,
                    user?.photo_url
                  )}

                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: "#2c2647", fontWeight: 700 }}>Ты</div>
                    <div
                      style={{
                        color: "#1c1733",
                        fontWeight: 900,
                        marginTop: 4,
                        fontSize: 16,
                        lineHeight: 1.2,
                        wordBreak: "break-word",
                      }}
                    >
                      {[user?.first_name, user?.last_name]
                        .filter(Boolean)
                        .join(" ") || "Пользователь"}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        color: "#5a5378",
                        fontSize: 13,
                        wordBreak: "break-word",
                      }}
                    >
                      {user?.username && `@${user.username}`}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: 18,
                    background: "rgba(255,255,255,0.24)",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  {hasPartnerConnected ? (
                    avatarCircle(
                      pair.partner?.firstName,
                      pair.partner?.lastName,
                      pair.partner?.photoUrl
                    )
                  ) : (
                    <div
                      style={{
                        width: 58,
                        height: 58,
                        borderRadius: 999,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(255,255,255,0.34)",
                        color: "#201a39",
                        fontWeight: 900,
                        fontSize: 24,
                        border: "2px solid rgba(255,255,255,0.42)",
                        flexShrink: 0,
                      }}
                    >
                      ⏳
                    </div>
                  )}

                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: "#2c2647", fontWeight: 700 }}>
                      Партнёр
                    </div>
                    <div
                      style={{
                        color: "#1c1733",
                        fontWeight: 900,
                        marginTop: 4,
                        fontSize: 16,
                        lineHeight: 1.2,
                        wordBreak: "break-word",
                      }}
                    >
                      {hasPartnerConnected
                        ? `${pair.partner?.firstName || "Подключён"}${
                            pair.partner?.lastName
                              ? ` ${pair.partner.lastName}`
                              : ""
                          }`
                        : "Партнёр ещё не подключился"}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        color: "#5a5378",
                        fontSize: 13,
                        wordBreak: "break-word",
                      }}
                    >
                      {hasPartnerConnected
  ? pair.partner?.username && `@${pair.partner.username}`
  : "Партнёр ещё не присоединился"}
                    </div>
                  </div>
                </div>
              </div>

              {!hasPartnerConnected && (
                <button
                  onClick={onOpenInvite}
                  style={{
                    ...primaryButtonStyle,
                    width: "100%",
                    marginTop: 14,
                  }}
                >
                  {t.pair.invitePartner}
                </button>
              )}
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ ...cardBaseStyle(), padding: 18 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#1f1d3a" }}>
                {t.pair.level}
              </div>

              <div
                style={{
                  marginTop: 14,
                  padding: "18px 16px",
                  borderRadius: 18,
                  background: "rgba(255,255,255,0.24)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: "#5a5378",
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      Текущий уровень
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 30,
                        fontWeight: 900,
                        color: "#1f1d3a",
                        lineHeight: 1,
                      }}
                    >
                      {pairLevel.title}
                    </div>
                  </div>

                  <div
                    style={{
                      minWidth: 64,
                      height: 64,
                      borderRadius: 18,
                      background: "linear-gradient(135deg,#8f6bff,#ff76ba)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontSize: 22,
                      fontWeight: 900,
                      boxShadow: "0 6px 18px rgba(143,107,255,0.22)",
                      flexShrink: 0,
                    }}
                  >
                    {pairLevel.level}
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <div
                    style={{
                      height: 10,
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.60)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${pairLevel.progressPercent}%`,
                        height: "100%",
                        borderRadius: 999,
                        background: "linear-gradient(90deg,#8f6bff,#ff76ba)",
                      }}
                    />
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      fontSize: 12,
                      color: "#5a5378",
                      fontWeight: 700,
                      flexWrap: "wrap",
                    }}
                  >
                    <span>
                      {pairLevel.nextLevelPoints
                        ? `${points} / ${pairLevel.nextLevelPoints}`
                        : t.pair.maxLevel}
                    </span>

                    <span>
                      {pairLevel.nextLevelPoints
                        ? `${t.pair.untilNext}: ${
                            pairLevel.nextLevelPoints - points
                          }`
                        : ""}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ ...cardBaseStyle(), padding: 18 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <div>
                  <div
                    style={{ fontSize: 22, fontWeight: 900, color: "#1f1d3a" }}
                  >
                    {t.pair.compatibility}
                  </div>

                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 14,
                      color: "#5a5378",
                      lineHeight: 1.45,
                    }}
                  >
                    {compatibilityProfile.completedThemes > 0
  ? `Рассчитано по ${compatibilityProfile.completedThemes} из ${compatibilityProfile.totalThemes} тем`
  : "Пройдите парные опросы и узнайте, насколько вы подходите друг другу 💞"}
  {compatibilityProfile.completedThemes === 0 && (
  <button
    onClick={onOpenPolls}
    style={{
      ...primaryButtonStyle,
      width: "100%",
      marginTop: 12,
    }}
  >
    Пройти опросы
  </button>
)}
                  </div>
                </div>

                <button
                  onClick={onOpenCompatibilityInfo}
                  type="button"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    border: "1px solid rgba(143,107,255,0.22)",
                    background: "rgba(255,255,255,0.85)",
                    color: "#7c5cff",
                    fontSize: 16,
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    boxShadow: "0 8px 20px rgba(124,92,255,0.10)",
                    flexShrink: 0,
                  }}
                >
                  ℹ️
                </button>
              </div>

              <div
                style={{
                  marginTop: 14,
                  padding: "18px 16px",
                  borderRadius: 18,
                  background: "rgba(255,255,255,0.24)",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 34,
                    fontWeight: 900,
                    color: "#6b46ff",
                  }}
                >
                  {compatibilityProfile.completedThemes > 0
                    ? `${compatibilityProfile.overallPercent}%`
                    : "—"}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    color: "#4d466c",
                    fontSize: 14,
                    lineHeight: 1.45,
                  }}
                >
                  {compatibilityProfile.completedThemes > 0
                    ? compatibilityProfile.pairType
                    : "Совместимость появится, когда вы пройдёте общие парные опросы"}
                </div>

                {compatibilityProfile.completedThemes > 0 && (
                  <div
                    style={{
                      marginTop: 12,
                      color: "#5a5378",
                      fontSize: 12,
                      lineHeight: 1.45,
                    }}
                  >
                    Тем пройдено: {pairStats.completedThemes}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <button
        onClick={onBack}
        style={{ ...secondaryButtonStyle, marginTop: 10 }}
      >
        {t.common.back}
      </button>
    </div>
  );
}

function PairCompatibilityInfoScreen({
  appState,
  onBack,
}: {
  appState: AppState;
  onBack: () => void;
}) {
  const profile = buildCompatibilityProfile(appState.pollAnswers || {});

  return (
    <div style={{ padding: 12, display: "grid", gap: 10 }}>
      <div style={{ ...cardBaseStyle(), padding: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: "#1f1d3a" }}>
          💞 Совместимость пары
        </div>

        <div
          style={{
            marginTop: 10,
            fontSize: 54,
            fontWeight: 900,
            color: "#1f1d3a",
            lineHeight: 0.95,
            letterSpacing: "-0.04em",
          }}
        >
          {profile.overallPercent}%
        </div>

        <div
          style={{
            marginTop: 8,
            fontSize: 22,
            fontWeight: 900,
            color: "#6b46ff",
            lineHeight: 1.2,
          }}
        >
          {profile.pairType}
        </div>

        <div
          style={{
            marginTop: 10,
            fontSize: 15,
            lineHeight: 1.55,
            color: "#5b547d",
          }}
        >
          {profile.description}
        </div>

        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 18,
            background: "rgba(255,255,255,0.38)",
            border: "1px solid rgba(255,255,255,0.35)",
            fontSize: 14,
            color: "#615a86",
          }}
        >
          Рассчитано по {profile.completedThemes} из {profile.totalThemes} тем
        </div>
      </div>

      <div style={{ ...cardBaseStyle(), padding: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: "#1f1d3a" }}>
          ✨ Сильные стороны пары
        </div>

        <div
          style={{
            marginTop: 12,
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {profile.strongSides.map((item) => (
            <div
              key={item}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.72)",
                color: "#6b46ff",
                fontSize: 14,
                fontWeight: 800,
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...cardBaseStyle(), padding: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: "#1f1d3a" }}>
          🌱 На что стоит обратить внимание
        </div>

        <div
          style={{
            marginTop: 12,
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {profile.growthZones.map((item) => (
            <div
              key={item}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.72)",
                color: "#ff5ebc",
                fontSize: 14,
                fontWeight: 800,
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...cardBaseStyle(), padding: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: "#1f1d3a" }}>
          📊 Совместимость по темам
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {profile.themes.map((theme) => (
            <div
              key={theme.key}
              style={{
                padding: 12,
                borderRadius: 18,
                background: "rgba(255,255,255,0.34)",
                border: "1px solid rgba(255,255,255,0.35)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 800, color: "#1f1d3a" }}>
                  {theme.title}
                </div>
                <div style={{ fontSize: 15, fontWeight: 900, color: "#6b46ff" }}>
                  {theme.percent}%
                </div>
              </div>

              <div
                style={{
                  marginTop: 8,
                  height: 8,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.65)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${theme.percent}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: "linear-gradient(90deg,#8f6bff,#ff76ba)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <button onClick={onBack} style={secondaryButtonStyle}>
        Назад
      </button>
    </div>
  );
}

function PairInviteScreen({
  pair,
  onBack,
  onCreateInvite,
  onJoinByCode,
}: {
  pair: PairState;
  onBack: () => void;
  onCreateInvite: () => Promise<void>;
  onJoinByCode: (code: string) => Promise<void>;
}) {
  
const t = market === "en" ? TEXT_EN : TEXT_RU;
const REWARD_CATEGORIES =
  market === "en" ? REWARD_CATEGORIES_EN : REWARD_CATEGORIES_RU;
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showJoinInput, setShowJoinInput] = useState(false);
 

  const inviteLink = pair.inviteCode
    ? `https://t.me/couple_quizzes_bot?startapp=invite_${pair.inviteCode}`
    : "";

  async function handleCreateInviteClick() {
    try {
      setCreating(true);
      await onCreateInvite();
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase();

    if (!code) {
      alert("Введите код приглашения");
      return;
    }

    try {
      setJoining(true);
      await onJoinByCode(code);
      setJoinCode("");
    } finally {
      setJoining(false);
    }
  }

  async function handleCopyLink() {
    if (!inviteLink) {
      alert("Сначала создай код приглашения");
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteLink);
      alert("Ссылка скопирована");
    } catch {
      alert("Не удалось скопировать ссылку");
    }
  }

  function handleShareLink() {
    if (!inviteLink) {
      alert("Сначала создай код приглашения");
      return;
    }

    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}`,
      "_blank"
    );
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 14 }}>
      <div style={{ ...cardBaseStyle(), padding: 18 }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: "#1f1d3a" }}>
          Пригласить партнёра
        </div>
        <div
          style={{
            marginTop: 8,
            color: "#3a345c",
            fontSize: 15,
            lineHeight: 1.45,
          }}
        >
          Сначала создай код приглашения, потом отправь ссылку или дай код партнёру.
        </div>
      </div>

      {!pair.inviteCode && (
        <div style={{ ...cardBaseStyle(), padding: 18 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#1f1d3a" }}>
            1. Создать код приглашения
          </div>

          <div
            style={{
              marginTop: 8,
              color: "#4b446a",
              lineHeight: 1.45,
              fontSize: 14,
            }}
          >
            Это создаст твоё приглашение для подключения пары.
          </div>

          <button
            onClick={handleCreateInviteClick}
            disabled={creating}
            style={{
              ...primaryButtonStyle,
              width: "100%",
              marginTop: 12,
              opacity: creating ? 0.6 : 1,
              cursor: creating ? "not-allowed" : "pointer",
            }}
          >
            {creating ? "Создаём..." : "Создать код приглашения"}
          </button>
        </div>
      )}

      {pair.inviteCode && (
        <div style={{ ...cardBaseStyle(), padding: 18 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#1f1d3a" }}>
            Твой код приглашения
          </div>

          <div
            style={{
              marginTop: 12,
              padding: "12px 14px",
              borderRadius: 16,
              background: "rgba(255,255,255,0.24)",
              color: "#241b40",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: 1 }}>
              {pair.inviteCode}
            </div>
          </div>

          <div
            style={{
              fontSize: 18,
              fontWeight: 900,
              color: "#1f1d3a",
              marginTop: 14,
            }}
          >
            Ссылка-приглашение
          </div>

          <div
            style={{
              marginTop: 12,
              padding: "14px 16px",
              borderRadius: 16,
              background: "rgba(255,255,255,0.24)",
              color: "#241b40",
              textAlign: "left",
              fontSize: 14,
              lineHeight: 1.45,
              wordBreak: "break-all",
            }}
          >
            {inviteLink}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginTop: 12,
            }}
          >
            <button
              onClick={handleCopyLink}
              style={{
                ...primaryButtonStyle,
                width: "100%",
                marginTop: 0,
                padding: "14px 16px",
                fontSize: 16,
              }}
            >
              Копировать
            </button>

            <button
              onClick={handleShareLink}
              style={{
                ...secondaryButtonStyle,
                marginTop: 0,
                width: "100%",
                padding: "14px 16px",
              }}
            >
              Отправить ссылку
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setShowJoinInput((prev) => !prev)}
        style={{ ...primaryButtonStyle, width: "100%", marginTop: 0 }}
      >
        Добавить по коду
      </button>

      {showJoinInput && (
        <div style={{ ...cardBaseStyle(), padding: 18 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#1f1d3a" }}>
            Ввести код приглашения
          </div>

          <div
            style={{
              marginTop: 8,
              color: "#4b446a",
              lineHeight: 1.45,
              fontSize: 14,
            }}
          >
            Если тебе отправили код, введи его здесь.
          </div>

          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Например: AB12CD"
            style={{
              width: "100%",
              marginTop: 12,
              padding: "14px 16px",
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.30)",
              background: "rgba(255,255,255,0.24)",
              outline: "none",
              fontSize: 16,
              fontWeight: 800,
              color: "#1f1d3a",
              boxSizing: "border-box",
            }}
          />

          <button
            onClick={handleJoin}
            disabled={joining}
            style={{
              ...primaryButtonStyle,
              width: "100%",
              marginTop: 12,
              opacity: joining ? 0.6 : 1,
              cursor: joining ? "not-allowed" : "pointer",
            }}
          >
            {joining ? "Подключаем..." : "Подключиться"}
          </button>
        </div>
      )}



      <button onClick={onBack} style={secondaryButtonStyle}>
        {t.common.back}
      </button>
    </div>
  );
}

function PairStreakInfoScreen({
  appState,
  onBack,
}: {
  appState: AppState;
  onBack: () => void;
}) {

  const [showStreakInfo, setShowStreakInfo] = useState(false);
  const milestones = [
    { days: 3, reward: 100, icon: "🔥" },
    { days: 5, reward: 200, icon: "🏆" },
    { days: 10, reward: 500, icon: "💎" },
    { days: 15, reward: 750, icon: "👑" },
  ];

  const current = appState.dailyPairStreak.current;
  const reachedMilestones = appState.dailyPairStreak.reachedMilestones;

  const nextMilestone = milestones.find((item) => item.days > current);

  return (
    <div style={{ padding: 16, display: "grid", gap: 14 }}>
      

      <div
        style={{
          ...cardBaseStyle(),
          padding: 18,
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.38), rgba(255,255,255,0.22))",
        }}
      >
        <div>
  <div
    style={{
      fontSize: 16,
      fontWeight: 900,
      color: "#2b2148",
    }}
  >
    🔥 Серия пары
  </div>

  <div
    style={{
      marginTop: 10,
      fontSize: 36,
      fontWeight: 900,
      color: "#1f1d3a",
      lineHeight: 1,
    }}
  >
    {current} дн.
  </div>

  <div
    style={{
      marginTop: 10,
      fontSize: 14,
      lineHeight: 1.55,
      color: "rgba(43,33,72,0.72)",
    }}
  >
    Вы оба отвечаете на вопрос дня подряд и прокачиваете серию пары.
  </div>
</div>

     

        <div
          style={{
            marginTop: 14,
            padding: "12px 14px",
            borderRadius: 16,
            background: "rgba(255,255,255,0.36)",
            border: "1px solid rgba(255,255,255,0.35)",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#6c6487",
            }}
          >
            Следующий бонус
          </div>

          <div
            style={{
              marginTop: 4,
              fontSize: 16,
              fontWeight: 900,
              color: "#6f54ff",
            }}
          >
            {nextMilestone
              ? `${nextMilestone.days} дн. · +${nextMilestone.reward} очков`
              : "Максимальный рубеж достигнут"}
          </div>
        </div>
      </div>

      <div
        style={{
          ...cardBaseStyle(),
          padding: 18,
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 900,
            color: "#1f1d3a",
          }}
        >
          🏆 Рубежи серии
        </div>

        <div
          style={{
            marginTop: 8,
            fontSize: 14,
            lineHeight: 1.45,
            color: "rgba(43,33,72,0.72)",
          }}
        >
          Чем длиннее серия, тем больше бонусных очков получает ваша пара.
        </div>

       

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 12,
            marginTop: 16,
          }}
        >

         

          {milestones.map(({ days, reward, icon }) => {
            const reached = reachedMilestones.includes(days);
            const isNext = !reached && nextMilestone?.days === days;

            return (
              <div
                key={days}
                style={{
                  borderRadius: 22,
                  padding: 16,
                  background: reached
                    ? "linear-gradient(135deg, rgba(255,236,244,0.98), rgba(255,255,255,0.92))"
                    : isNext
                    ? "linear-gradient(135deg, rgba(255,255,255,0.82), rgba(245,240,255,0.74))"
                    : "rgba(255,255,255,0.42)",
                  border: reached
                    ? "2px solid rgba(255,118,186,0.28)"
                    : isNext
                    ? "2px solid rgba(111,84,255,0.18)"
                    : "1px solid rgba(255,255,255,0.45)",
                  boxShadow: reached
                    ? "0 10px 24px rgba(255,120,170,0.10)"
                    : "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 999,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(255,255,255,0.72)",
                      fontSize: 18,
                    }}
                  >
                    {reached ? icon : "▫️"}
                  </div>
                  

                  {reached && (
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: "#ff5ea8",
                        background: "rgba(255,255,255,0.82)",
                        padding: "5px 8px",
                        borderRadius: 999,
                      }}
                    >
                      получено
                    </div>
                  )}

                  {!reached && isNext && (
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: "#6f54ff",
                        background: "rgba(255,255,255,0.82)",
                        padding: "5px 8px",
                        borderRadius: 999,
                      }}
                    >
                      следующий
                    </div>
                  )}
                </div>

                <div
                  style={{
                    marginTop: 16,
                    fontSize: 34,
                    fontWeight: 900,
                    color: "#1f1d3a",
                    lineHeight: 1,
                  }}
                >
                  {days}
                </div>

                <div
                  style={{
                    marginTop: 6,
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#6c6487",
                  }}
                >
                  дней подряд
                </div>

                <div
                  style={{
                    marginTop: 12,
                    fontSize: 22,
                    fontWeight: 900,
                    color: "#6f54ff",
                  }}
                >
                  +{reward}

                  
                </div>
              </div>
            );
          })}
        </div>




      </div>
       <button
  onClick={onBack}
  style={{
    ...secondaryButtonStyle,
    width: "100%",
    marginTop: 16,
  }}
>
  {t.common.back}
</button>



    </div>
  );
}

function DailyPairQuestionScreen({
  user,
  pair,
  appState,
  setAppState,
  onBack,
  onOpenStreakInfo,
}: {
  user: TgUser | null;
  pair: PairState;
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  onBack: () => void;
  onOpenStreakInfo: () => void;
}) {

  const market = getMarket();
const t = market === "en" ? TEXT_EN : TEXT_RU;
  const today = getTodayLocalDateString();
  const question = getDailyPairQuestionForToday();

  const [saving, setSaving] = useState(false);
  const [todayAnswers, setTodayAnswers] = useState<
    Array<{
      telegram_id: number;
      question_id: string;
      answer_index: number;
    }>
  >([]);

  const [historyExpanded, setHistoryExpanded] = useState(false);

  useEffect(() => {
    async function loadTodayAnswers() {
      if (!pair.pairId) return;

      const rows = await loadDailyPairAnswersForDate({
        pairId: pair.pairId,
        date: today,
      });

      setTodayAnswers(
        rows.map((row: any) => ({
          telegram_id: Number(row.telegram_id),
          question_id: String(row.question_id),
          answer_index: Number(row.answer_index),
        }))
      );
    }

    loadTodayAnswers();
  }, [pair.pairId, today]);

  const currentUserId = user?.id ?? null;
  const myAnswer = todayAnswers.find((row) => row.telegram_id === currentUserId) ?? null;
  const partnerAnswer =
    todayAnswers.find((row) => row.telegram_id !== currentUserId) ?? null;

  const bothAnswered = !!myAnswer && !!partnerAnswer;

  const visibleHistory = historyExpanded
  ? appState.dailyPairHistory
  : appState.dailyPairHistory.slice(0, 1);

  async function saveAnswer(answerIndex: number) {
    if (!pair.pairId || !user?.id) {
      alert("Сначала нужно подключить пару");
      return;
    }

    if (myAnswer) {
      alert("Ты уже ответил(а) на вопрос дня");
      return;
    }

   try {
  setSaving(true);


  await saveDailyPairAnswer({
    pairId: pair.pairId,
    date: today,
    questionId: question.id,
    telegramId: user.id,
    answerIndex,
  });

  const rows = await loadDailyPairAnswersForDate({
    pairId: pair.pairId,
    date: today,
  });

  setTodayAnswers(
    rows.map((row: any) => ({
      telegram_id: Number(row.telegram_id),
      question_id: String(row.question_id),
      answer_index: Number(row.answer_index),
    }))
  );

  if (rows.length >= 2) {
  const history = await loadDailyPairHistory(pair.pairId);
  const streakData = calculateDailyPairStreak(history);

  const previousMilestones = appState.dailyPairStreak.reachedMilestones;
  const newMilestone = streakData.reachedMilestones.find(
    (m) => !previousMilestones.includes(m)
  );

  const streakBonus = newMilestone ? getStreakBonus(newMilestone) : 0;

  const sameAnswer =
    Number(rows[0]?.answer_index) === Number(rows[1]?.answer_index);

  const alreadyClaimedMatchBonus =
    appState.dailyPairMatchBonusClaimedDates.includes(today);

  const matchBonus =
    sameAnswer && !alreadyClaimedMatchBonus ? DAILY_PAIR_MATCH_BONUS : 0;

  const totalBonus = streakBonus + matchBonus;

  let nextPairState = pair;

  if (totalBonus > 0) {
    await updatePairPoints({
      pairId: pair.pairId,
      delta: totalBonus,
    });

    if (user?.id) {
      nextPairState = await loadPairStateForUser(user.id);
    }
  }

  setAppState((prev) => ({
    ...prev,
    pair: nextPairState,
    points: nextPairState.totalPoints || 0,
    dailyPairHistory: history,
    dailyPairStreak: streakData,
    dailyPairMatchBonusClaimedDates:
      matchBonus > 0
        ? [...prev.dailyPairMatchBonusClaimedDates, today]
        : prev.dailyPairMatchBonusClaimedDates,
  }));

  if (streakBonus > 0 && matchBonus > 0 && newMilestone) {
    alert(
      `🔥 Серия ${newMilestone} дней!\n+${streakBonus} очков\n💘 Совпадение ответов!\n+${matchBonus} очков`
    );
  } else if (streakBonus > 0 && newMilestone) {
    alert(`🔥 Серия ${newMilestone} дней!\n+${streakBonus} очков`);
  } else if (matchBonus > 0) {
    alert(`💘 Вы совпали!\n+${matchBonus} очков`);
  }
}

} finally {
  setSaving(false);
}
   
  }

  const nextBonus = getNextStreakBonus(appState.dailyPairStreak.current);

  return (
  <div style={{ padding: 12, display: "grid", gap: 10 }}>
    <div
      style={{
        ...cardBaseStyle(),
        padding: 14,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 10,
      }}
    >
      <div>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#1f1d3a" }}>
          Вопрос дня 💞
        </div>
        <div
          style={{
            marginTop: 4,
            color: "#3a345c",
            fontSize: 13,
            lineHeight: 1.4,
          }}
        >
          Вы оба отвечаете на один и тот же вопрос. Когда ответят оба — можно сравнить результат.
        </div>
      </div>

      <button
        onClick={onOpenStreakInfo}
        type="button"
        style={{
          width: 34,
          height: 34,
          borderRadius: 999,
          border: "1px solid rgba(143,107,255,0.22)",
          background: "rgba(255,255,255,0.85)",
          color: "#7c5cff",
          fontSize: 16,
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 8px 20px rgba(124,92,255,0.10)",
          flexShrink: 0,
        }}
      >
        ℹ️
      </button>
    </div>

    {/* дальше уже остальной контент экрана вопроса дня */}


      
        

      <div style={{ ...cardBaseStyle(), padding: 14 }}>
        <div
          style={{
            padding: "14px 16px",
            borderRadius: 16,
            background: "rgba(255,255,255,0.24)",
            color: "#241b40",
            fontWeight: 800,
            lineHeight: 1.4,
            fontSize: 18,
          }}
        >
          {question.text}
        </div>

        {!myAnswer && (
          <div style={{ marginTop: 12 }}>
            

            <div style={{ display: "grid", gap: 8 }}>
              {question.options.map((option, index) => (
                <button
                  key={index}
                  onClick={() => saveAnswer(index)}
                  disabled={saving}
                  style={{
                    border: "1px solid rgba(255,255,255,0.28)",
                    borderRadius: 16,
                    padding: "12px 14px",
                    background: "rgba(255,255,255,0.20)",
                    color: "#1f1d3a",
                    textAlign: "left",
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        )}

        {bothAnswered ? (
  <div
    style={{
      ...cardBaseStyle(),
      padding: 16,
      marginTop: 12,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    }}
  >
    <div>
      <div style={{ fontSize: 16, fontWeight: 900, color: "#1f1d3a" }}>
        🔥 Серия пары
      </div>

      <div
        style={{
          marginTop: 6,
          fontSize: 30,
          fontWeight: 900,
          color: "#241b40",
          lineHeight: 1,
        }}
      >
        {appState.dailyPairStreak.current} дн.
      </div>

      <div
        style={{
          marginTop: 8,
          fontSize: 13,
          lineHeight: 1.45,
          color: "rgba(36,27,64,0.72)",
        }}
      >
        Оба ответили на вопрос дня подряд
      </div>
    </div>

    <button
      onClick={onOpenStreakInfo}
      style={{
        width: 30,
        height: 30,
        flexShrink: 0,
        borderRadius: 999,
        border: "1px solid rgba(143,107,255,0.22)",
        background: "rgba(255,255,255,0.72)",
        color: "#7c5cff",
        fontSize: 15,
        fontWeight: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: "0 8px 20px rgba(124,92,255,0.10)",
      }}
    >
      i
    </button>
  </div>
) : (
  <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
    <div
      style={{
        ...cardBaseStyle(),
        padding: 14,
        fontSize: 16,
        fontWeight: 800,
        color: "#2b2148",
      }}
    >
      Ты: {myAnswer ? "ответил(а)" : "ещё не ответил(а)"}
    </div>

    <div
      style={{
        ...cardBaseStyle(),
        padding: 14,
        fontSize: 16,
        fontWeight: 800,
        color: "#2b2148",
      }}
    >
      Партнёр: {partnerAnswer ? "ответил(а)" : "ещё не ответил(а)"}
    </div>
  </div>
)}

          

        {bothAnswered && (
          <div
            style={{
              marginTop: 12,
              padding: "16px 18px",
              borderRadius: 18,
              background:
                myAnswer.answer_index === partnerAnswer.answer_index
                  ? "linear-gradient(135deg, rgba(255,220,240,0.9), rgba(255,255,255,0.8))"
                  : "rgba(255,255,255,0.28)",
              color: "#241b40",
              animation: "matchPop 0.35s ease",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 900 }}>
              {myAnswer.answer_index === partnerAnswer.answer_index
                ? "💘 Совпадение!"
                : "✨ Разные ответы"}
            </div>

            <div
              style={{
                marginTop: 6,
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              {myAnswer.answer_index === partnerAnswer.answer_index
                ? "Вы выбрали один и тот же вариант"
                : "Ваши ответы отличаются — обсудите это 💬"}
            </div>

            {myAnswer.answer_index === partnerAnswer.answer_index && (
  <div
    style={{
      marginTop: 10,
      fontSize: 16,
      fontWeight: 900,
      color: "#6b46ff",
    }}
  >
    +{DAILY_PAIR_MATCH_BONUS} очков паре
  </div>
)}

            <div
              style={{
                marginTop: 10,
                fontSize: 13,
                opacity: 0.9,
              }}
            >
              Ты: {question.options[myAnswer.answer_index]}
              <br />
              Партнёр: {question.options[partnerAnswer.answer_index]}
            </div>
          </div>
        )}
      </div>

      {appState.dailyPairStreak.current > 0 &&
        [3, 5, 10, 15].includes(appState.dailyPairStreak.current) && (
          <div
            style={{
              ...cardBaseStyle(),
              padding: 16,
              background:
                "linear-gradient(135deg, rgba(255,240,245,0.95), rgba(255,255,255,0.9))",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 26 }}>
              {appState.dailyPairStreak.current === 3
                ? "🔥"
                : appState.dailyPairStreak.current === 5
                ? "🏆"
                : appState.dailyPairStreak.current === 10
                ? "💎"
                : "👑"}
            </div>

            <div
              style={{
                marginTop: 8,
                fontSize: 20,
                fontWeight: 900,
                color: "#1f1d3a",
              }}
            >
              Рубеж достигнут!
            </div>

            <div
  style={{
    marginTop: 6,
    fontSize: 14,
    color: "#4d466c",
    lineHeight: 1.45,
  }}
>
  Вы отвечаете вместе уже {appState.dailyPairStreak.current} дней подряд 💞
</div>

<div
  style={{
    marginTop: 8,
    fontSize: 18,
    fontWeight: 900,
    color: "#6b46ff",
  }}
>
  +{getStreakBonus(appState.dailyPairStreak.current)} очков
</div>
          </div>
        )}

      {appState.dailyPairHistory.length > 0 && (
  <div style={{ ...cardBaseStyle(), padding: 14 }}>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 900, color: "#1f1d3a" }}>
        История
      </div>

      {appState.dailyPairHistory.length > 1 && (
        <button
          type="button"
          onClick={() => setHistoryExpanded((prev) => !prev)}
          style={{
            border: "none",
            background: "rgba(255,255,255,0.78)",
            color: "#6f54ff",
            fontSize: 12,
            fontWeight: 800,
            padding: "6px 10px",
            borderRadius: 999,
            cursor: "pointer",
            boxShadow: "0 6px 14px rgba(124,92,255,0.10)",
          }}
        >
          {historyExpanded ? "Свернуть" : "Показать всё"}
        </button>
      )}
    </div>

         <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
  {visibleHistory.map((item) => {
              const historyQuestion =
                DAILY_PAIR_QUESTIONS.find((q) => q.id === item.questionId) || null;

              const same =
                item.boyAnswerIndex !== null &&
                item.girlAnswerIndex !== null &&
                item.boyAnswerIndex === item.girlAnswerIndex;

              return (
                <div
                  key={`${item.date}-${item.questionId}`}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.22)",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#5a5378", fontWeight: 700 }}>
                    {item.date}
                  </div>

                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 14,
                      fontWeight: 800,
                      color: "#1f1d3a",
                      lineHeight: 1.35,
                    }}
                  >
                    {historyQuestion?.text || item.questionId}
                  </div>

                  <div style={{ marginTop: 6, fontSize: 13, color: "#4d466c" }}>
                    {same ? "Совпали 💘" : "Разные ответы ✨"}
                  </div>
                </div>
              );
            })}
          </div>


        </div>
      )}

      <button onClick={onBack} style={{ ...secondaryButtonStyle, marginTop: 0 }}>
        {t.common.back}
      </button>
    </div>
  );
}



function getPersonalityResult(answerIndexes: number[]): TestResult {
  const labels = [
    "Заботливый",
    "Уверенный",
    "Романтичный",
    "Спокойный",
    "Энергичный",
  ];

  const counts = [0, 0, 0, 0, 0];
  answerIndexes.forEach((idx) => {
    if (idx >= 0 && idx < counts.length) counts[idx] += 1;
  });

  let topIndex = 0;
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] > counts[topIndex]) topIndex = i;
  }

  const descriptions = [
    "Твоя сила — в эмпатии, тепле и умении быть рядом тогда, когда это особенно нужно.",
    "Твоя сильная сторона — решительность, внутренний стержень и умение брать на себя ответственность.",
    "Твоя энергия проявляется в нежности, чувственности, красоте эмоций и умении создавать атмосферу.",
    "Твоя сила — в стабильности, выдержке и умении сохранять опору даже в непростые моменты.",
    "Твой главный плюс — яркость, живость, энергия и способность зажигать людей вокруг.",
  ];

  return {
    title: labels[topIndex],
    subtitle: "Твоя ведущая сильная сторона",
    description: descriptions[topIndex],
  };
}

function PollsEntryScreen({
  onBack,
  onSelect,
}: {
  onBack: () => void;
  onSelect: (target: "boy" | "girl") => void;
}) {
  return (
    <div style={{ padding: 16, display: "grid", gap: 14 }}>
      <div style={{ ...cardBaseStyle(), padding: 18 }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: "#1f1d3a" }}>
          Опросы
        </div>
        <div style={{ marginTop: 8, color: "#3a345c", fontSize: 15, lineHeight: 1.45 }}>
          Выберите, кто сейчас проходит опрос.
        </div>
      </div>

      <button
        onClick={() => onSelect("boy")}
        style={{ ...primaryButtonStyle, width: "100%" }}
      >
        👦 Парень
      </button>

      <button
        onClick={() => onSelect("girl")}
        style={{ ...primaryButtonStyle, width: "100%" }}
      >
        👧 Девушка
      </button>

      <button onClick={onBack} style={secondaryButtonStyle}>
        {t.common.back}
      </button>
    </div>
  );
}

function LanguageSelectScreen({
  value,
  onSelect,
  onContinue,
  onBack,
}: {
  value: "ru" | "en";
  onSelect: (lang: "ru" | "en") => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const isRu = value === "ru";
  const title = isRu ? "Выберите язык" : "Choose language";
  const subtitle = isRu
    ? "Сначала выбери язык приложения"
    : "First choose the app language";

  return (
    <div style={{ padding: 16, display: "grid", gap: 14 }}>
      <div style={{ ...cardBaseStyle(), padding: 18, textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: "#1f1d3a" }}>
          {title}
        </div>
        <div
          style={{
            marginTop: 8,
            color: "#3a345c",
            fontSize: 15,
            lineHeight: 1.45,
          }}
        >
          {subtitle}
        </div>
      </div>

      <button
        onClick={() => onSelect("ru")}
        style={{
          ...primaryButtonStyle,
          width: "100%",
          opacity: value === "ru" ? 1 : 0.78,
          boxShadow:
            value === "ru"
              ? "0 14px 34px rgba(107,70,255,0.28)"
              : primaryButtonStyle.boxShadow,
        }}
      >
        🇷🇺 Русский
      </button>

      <button
        onClick={() => onSelect("en")}
        style={{
          ...primaryButtonStyle,
          width: "100%",
          opacity: value === "en" ? 1 : 0.78,
          boxShadow:
            value === "en"
              ? "0 14px 34px rgba(107,70,255,0.28)"
              : primaryButtonStyle.boxShadow,
        }}
      >
        🇬🇧 English
      </button>

      <button
        onClick={onContinue}
        style={{ ...primaryButtonStyle, width: "100%" }}
      >
        {value === "en" ? "Start" : "Старт"}
      </button>

      <button onClick={onBack} style={secondaryButtonStyle}>
        {value === "en" ? "Back" : "Назад"}
      </button>
    </div>
  );
}

function getTodayLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentWeekKey() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
  const week = Math.ceil(dayOfYear / 7);
  return `${now.getFullYear()}-W${week}`;
}

function getPreviousWeekKey() {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;

  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() + mondayOffset - 7);

  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, "0");
  const date = String(monday.getDate()).padStart(2, "0");

  return `${year}-${month}-${date}`;
}

function getDailyPairQuestionForToday() {
  const today = getTodayLocalDateString();
  const dayNumber = Number(today.replaceAll("-", ""));
  const index = dayNumber % DAILY_PAIR_QUESTIONS.length;
  return DAILY_PAIR_QUESTIONS[index];
}

function getCurrentDateTimeLabel() {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(now.getDate()).padStart(2, "0")}`;
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;
  return `${date} ${time}`;
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getInitials(name?: string, lastName?: string) {
  const a = (name || "U").trim().charAt(0).toUpperCase();
  const b = (lastName || "").trim().charAt(0).toUpperCase();
  return `${a}${b}`.trim();
}

function getPairDisplayTitle(user: TgUser | null, pair: PairState) {
  const me =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "Ты";

  const partner =
    [pair.partner?.firstName, pair.partner?.lastName].filter(Boolean).join(" ") ||
    (pair.partner?.username ? `@${pair.partner.username}` : "Партнёр");

  return `${me} + ${partner}`;
}

function getReferralLink(user: TgUser | null) {
  if (!user?.id) return "";
  return `https://t.me/couple_quizzes_bot?startapp=ref_${user.id}`;
}

function shareReferralLink(user: TgUser | null) {
  if (!user?.id) return;

  const link = getReferralLink(user);
  const text = "Заходи в Couple Quizzes 💖 Проходи опросы, играй и получай очки вместе со мной!";

  window.open(
    `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`,
    "_blank"
  );
}

function CompletionBonusModal({
  title,
  points,
  emoji,
  onClose,
}: {
  title: string;
  points: number;
  emoji: string;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,16,40,0.58)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 220,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 28,
          padding: 24,
          textAlign: "center",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.35), rgba(255,255,255,0.18))",
          boxShadow: "0 20px 60px rgba(72,46,144,0.35)",
          animation: "pairLevelPop 0.4s ease",
        }}
      >
        <div style={{ fontSize: 46, marginBottom: 12 }}>{emoji}</div>

        <div style={{ fontSize: 28, fontWeight: 900, color: "#1f1d3a" }}>
          Раздел пройден!
        </div>

        <div
          style={{
            marginTop: 10,
            fontSize: 18,
            fontWeight: 800,
            color: "#4d466c",
            lineHeight: 1.35,
          }}
        >
          {title}
        </div>

        <div
          style={{
            marginTop: 12,
            fontSize: 30,
            fontWeight: 900,
            color: "#6b46ff",
          }}
        >
          +{points} очков
        </div>

        <button
          onClick={onClose}
          style={{ ...primaryButtonStyle, width: "100%", marginTop: 18 }}
        >
          Класс!
        </button>
      </div>
    </div>
  );
}

function PairLevelUpModal({
  level,
  title,
  onClose,
}: {
  level: number;
  title: string;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
       background: "rgba(0,0,0,0.6)",
backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 200,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 28,
          padding: 24,
          textAlign: "center",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.35), rgba(255,255,255,0.18))",
          boxShadow: "0 20px 60px rgba(72,46,144,0.35)",
          animation: "pairLevelPop 0.4s ease",
        }}
      >
        <div
          style={{
            fontSize: 42,
            marginBottom: 12,
          }}
        >
          ✨
        </div>

        <div style={{ fontSize: 28, fontWeight: 900, color: "#1f1d3a" }}>
          Новый уровень!
        </div>

        <div
          style={{
            marginTop: 10,
            fontSize: 18,
            fontWeight: 800,
            color: "#4d466c",
          }}
        >
          Уровень {level}
        </div>

        <div
          style={{
            marginTop: 6,
            fontSize: 26,
            fontWeight: 900,
            color: "#1f1d3a",
          }}
        >
          {title}
        </div>

        <button
          onClick={onClose}
          style={{ ...primaryButtonStyle, width: "100%", marginTop: 18 }}
        >
          Класс!
        </button>
      </div>
    </div>
  );
}



function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number,
) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
}

function createSectorPath(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;

  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}

function pickWeightedIndex(weights: number[]) {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let random = Math.random() * total;

  for (let i = 0; i < weights.length; i++) {
    random -= weights[i];
    if (random <= 0) return i;
  }

  return weights.length - 1;
}

function calculateMatch(a?: number[], b?: number[]) {
  if (!a?.length || !b?.length) return null;

  let same = 0;
  const len = Math.min(a.length, b.length);

  for (let i = 0; i < len; i++) {
    if (a[i] === b[i]) same++;
  }

  return Math.round((same / len) * 100);
}


  






function calculatePairStats(pollAnswers: Record<string, number[]>) {
  const matchGroups = [
    { key: "love", label: "Любовь" },
    { key: "conflicts", label: "Конфликты" },
    { key: "trust", label: "Доверие" },
    { key: "understanding", label: "Понимание" },
    { key: "romance", label: "Романтика" },
    { key: "space", label: "Личное пространство" },
    { key: "future", label: "Будущее" },
    { key: "life", label: "Быт" },
    { key: "jealousy", label: "Ревность" },
  ];

  const results = matchGroups
    .map((group) => {
      const boyPoll = POLLS.find(
        (poll) => poll.gender === "boy" && poll.matchGroup === group.key
      );
      const girlPoll = POLLS.find(
        (poll) => poll.gender === "girl" && poll.matchGroup === group.key
      );

      if (!boyPoll || !girlPoll) return null;

      const score = calculateMatch(
        pollAnswers[girlPoll.id],
        pollAnswers[boyPoll.id]
      );

      if (score === null) return null;

      return {
        key: group.key,
        label: group.label,
        score,
      };
    })
    .filter(Boolean) as { key: string; label: string; score: number }[];

  if (!results.length) {
    return {
      total: null,
      completedThemes: 0,
      strongest: [],
      weakest: [],
    };
  }

  const total = Math.round(
    results.reduce((sum, item) => sum + item.score, 0) / results.length
  );

  const sorted = [...results].sort((a, b) => b.score - a.score);

  return {
    total,
    completedThemes: results.length,
    strongest: sorted.slice(0, Math.min(3, sorted.length)),
    weakest: [...sorted].reverse().slice(0, Math.min(3, sorted.length)),
  };
}

function loadState(): AppState {
  if (typeof window === "undefined") return DEFAULT_STATE;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;

    const parsed = JSON.parse(raw) as Partial<AppState>;
  
   return {
  points: parsed.points ?? DEFAULT_STATE.points,
  isPremium: DEFAULT_STATE.isPremium,
  playedGameRewardKeys:
  parsed.playedGameRewardKeys ?? DEFAULT_STATE.playedGameRewardKeys,

  completionBonusesClaimed: {
  polls:
    parsed.completionBonusesClaimed?.polls ??
    DEFAULT_STATE.completionBonusesClaimed.polls,
  tests:
    parsed.completionBonusesClaimed?.tests ??
    DEFAULT_STATE.completionBonusesClaimed.tests,
  games:
    parsed.completionBonusesClaimed?.games ??
    DEFAULT_STATE.completionBonusesClaimed.games,
},

loveQuestionsAnsweredIds:
  parsed.loveQuestionsAnsweredIds ??
  DEFAULT_STATE.loveQuestionsAnsweredIds,

loveQuestionsProgress: {
  currentIndex:
    parsed.loveQuestionsProgress?.currentIndex ??
    DEFAULT_STATE.loveQuestionsProgress.currentIndex,
},



  referrals: {
  invitedUsers:
    parsed.referrals?.invitedUsers ?? DEFAULT_STATE.referrals.invitedUsers,
  totalReward:
    parsed.referrals?.totalReward ?? DEFAULT_STATE.referrals.totalReward,
},



lastDailyBonusPopupDate:
  parsed.lastDailyBonusPopupDate ??
  DEFAULT_STATE.lastDailyBonusPopupDate,


  dailyBonus: {
    streakDay:
      parsed.dailyBonus?.streakDay ?? DEFAULT_STATE.dailyBonus.streakDay,
    lastClaimDate:
      parsed.dailyBonus?.lastClaimDate ??
      DEFAULT_STATE.dailyBonus.lastClaimDate,
    totalPointsEarnedFromBonus:
      parsed.dailyBonus?.totalPointsEarnedFromBonus ??
      DEFAULT_STATE.dailyBonus.totalPointsEarnedFromBonus,
  },

  weeklyTopRewardClaimedWeek:
    parsed.weeklyTopRewardClaimedWeek ??
    DEFAULT_STATE.weeklyTopRewardClaimedWeek,

  stats: {
    pollsCompleted:
      parsed.stats?.pollsCompleted ?? DEFAULT_STATE.stats.pollsCompleted,
    gamesPlayed:
      parsed.stats?.gamesPlayed ?? DEFAULT_STATE.stats.gamesPlayed,
    testsCompleted:
      parsed.stats?.testsCompleted ?? DEFAULT_STATE.stats.testsCompleted,
    rewardsRedeemed:
      parsed.stats?.rewardsRedeemed ?? DEFAULT_STATE.stats.rewardsRedeemed,
  },

  completedPollIds:
    parsed.completedPollIds ?? DEFAULT_STATE.completedPollIds,
  wonRewards: parsed.wonRewards ?? DEFAULT_STATE.wonRewards,
  completedTestIds:
    parsed.completedTestIds ?? DEFAULT_STATE.completedTestIds,
  completedGameIds:
    parsed.completedGameIds ?? DEFAULT_STATE.completedGameIds,
  pollAnswers: parsed.pollAnswers ?? DEFAULT_STATE.pollAnswers,
  pairPollAnswers: parsed.pairPollAnswers ?? DEFAULT_STATE.pairPollAnswers,

  pair: {
  pairId: parsed.pair?.pairId ?? DEFAULT_STATE.pair.pairId,
  inviteCode: parsed.pair?.inviteCode ?? DEFAULT_STATE.pair.inviteCode,
  partner: parsed.pair?.partner ?? DEFAULT_STATE.pair.partner,
  createdByTelegramId:
    parsed.pair?.createdByTelegramId ??
    DEFAULT_STATE.pair.createdByTelegramId,
  totalPoints:
    parsed.pair?.totalPoints ?? DEFAULT_STATE.pair.totalPoints,
},

  dailyPair: {
    boy: {
      date: parsed.dailyPair?.boy?.date ?? DEFAULT_STATE.dailyPair.boy.date,
      questionId:
        parsed.dailyPair?.boy?.questionId ??
        DEFAULT_STATE.dailyPair.boy.questionId,
      answerIndex:
        parsed.dailyPair?.boy?.answerIndex ??
        DEFAULT_STATE.dailyPair.boy.answerIndex,
    },
    girl: {
      date: parsed.dailyPair?.girl?.date ?? DEFAULT_STATE.dailyPair.girl.date,
      questionId:
        parsed.dailyPair?.girl?.questionId ??
        DEFAULT_STATE.dailyPair.girl.questionId,
      answerIndex:
        parsed.dailyPair?.girl?.answerIndex ??
        DEFAULT_STATE.dailyPair.girl.answerIndex,
    },
  },

  dailyPairHistory:
  parsed.dailyPairHistory ?? DEFAULT_STATE.dailyPairHistory,

  dailyPairStreak:
  parsed.dailyPairStreak ?? DEFAULT_STATE.dailyPairStreak,

 profile: {
  displayName:
    parsed.profile?.displayName ?? DEFAULT_STATE.profile.displayName,
  avatar: parsed.profile?.avatar ?? DEFAULT_STATE.profile.avatar,
  gender: parsed.profile?.gender ?? DEFAULT_STATE.profile.gender,
},

  dailyPairMatchBonusClaimedDates:
  parsed.dailyPairMatchBonusClaimedDates ??
  DEFAULT_STATE.dailyPairMatchBonusClaimedDates,

};



  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(state: AppState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function hasClaimedToday(lastClaimDate: string | null) {
  if (!lastClaimDate) return false;
  return lastClaimDate === getTodayLocalDateString();
}

function getRewardForDay(day: number) {
  return DAILY_REWARDS[Math.max(0, Math.min(day - 1, DAILY_REWARDS.length - 1))];
}

function getNextStreakDay(
  lastClaimDate: string | null,
  currentStreakDay: number,
) {
  const today = getTodayLocalDateString();

  if (!lastClaimDate) return 1;
  if (lastClaimDate === today) return currentStreakDay;

  const expectedNextDate = addDays(lastClaimDate, 1);
  if (expectedNextDate === today) {
    return currentStreakDay >= 9 ? 1 : currentStreakDay + 1;
  }

  return 1;
}

function cardBaseStyle(): CSSProperties {
  return {
    background: "rgba(255,255,255,0.18)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    border: "1px solid rgba(255,255,255,0.28)",
    borderRadius: 24,
    boxShadow: "0 12px 35px rgba(37, 34, 78, 0.14)",
  };
}

function SectionPlaceholder({
  title,
  description,
  onBack,
}: {
  title: string;
  description: string;
  onBack: () => void;
}) {
  return (
    <div style={{ padding: 16 }}>
      <div style={{ ...cardBaseStyle(), padding: 20 }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: "#1f1d3a" }}>
          {title}
        </div>
        <div
          style={{
            marginTop: 10,
            fontSize: 16,
            lineHeight: 1.45,
            color: "#2f3150",
          }}
        >
          {description}
        </div>

        <button onClick={onBack} style={secondaryButtonStyle}>
          {t.common.back}
        </button>
      </div>
    </div>
  );
}

function DailyBonusModal({
  currentDay,
  canClaim,
  onClaim,
  onClose,
}: {
  currentDay: number;
  canClaim: boolean;
  onClaim: () => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(14, 17, 31, 0.32)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 100,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 430,
          ...cardBaseStyle(),
          padding: 18,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0.14))",
        }}
      >
        <div
          style={{
            textAlign: "center",
            fontSize: 28,
            fontWeight: 900,
            color: "#241b40",
          }}
        >
          Ежедневный бонус
        </div>
        <div
          style={{
            textAlign: "center",
            marginTop: 8,
            color: "#3b3158",
            fontSize: 15,
          }}
        >
          Заходи каждый день и забирай всё больше очков
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
            marginTop: 18,
          }}
        >
          {DAILY_REWARDS.map((reward, index) => {
            const day = index + 1;
            const isPast = day < currentDay;
            const isCurrent = day === currentDay;
            const isFuture = day > currentDay;

            return (
              <div
                key={day}
                style={{
                  borderRadius: 20,
                  padding: 12,
                  minHeight: 92,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  border: isCurrent
                    ? "2px solid rgba(108, 58, 255, 0.42)"
                    : "1px solid rgba(255,255,255,0.28)",
                  background: isCurrent
                    ? "rgba(255,255,255,0.36)"
                    : isPast
                      ? "rgba(255,255,255,0.16)"
                      : "rgba(255,255,255,0.12)",
                  opacity: isFuture ? 0.82 : 1,
                }}
              >
                <div style={{ fontWeight: 800, color: "#2a2248", fontSize: 14 }}>
                  День {day}
                </div>
                <div style={{ fontWeight: 900, fontSize: 20, color: "#17142e" }}>
                  +{reward}
                </div>
                <div style={{ fontSize: 12, color: "#43355f" }}>
                  {isPast ? "Получено" : isCurrent ? "Доступно" : "Скоро"}
                </div>
              </div>
            );
          })}
        </div>

        {canClaim ? (
          <button
            onClick={onClaim}
            style={{ ...primaryButtonStyle, marginTop: 18, width: "100%" }}
          >
            Получить +{getRewardForDay(currentDay)} очков
          </button>
        ) : (
          <button
            onClick={onClose}
            style={{ ...secondaryButtonStyle, marginTop: 18, width: "100%" }}
          >
            Продолжить
          </button>
        )}
      </div>
    </div>
  );
}

function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <div style={{ padding: 16, paddingTop: 20 }}>
      <div style={{ ...cardBaseStyle(), padding: 16, overflow: "hidden" }}>
        <div
          style={{
            height: 300,
            borderRadius: 22,
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.42), rgba(255,255,255,0.10)), radial-gradient(circle at 30% 25%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.06) 24%, transparent 25%), radial-gradient(circle at 75% 20%, rgba(255,184,230,0.95) 0%, rgba(255,184,230,0.18) 20%, transparent 35%), radial-gradient(circle at 52% 75%, rgba(158,199,255,0.95) 0%, rgba(158,199,255,0.22) 18%, transparent 32%), linear-gradient(160deg, rgba(253,223,239,0.95), rgba(204,223,255,0.9))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
         <img
  src="/couple.png"
  alt="Couple"
  style={{
    width: 240,
    marginBottom: 26,
    opacity: 0.96,
    filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.08))",
  }}
/>


          <div
            style={{
              position: "absolute",
              left: 18,
              bottom: 18,
              right: 18,
              padding: 16,
              borderRadius: 18,
              background: "rgba(255,255,255,0.28)",
              color: "#241b40",
              fontWeight: 800,
              textAlign: "center",
              fontSize: 22,
            }}
          >
            Couple Quizzes
          </div>
        </div>
        

        <button
          onClick={onStart}
          style={{ ...primaryButtonStyle, width: "100%", marginTop: 16 }}
        >
          Старт
        </button>
      </div>
    </div>
  );
}

function MenuButton({
  label,
  emoji,
  onClick,
}: {
  label: string;
  emoji: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...cardBaseStyle(),
        padding: 16,
        textAlign: "left",
        minHeight: 102,
        cursor: "pointer",
        background: "rgba(255,255,255,0.20)",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
      }}
    >
      <div style={{ fontSize: 28, lineHeight: 1 }}>{emoji}</div>

      <div
        style={{
          marginTop: 8,
          fontSize: 17,
          fontWeight: 900,
          color: "#1e1a36",
          lineHeight: 1.15,
        }}
      >
        {label}
      </div>
    </button>
  );
}



function MainMenu({
  points,
  user,
  pairLevel,
  appState,
  onNavigate,
  t,
}: {
  points: number;
  user: TgUser | null;
  pairLevel: PairLevelInfo;
  appState: AppState;
  t: any;
  onNavigate: (screen: Screen) => void;
}) {

  
  const firstName = user?.first_name || "Друг";

  return (
    <div style={{ padding: 10, paddingTop: 8 }}>
      <div style={{ ...cardBaseStyle(), padding: 12, marginBottom: 10 }}>
 <div
  style={{
    display: "flex",
    flexDirection: "column",
    gap: 8,
  }}
>

    <div style={{ minWidth: 0, flex: 1 }}>
      <div
  style={{
    fontSize: 18,
    fontWeight: 900,
    color: "#1f1d3a",
    lineHeight: 1.1,
  }}
>
  Couple Quizzes
</div>
  

  <div
  style={{
    marginTop: 10,
    padding: "12px 12px",
    borderRadius: 16,
    background: "rgba(255,255,255,0.26)",
    width: "100%",
    boxSizing: "border-box",
  }}
>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: "#5a5378", fontWeight: 700 }}>
  {t.home.pairLevel}
</div>
            <div
  style={{
    marginTop: 1,
    fontSize: 15,
    fontWeight: 900,
    color: "#1f1d3a",
    lineHeight: 1.15,
  }}
>
  {pairLevel.title}
</div>
          </div>

         <div
  style={{
    padding: "5px 9px",
    borderRadius: 11,
    background: "rgba(255,255,255,0.34)",
    fontSize: 12,
    fontWeight: 900,
    color: "#6b46ff",
    whiteSpace: "nowrap",
  }}
>
  lvl {pairLevel.level}
</div>
        </div>

       <div
  style={{
    marginTop: 7,
    height: 7,
    borderRadius: 999,
    background: "rgba(255,255,255,0.24)",
    overflow: "hidden",
  }}
>
  <div
    style={{
      width: `${pairLevel.progressPercent}%`,
      height: "100%",
      borderRadius: 999,
      background: "linear-gradient(135deg,#8f6bff,#ff76ba)",
      transition: "width 0.35s ease",
    }}
  />
</div>

<div
  style={{
    marginTop: 5,
    fontSize: 10,
    color: "#5a5378",
    fontWeight: 700,
    lineHeight: 1.2,
  }}
>
  {pairLevel.nextLevelPoints
  ? `До следующего уровня: ${Math.max(0, pairLevel.nextLevelPoints - points)}`
  : "Максимальный уровень"}
</div>
      </div>
    </div>

    <div
  style={{
    padding: "10px 12px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.34)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
    boxSizing: "border-box",
  }}
>
  <div
    style={{
      fontSize: 14,
      fontWeight: 800,
      color: "#5a5378",
    }}
  >
    {t.home.yourPoints}:
  </div>

  <div
    style={{
      fontSize: 15,
      fontWeight: 900,
      color: "#241b40",
      whiteSpace: "nowrap",
    }}
  >
    ⭐ {points}
  </div>
</div>
  </div>
</div>


      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        <MenuButton label={t.menu.polls}
  emoji="💌"
  onClick={() => {
    if (!appState.profile.gender) {
      onNavigate("gender-select");
      return;
    }

    onNavigate(appState.profile.gender === "boy" ? "polls-boy" : "polls-girl");
  }}
/>
        <MenuButton label={t.menu.games} emoji="🎮" onClick={() => onNavigate("games")} />
        <MenuButton label={t.menu.tests} emoji="🧠" onClick={() => onNavigate("tests")} />
        <MenuButton label={t.menu.rewards} emoji="🎡" onClick={() => onNavigate("rewards")} />
        <MenuButton label={t.menu.pair} emoji="💕" onClick={() => onNavigate("pair")} />
        <MenuButton label={t.menu.topPlayers} emoji="🏆" onClick={() => onNavigate("top")} />

        <div style={{ gridColumn: "1 / -1" }}>
          <MenuButton label={t.menu.profile}
            emoji="👤"
            onClick={() => onNavigate("profile")}
          />
        </div>
      </div>
    </div>
  );
}

function PollsScreen({
  genderFilter,
  completedPollIds,
  onBack,
  onCompletePoll,
}: {
  genderFilter: "boy" | "girl";
  completedPollIds: string[];
  onBack: () => void;
  onCompletePoll: (poll: Poll, answers: number[]) => void;
}) {
  const filteredPolls = POLLS.filter((p) => p.gender === genderFilter);

  const [page, setPage] = useState(1);
  const [activePollId, setActivePollId] = useState<string | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);
  const market = getMarket();
const t = market === "en" ? TEXT_EN : TEXT_RU;


const POLLS_PER_PAGE = 4;

const startIndex = (page - 1) * POLLS_PER_PAGE;
const endIndex = startIndex + POLLS_PER_PAGE;

const visiblePolls = filteredPolls.slice(startIndex, endIndex);

const totalPages = Math.ceil(filteredPolls.length / POLLS_PER_PAGE);

const activePoll = POLLS.find((poll) => poll.id === activePollId) || null;
  const currentQuestion = activePoll?.questions[currentQuestionIndex] || null;

  if (activePoll && activePoll.questions.length === 0) {
  return (
    <div style={{ padding: 20 }}>
      <button onClick={() => setActivePollId(null)}>Назад</button>
      <div style={{ marginTop: 16, opacity: 0.7 }}>
        В этом опросе пока нет вопросов
      </div>
    </div>
  );
}

  function startPoll(pollId: string) {
    setActivePollId(pollId);
    setCurrentQuestionIndex(0);
    setAnswers([]);
    setFinished(false);
  }

 function handleSelect(optionIndex: number) {
  if (!activePoll || !currentQuestion) return;
  if (answers[currentQuestionIndex] !== undefined) return;

  const nextAnswers = [...answers];
  nextAnswers[currentQuestionIndex] = optionIndex;
  setAnswers(nextAnswers);

  const isLast = currentQuestionIndex === activePoll.questions.length - 1;

  setTimeout(() => {
    if (isLast) {
      setFinished(true);
    } else {
      setCurrentQuestionIndex((prev) => prev + 1);
    }
  }, 180);
}

  function handleNext() {
    if (!activePoll || !currentQuestion) return;
    const hasAnswer = answers[currentQuestionIndex] !== undefined;
    if (!hasAnswer) return;

    const isLast = currentQuestionIndex === activePoll.questions.length - 1;

    if (isLast) {
      setFinished(true);
      return;
    }

    setCurrentQuestionIndex((prev) => prev + 1);
  }

  function handleFinish() {
    if (!activePoll) return;
    onCompletePoll(activePoll, answers);
    setActivePollId(null);
setCurrentQuestionIndex(0);
setAnswers([]);
setFinished(false);
  }

  if (!activePollId) {
    return (
      <div style={{ padding: 12, display: "grid", gap: 10 }}>
        <div style={{ ...cardBaseStyle(), padding: 14 }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#1f1d3a" }}>
  {t.polls.title}
</div>
<div style={{ marginTop: 6, color: "#3a345c", fontSize: 14 }}>
  {market === "en"
    ? genderFilter === "girl"
      ? "Your polls 👧"
      : "Your polls 👦"
    : genderFilter === "girl"
    ? "Твои опросы 👧"
    : "Твои опросы 👦"}
</div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "0 2px",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 800, color: "#2c2647" }}>
  {market === "en"
    ? `Page ${page} of ${totalPages}`
    : `Страница ${page} из ${totalPages}`}
</div>
<div style={{ fontSize: 13, color: "#5a5378" }}>
  {market === "en"
    ? `${visiblePolls.length} polls`
    : `${visiblePolls.length} опросов`}
</div>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
  {visiblePolls.map((poll) => {
    const completed = completedPollIds.includes(poll.id);

    return (
      <div key={poll.id} style={{ ...cardBaseStyle(), padding: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 17,
                fontWeight: 900,
                color: "#111111",
                lineHeight: 1.2,
              }}
            >
              {market === "en"
                ? poll.titleEn ?? poll.title
                : poll.titleRu ?? poll.title}
            </div>

            <div
              style={{
                marginTop: 6,
                fontSize: 13,
                color: "#5a5378",
                lineHeight: 1.35,
              }}
            >
              {market === "en"
                ? poll.descriptionEn ?? poll.description
                : poll.descriptionRu ?? poll.description}
            </div>
          </div>

          <div
            style={{
              minWidth: 30,
              height: 30,
              borderRadius: 999,
              background: "rgba(143,107,255,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#6b46ff",
              fontWeight: 900,
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            +{poll.reward}
          </div>
        </div>

        <button
          onClick={() => startPoll(poll.id)}
          style={{
            ...primaryButtonStyle,
            width: "100%",
            marginTop: 8,
            padding: "11px 14px",
            fontSize: 15,
            opacity: completed ? 0.92 : 1,
          }}
        >
          {market === "en"
            ? completed
              ? "Try again"
              : "Start"
            : completed
            ? "Пройти снова"
            : "Начать"}
        </button>
      </div>
    );
  })}
</div>

<div
  style={{
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  }}
>
  <button
    onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
    disabled={page === 1}
    style={{
      ...secondaryButtonStyle,
      marginTop: 0,
      opacity: page === 1 ? 0.5 : 1,
      cursor: page === 1 ? "not-allowed" : "pointer",
    }}
  >
    {market === "en" ? "← Previous" : "← Предыдущая"}
  </button>

  <button
    onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
    disabled={page === totalPages}
    style={{
      ...secondaryButtonStyle,
      marginTop: 0,
      opacity: page === totalPages ? 0.5 : 1,
      cursor: page === totalPages ? "not-allowed" : "pointer",
    }}
  >
    {market === "en" ? "Next →" : "Следующая →"}
  </button>
</div>

<button onClick={onBack} style={{ ...secondaryButtonStyle, marginTop: 0 }}>
  {t.common.back}
</button>
      </div>
    );
  }

 if (finished && activePoll) {
  return (
    <div style={{ padding: 14 }}>
      <div style={{ ...cardBaseStyle(), padding: 16 }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: "#1f1d3a" }}>
          {market === "en" ? "Done 🎉" : "Готово 🎉"}
        </div>
        <div style={{ marginTop: 10, color: "#3a345c", lineHeight: 1.5 }}>
          {market === "en" ? (
            <>
              You completed the poll{" "}
              <b>{activePoll.titleEn ?? activePoll.title}</b> and earned{" "}
              <b>+{activePoll.reward} points</b>.
            </>
          ) : (
            <>
              Ты завершил опрос <b>{activePoll.title}</b> и получаешь{" "}
              <b>+{activePoll.reward} очков</b>.
            </>
          )}
        </div>

        <button
          onClick={handleFinish}
          style={{ ...primaryButtonStyle, width: "100%", marginTop: 14 }}
        >
          {market === "en" ? "Claim points" : "Забрать очки"}
        </button>
      </div>
    </div>
  );
}

  if (!activePoll || !currentQuestion) return null;

  const selected = answers[currentQuestionIndex];

  return (
    <div style={{ padding: 12, display: "grid", gap: 10 }}>
      <div style={{ ...cardBaseStyle(), padding: 14 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#1f1d3a" }}>
          {activePoll.title}
        </div>
        <div style={{ marginTop: 6, color: "#4b446a", fontSize: 14 }}>
          Вопрос {currentQuestionIndex + 1} из {activePoll.questions.length}
        </div>
      </div>

      <div style={{ ...cardBaseStyle(), padding: 14 }}>
        <div
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: "#211b3b",
            lineHeight: 1.35,
          }}
        >
          {currentQuestion.text}
        </div>

        <div style={{ display: "grid", gap: 9, marginTop: 14 }}>
          {currentQuestion.options.map((option, index) => {
            const isSelected = selected === index;

            return (
              <button
                key={option}
                onClick={() => handleSelect(index)}
                style={{
                  border: isSelected
                    ? "2px solid rgba(108, 58, 255, 0.48)"
                    : "1px solid rgba(255,255,255,0.28)",
                  borderRadius: 16,
                  padding: "12px 14px",
                  background: isSelected
                    ? "rgba(255,255,255,0.38)"
                    : "rgba(255,255,255,0.20)",
                  color: "#1f1d3a",
                  textAlign: "left",
                  fontSize: 15,
                  fontWeight: isSelected ? 900 : 700,
                  cursor: "pointer",
                }}
              >
                {option}
              </button>
            );
          })}
        </div>

        

        <button
          onClick={() => setActivePollId(null)}
          style={{ ...secondaryButtonStyle, marginTop: 10 }}
        >
          Выйти из опроса
        </button>
      </div>
    </div>
  );
}


function GamesScreen({
  completedGameIds,
  playedGameRewardKeys,
  appState,
  setAppState,
  onBack,
  onCompleteGame,
  onClaimStepReward,
}: {
  completedGameIds: string[];
  playedGameRewardKeys: string[];
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  onBack: () => void;
  onCompleteGame: (game: Game, score: number) => void;
  onClaimStepReward: (key: string) => Promise<boolean>;
}) {

  const market = getMarket();
const t = market === "en" ? TEXT_EN : TEXT_RU;
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [aiStep, setAiStep] = useState(0);
const [aiAnswers, setAiAnswers] = useState<number[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [finished, setFinished] = useState(false);
  const [bottleRewardGiven, setBottleRewardGiven] = useState(false);
  const [floatingReward, setFloatingReward] = useState<{
  id: number;
  value: number;
} | null>(null);
const [cardFlipped, setCardFlipped] = useState(false);
const [page, setPage] = useState(1);
const gamesPage1 = GAMES;

const gamesPage2: Game[] = [
  {
    id: "ai-psychologist",
    title: "ИИ психолог",
    description: "Ответьте на несколько вопросов и получите разбор вашей пары",
    reward: 10,
    questions: [],

  },
];

 

  const allGames = [...gamesPage1, ...gamesPage2];
const activeGame = allGames.find((game) => game.id === activeGameId) || null;

if (activeGame?.id === "90-questions") {
  return (
    <LoveQuestionsGameScreen
      reward={10}
      appState={appState}
      setAppState={setAppState}
      onBack={() => {
        setActiveGameId(null);
        setFinished(false);
      }}
     onFinish={() => {
  onCompleteGame(activeGame, 0);
  setActiveGameId(null);
  setFinished(false);
}}
      onClaimStepReward={onClaimStepReward}
    />
  );
}

  const currentQuestion = activeGame?.questions[currentQuestionIndex] || null;

  function startGame(gameId: string) {
    setActiveGameId(gameId);
    setCurrentQuestionIndex(0);
    setSelectedOptionIndex(null);
    setCorrectAnswers(0);
    setFinished(false);
    setBottleRewardGiven(false);
    setCardFlipped(false);
  
     if (gameId === "ai-psychologist") {
    setAiStep(0);
    setAiAnswers([]);
  }
}

  function showFloatingReward(value: number) {
  const id = Date.now();

  setFloatingReward({ id, value });

  setTimeout(() => {
    setFloatingReward((prev) => (prev?.id === id ? null : prev));
  }, 900);
}

  function handleNext() {
    if (!activeGame || !currentQuestion || selectedOptionIndex === null) return;

    const isCorrect = selectedOptionIndex === currentQuestion.correctIndex;
    const nextCorrectAnswers = isCorrect ? correctAnswers + 1 : correctAnswers;
    const isLast = currentQuestionIndex === activeGame.questions.length - 1;

    if (isLast) {
      setCorrectAnswers(nextCorrectAnswers);
      setFinished(true);
      return;
    }

    setCorrectAnswers(nextCorrectAnswers);
    setCurrentQuestionIndex((prev) => prev + 1);
    setSelectedOptionIndex(null);
  }

function handleFinish() {
  if (!activeGame) return;

  onCompleteGame(activeGame, correctAnswers);

  if (activeGame.reward > 0) {
    showFloatingReward(activeGame.reward);
  }

  setActiveGameId(null);
  setCurrentQuestionIndex(0);
  setSelectedOptionIndex(null);
  setCorrectAnswers(0);
  setFinished(false);
}

function handleBottleFinish() {
  if (!activeGame || bottleRewardGiven) return;

  onCompleteGame(activeGame, 1);

  if (activeGame.reward > 0) {
    showFloatingReward(activeGame.reward);
  }

  setBottleRewardGiven(true);
}

function handleLoveQuestionFinish() {
  if (!activeGame) return;

  onCompleteGame(activeGame, 1);

  if (activeGame.reward > 0) {
    showFloatingReward(activeGame.reward);
  }
}

  if (!activeGameId) {
  return (
    <div style={{ padding: 10, display: "grid", gap: 8 }}>
      <div style={{ ...cardBaseStyle(), padding: 12 }}>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#1f1d3a" }}>
          Игры
        </div>
        <div style={{ marginTop: 4, color: "#3a345c", fontSize: 13 }}>
          Играй и зарабатывай очки
        </div>
      </div>

    {(page === 1 ? gamesPage1 : gamesPage2).map((game) => {
        const completed = completedGameIds.includes(game.id);

        return (
          <div key={game.id} style={{ ...cardBaseStyle(), padding: 12 }}>
            <div
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  }}
>
  <div
  style={{
    fontWeight: 900,
    fontSize: 16,
    color: "#111111",
  }}
>
  {game.title}
</div>

  <div
    style={{
      padding: "6px 10px",
      borderRadius: 999,
      background: "rgba(107,70,255,0.10)",
      color: "#6b46ff",
      fontWeight: 800,
      boxShadow: "0 6px 16px rgba(107,70,255,0.15)",
      fontSize: 12,
      whiteSpace: "nowrap",
    }}
  >
      +{game.reward}
  </div>
</div>

            <div
  style={{
    marginTop: 4,
    color: "#40395f",
    lineHeight: 1.3,
    fontSize: 13,
  }}
>
  {game.description}
</div>

{game.comingSoon && (
  <div
    style={{
      marginTop: 6,
      fontSize: 12,
      color: "#6b5cff",
      fontWeight: 700,
    }}
  >
    Скоро будет доступно 🧠
  </div>
)}

            <button
              onClick={() => startGame(game.id)}
              style={{
  ...primaryButtonStyle,
  width: "100%",
  marginTop: 8,
  padding: "11px 14px",
  fontSize: 15,
  opacity: completed ? 0.92 : 1,
}}
            >
              {completed ? "Сыграть снова" : "Начать"}
            </button>
          </div>
        );
      })}

<div
  style={{
    display: "flex",

    gap: 8,
    marginTop: 12,
  }}
>
  {page === 1 ? (
    <>
      <button
        onClick={onBack}
        style={{
          ...secondaryButtonStyle,
          flex: 1,
          padding: "10px 16px",
        }}
      >
        Назад
      </button>

      <button
        onClick={() => setPage(2)}
        style={{
          ...secondaryButtonStyle,
          flex: 1,
          padding: "10px 16px",
          background: "rgba(255,255,255,0.95)"
        }}
      >
        Следующая →
      </button>
    </>
  ) : (
    <>
      <button
        onClick={() => setPage(1)}
        style={{
          ...secondaryButtonStyle,
          flex: 1,
          padding: "10px 16px",
        }}
      >
        ← Предыдущая
      </button>

      <button
        onClick={onBack}
        style={{
          ...secondaryButtonStyle,
          flex: 1,
          padding: "10px 16px",
        }}
      >
        В меню
      </button>
    </>
  )}
</div>

    </div>
  );
}

if (activeGame?.id === "ai-psychologist") {
  const currentQuestion = AI_PSYCHOLOGIST_QUESTIONS[aiStep];
  const isFinished = aiStep >= AI_PSYCHOLOGIST_QUESTIONS.length;
  const result = getAiPsychologistResult(aiAnswers);

  function handleAiAnswer(answerIndex: number) {
    const nextAnswers = [...aiAnswers, answerIndex];
    const nextStep = aiStep + 1;

    setAiAnswers(nextAnswers);
    setAiStep(nextStep);

    if (nextStep >= AI_PSYCHOLOGIST_QUESTIONS.length) {
      const rewardKey = "game-ai-psychologist";
      if (!playedGameRewardKeys.includes(rewardKey)) {
        onClaimStepReward(rewardKey);
      }
    }
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 14 }}>
      <div style={{ ...cardBaseStyle(), padding: 18 }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: "#1f1d3a" }}>
          ИИ психолог 🧠
        </div>

        <div
          style={{
            marginTop: 8,
            color: "#4b446a",
            lineHeight: 1.45,
            fontSize: 14,
          }}
        >
          Ответьте на несколько вопросов, и психолог поможет понять,
          что сейчас происходит в ваших отношениях.
        </div>
      </div>

      {!isFinished ? (
        <div style={{ ...cardBaseStyle(), padding: 18 }}>
          <div
            style={{
              fontSize: 13,
              color: "#6b5cff",
              fontWeight: 800,
            }}
          >
            Вопрос {aiStep + 1} из {AI_PSYCHOLOGIST_QUESTIONS.length}
          </div>

          <div
            style={{
              marginTop: 10,
              fontSize: 22,
              fontWeight: 900,
              color: "#1f1d3a",
              lineHeight: 1.35,
            }}
          >
            {currentQuestion.text}
          </div>

          <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
            {currentQuestion.options.map((option, index) => (
              <button
                key={option}
                onClick={() => handleAiAnswer(index)}
                style={{
                  ...secondaryButtonStyle,
                  width: "100%",
                  textAlign: "left",
                  padding: "14px 16px",
                  fontWeight: 700,
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div style={{ ...cardBaseStyle(), padding: 18 }}>
            <div
              style={{
                fontSize: 13,
                color: "#6b5cff",
                fontWeight: 800,
              }}
            >
              Ваш результат
            </div>

            <div
              style={{
                marginTop: 10,
                fontSize: 24,
                fontWeight: 900,
                color: "#1f1d3a",
                lineHeight: 1.3,
              }}
            >
              {result.title}
            </div>

            <div
              style={{
                marginTop: 8,
                fontSize: 14,
                color: "#5a5378",
                fontWeight: 700,
                lineHeight: 1.4,
              }}
            >
              {result.subtitle}
            </div>

            <div
              style={{
                marginTop: 14,
                color: "#4b446a",
                fontSize: 14,
                lineHeight: 1.55,
              }}
            >
              {result.description}
            </div>
          </div>

          <div style={{ ...cardBaseStyle(), padding: 18 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#1f1d3a" }}>
              Что можно сделать уже сейчас 💞
            </div>

            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              {result.advice.map((item) => (
                <div
                  key={item}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 16,
                    background: "rgba(255,255,255,0.26)",
                    color: "#40395f",
                    lineHeight: 1.45,
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  • {item}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => startGame("ai-psychologist")}
            style={{ ...primaryButtonStyle, width: "100%" }}
          >
            Пройти ещё раз
          </button>
        </>
      )}

      <button
        onClick={() => setActiveGameId(null)}
        style={{ ...secondaryButtonStyle, width: "100%" }}
      >
        Назад к играм
      </button>
    </div>
  );
}

  if (activeGame?.id === "bottle") {
    return (
      <BottleGameScreen
        reward={activeGame.reward}
        onBack={() => setActiveGameId(null)}
        onClaimStepReward={onClaimStepReward}
        onFinish={handleBottleFinish}
        
      />
    );
  }

 if (activeGame?.id === "90-questions") {
  return (
    <LoveQuestionsGameScreen
      reward={activeGame.reward}
    
      appState={appState}
      setAppState={setAppState}
      onBack={() => setActiveGameId(null)}
      onFinish={handleLoveQuestionFinish}
      onClaimStepReward={onClaimStepReward}
      
    />
  );
}

if (activeGame?.id === "never-have-i-ever") {
  return (
    
    <NeverHaveIEverGameScreen
      reward={10}
      playedGameRewardKeys={playedGameRewardKeys}
      onBack={() => setActiveGameId(null)}
      onFinish={handleLoveQuestionFinish}
      onClaimReward={onClaimStepReward}
    />
  );
}


  if (finished && activeGame) {
    const total = activeGame.questions.length;
    const percent = Math.round((correctAnswers / total) * 100);

    return (
      <div style={{ padding: 16 }}>
        <div style={{ ...cardBaseStyle(), padding: 20 }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: "#1f1d3a" }}>
            Игра завершена 🎮
          </div>
          <div style={{ marginTop: 10, color: "#3a345c", lineHeight: 1.5 }}>
            <b>{activeGame.title}</b> пройдена.
            <br />
            Правильных ответов: <b>{correctAnswers} из {total}</b>
            <br />
            Результат: <b>{percent}%</b>
            <br />
            Награда: <b>+{activeGame.reward} очков</b>
          </div>

          <button
            onClick={handleFinish}
            style={{ ...primaryButtonStyle, width: "100%", marginTop: 16 }}
          >
            Забрать очки
          </button>
        </div>
      </div>
    );
  }
  

  if (!activeGame || !currentQuestion) return null;


   return (
  <div style={{ padding: 16, display: "grid", gap: 14 }}>
    <div style={{ ...cardBaseStyle(), padding: 18 }}>
      <div style={{ fontSize: 24, fontWeight: 900, color: "#1f1d3a" }}>
        {activeGame.title}
      </div>
      <div style={{ marginTop: 8, color: "#4b446a" }}>
        Вопрос {currentQuestionIndex + 1} из {activeGame.questions.length}
      </div>
    </div>

    <div style={{ ...cardBaseStyle(), padding: 18 }}>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: "#211b3b",
          lineHeight: 1.35,
        }}
      >
        {currentQuestion.text}
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
        {currentQuestion.options.map((option, index) => {
          const isSelected = selectedOptionIndex === index;

          return (
            <button
              key={option}
              onClick={() => setSelectedOptionIndex(index)}
              style={{
                border: isSelected
                  ? "2px solid rgba(108, 58, 255, 0.48)"
                  : "1px solid rgba(255,255,255,0.28)",
                borderRadius: 18,
                padding: "14px 16px",
                background: isSelected
                  ? "rgba(255,255,255,0.38)"
                  : "rgba(255,255,255,0.20)",
                color: "#1f1d3a",
                textAlign: "left",
                fontSize: 16,
                fontWeight: isSelected ? 900 : 700,
                cursor: "pointer",
              }}
            >
              {option}
            </button>
          );
        })}
      </div>

      <button
        onClick={handleNext}
        disabled={selectedOptionIndex === null}
        style={{
          ...primaryButtonStyle,
          width: "100%",
          marginTop: 16,
          opacity: selectedOptionIndex !== null ? 1 : 0.55,
          cursor: selectedOptionIndex !== null ? "pointer" : "not-allowed",
        }}
      >
        {currentQuestionIndex === activeGame.questions.length - 1
          ? "Завершить"
          : "Дальше"}
      </button>

      <button onClick={() => setActiveGameId(null)} style={secondaryButtonStyle}>
        Выйти из игры
      </button>
    </div>

    {floatingReward && (
      <div
        style={{
          position: "fixed",
          left: "50%",
          bottom: 110,
          transform: "translateX(-50%)",
          zIndex: 1000,
          pointerEvents: "none",
          animation: "rewardFloatUp 0.9s ease-out forwards",
          padding: "10px 16px",
          borderRadius: 999,
          background: "rgba(107,70,255,0.14)",
          color: "#6b46ff",
          fontSize: 24,
          fontWeight: 900,
          boxShadow: "0 12px 30px rgba(107,70,255,0.18)",
        }}
      >
        +{floatingReward.value}
      </div>
    )}
  </div>
);
   
}

function BottleGameScreen({
  reward,
  onBack,
  onFinish,
  onClaimStepReward,
}: {
  reward: number;
  onBack: () => void;
  onFinish: () => void;
  onClaimStepReward: (key: string) => Promise<boolean>;
}) {
  const [rotation, setRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [activeTask, setActiveTask] = useState<BottleTask | null>(null);

  function normalizeDeg(deg: number) {
    return ((deg % 360) + 360) % 360;
  }

  function getBottleTargetByAngle(finalDeg: number): "boy" | "girl" {
    const normalized = normalizeDeg(finalDeg);

    // Подстрой под твою картинку бутылки:
    // здесь считаем, что:
    // 0deg = горлышко вверх
    // 180deg = горлышко вниз
    // если после остановки горлышко смотрит вверх -> girl
    // если вниз -> boy
    return normalized < 180 ? "girl" : "boy";
  }

  function pickTaskForTarget(target: "boy" | "girl") {
    const pool = BOTTLE_TASKS.filter((task) => task.target === target);
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function handleSpin() {
    if (isSpinning) return;

    setActiveTask(null);
    setIsSpinning(true);

    const extraSpins = 5 + Math.floor(Math.random() * 3); // 5–7 полных оборотов
    const randomOffset = Math.floor(Math.random() * 360);
    const finalRotation = rotation + extraSpins * 360 + randomOffset;

    setRotation(finalRotation);

    setTimeout(() => {
      const target = getBottleTargetByAngle(finalRotation);
      const task = pickTaskForTarget(target);

      setIsSpinning(false);
      setActiveTask(task);
    }, 3200); // должно совпадать с transition
  }

  async function handleCompleteBottleTask() {
    if (!activeTask) return;

    const rewardKey = `bottle:${activeTask.id}`;
    await onClaimStepReward(rewardKey);

    setActiveTask(null);
    onFinish();
  }

  function handleAnotherBottleTask() {
    if (!activeTask) return;

    const sameTargetTasks = BOTTLE_TASKS.filter(
      (task) => task.target === activeTask.target && task.id !== activeTask.id
    );

    if (!sameTargetTasks.length) return;

    const nextTask =
      sameTargetTasks[Math.floor(Math.random() * sameTargetTasks.length)];

    setActiveTask(nextTask);
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 14 }}>
      <div style={{ ...cardBaseStyle(), padding: 18 }}>
        <div style={{ fontSize: 26, fontWeight: 900, color: "#1f1d3a" }}>
          Бутылочка
        </div>

        <div
          style={{
            marginTop: 8,
            color: "#4b446a",
            fontSize: 15,
            lineHeight: 1.45,
          }}
        >
          Крути бутылку и получай задание для того, на кого она покажет.
        </div>
      </div>

      <div
        style={{
          ...cardBaseStyle(),
          padding: 24,
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 16,
            fontWeight: 800,
            color: "#5a5378",
          }}
        >
          <span>👧 Девушка</span>
          <span>👦 Парень</span>
        </div>

        <div
          style={{
            position: "relative",
            height: 260,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 8,
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: 28,
            }}
          >
            ▼
          </div>

          <div
            style={{
              width: 220,
              height: 220,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.22)",
              border: "2px solid rgba(255,255,255,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "inset 0 0 30px rgba(255,255,255,0.18)",
            }}
          >
            <div
              style={{
                fontSize: 86,
                lineHeight: 1,
                transform: `rotate(${rotation}deg)`,
                transition: isSpinning
                  ? "transform 3.2s cubic-bezier(0.18, 0.9, 0.2, 1)"
                  : "none",
                userSelect: "none",
              }}
            >
              🍾
            </div>
          </div>
        </div>

        <button
          onClick={handleSpin}
          disabled={isSpinning}
          style={{
            ...primaryButtonStyle,
            width: "100%",
            opacity: isSpinning ? 0.7 : 1,
            cursor: isSpinning ? "not-allowed" : "pointer",
          }}
        >
          {isSpinning ? "Крутим..." : "Крутить бутылку"}
        </button>

        <button
          onClick={onBack}
          style={{ ...secondaryButtonStyle, width: "100%", marginTop: 10 }}
        >
          {t.common.back}
        </button>
      </div>

      {activeTask && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(20,16,35,0.52)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1000,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 420,
              borderRadius: 28,
              padding: 22,
              background: "linear-gradient(180deg, #fff7fc 0%, #ffffff 100%)",
              boxShadow: "0 24px 70px rgba(31,23,51,0.24)",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: 999,
                background: "rgba(107,70,255,0.10)",
                color: "#6b46ff",
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              💫 Задание бутылочки
            </div>

            <div
              style={{
                marginTop: 14,
                fontSize: 28,
                lineHeight: 1.15,
                fontWeight: 900,
                color: "#1f1d3a",
              }}
            >
              {activeTask.target === "boy" ? "Задание для него" : "Задание для неё"}
            </div>

           <div style={{ marginTop: 10, fontSize: 16, lineHeight: 1.55, color: "#4b446a", padding: "14px 16px", borderRadius: 20, background: "rgba(107,70,255,0.06)", }} > {activeTask.text} </div>

            <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
              <button
                onClick={handleCompleteBottleTask}
                style={{ ...primaryButtonStyle, width: "100%" }}
              >
                Задание выполнено
              </button>

              <button
                onClick={handleAnotherBottleTask}
                style={{ ...secondaryButtonStyle, width: "100%" }}
              >
                Другое задание
              </button>
            </div>
          </div>
           
        </div>
      )}
    </div>

  );
}

function shuffle<T>(array: T[]): T[] {
  const copy = [...array];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}


function LoveQuestionsGameScreen({
  reward,
  appState,
  setAppState,
  onBack,
  onFinish,
  onClaimStepReward,
}: {
  reward: number;
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  onBack: () => void;
  onFinish: () => void;
  onClaimStepReward: (key: string) => Promise<boolean>;
}) {
const [animating, setAnimating] = useState(false);

const questionIndex = appState.loveQuestionsProgress.currentIndex ?? 0;
const answeredIds = appState.loveQuestionsAnsweredIds ?? [];

const unansweredQuestions = LOVE_QUESTIONS.filter(
  (q) => !answeredIds.includes(q.id)
);

const currentQuestion =
  unansweredQuestions.length > 0
    ? unansweredQuestions[questionIndex % unansweredQuestions.length]
    : null;
  

 const progressLabel = `${answeredIds.length} / ${LOVE_QUESTIONS.length}`;

  async function handleAnswered() {
    if (!currentQuestion || animating) return;

    setAnimating(true);

    const rewardKey = `love-questions:${currentQuestion.id}`;
    await onClaimStepReward(rewardKey);

// 👇 добавляем в список отвеченных
setAppState((prev) => ({
  ...prev,
  loveQuestionsAnsweredIds: prev.loveQuestionsAnsweredIds.includes(currentQuestion.id)
    ? prev.loveQuestionsAnsweredIds
    : [...prev.loveQuestionsAnsweredIds, currentQuestion.id],
}));

    handleNextQuestion();

    setTimeout(() => {
      handleNextQuestion();
      setAnimating(false);
    }, 300);
  }

  function handleNextQuestion() {
    setAppState((prev) => {
      const current = prev.loveQuestionsProgress.currentIndex ?? 0;
      const nextIndex =
        current + 1 >= LOVE_QUESTIONS.length ? 0 : current + 1;

      return {
        ...prev,
        loveQuestionsProgress: {
          currentIndex: nextIndex,
        },
      };
    });
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 14 }}>
      <div style={{ ...cardBaseStyle(), padding: 18 }}>
        <div style={{ fontSize: 26, fontWeight: 900, color: "#1f1d3a" }}>
          90 вопросов
        </div>

        <div
          style={{
            marginTop: 8,
            color: "#4b446a",
            fontSize: 15,
            lineHeight: 1.45,
          }}
        >
          Глубокие вопросы про чувства, близость и отношения.
        </div>
      </div>

      <div
        style={{
          ...cardBaseStyle(),
          padding: 22,
          minHeight: 320,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0.18))",
          transition: "all 0.3s ease",
          transform: animating ? "translateY(40px) scale(0.95)" : "translateY(0)",
          opacity: animating ? 0 : 1,
        }}
      >
        {currentQuestion ? (
          <>
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    padding: "8px 12px",
                    borderRadius: 999,
                    background: "rgba(107,70,255,0.10)",
                    color: "#6b46ff",
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  90 вопросов 💞
                </div>

                <div
                  style={{
                    display: "inline-flex",
                    padding: "8px 12px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.24)",
                    color: "#4b446a",
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  {progressLabel}
                </div>
              </div>

              <div
                style={{
                  marginTop: 18,
                  fontSize: 26,
                  fontWeight: 900,
                  color: "#211b3b",
                  lineHeight: 1.35,
                }}
              >
                {currentQuestion.text}
            
              </div>
              {answeredIds.includes(currentQuestion?.id) && (
  <div
    style={{
      marginTop: 10,
      fontSize: 13,
      fontWeight: 700,
      color: "#6f54ff",
    }}
  >
    ✔ Вы уже отвечали на этот вопрос
  </div>
)}
            </div>

            <button
              onClick={handleAnswered}
              disabled={animating}
              style={{
                ...primaryButtonStyle,
                width: "100%",
                marginTop: 20,
                opacity: animating ? 0.75 : 1,
                cursor: animating ? "not-allowed" : "pointer",
              }}
            >
              Ответили
            </button>
          </>
        ) : (
          <>
            <div
              style={{
                fontSize: 24,
                fontWeight: 900,
                color: "#211b3b",
                lineHeight: 1.35,
              }}
            >
              Вопросы закончились 🎉
            </div>

            <div style={{ marginTop: 12, color: "#4b446a", lineHeight: 1.45 }}>
              Ты прошёл(а) весь текущий набор вопросов.
            </div>
          </>
        )}
      </div>

      <button onClick={onBack} style={secondaryButtonStyle}>
        {t.common.back}
      </button>
    </div>
  );
}

function NeverHaveIEverGameScreen({
  reward,
  playedGameRewardKeys,
  onBack,
  onFinish,
  onClaimReward,
}: {
  reward: number;
  playedGameRewardKeys: string[];
  onBack: () => void;
  onFinish: () => void;
  onClaimReward: (rewardKey: string) => Promise<boolean>;
}) {
  const cards = [
    {
      type: "spicy",
      emoji: "😈",
      text: "Я никогда не играл(а) в карты на раздевание",
      task: "Если партнёр делал это — ему пора пыхтеть 😏",
    },
    {
      type: "funny",
      emoji: "🤣",
      text: "Я никогда не пел(а) вслух в душе",
      task: "Если партнёр делал это — поёт одну строчку любой песни",
    },
    {
      type: "romantic",
      emoji: "🔥",
      text: "Я никогда не устраивал(а) романтический сюрприз",
      task: "Если партнёр делал это — делится самой милой историей",
    },
    {
      type: "spicy",
      emoji: "😈",
      text: "Я никогда не писал(а) бывшему ночью",
      task: "Если партнёр делал это — рассказывает неловкую историю",
    },
    {
      type: "funny",
      emoji: "🤣",
      text: "Я никогда не засыпал(а) на свидании",
      task: "Если партнёр делал это — показывает это в лицах",
    },
    {
      type: "romantic",
      emoji: "🔥",
      text: "Я никогда не мечтал(а) о ленивом дне вдвоём без дел",
      task: "Если партнёр делал это — описывает этот день тремя словами",
    },
    {
      type: "spicy",
      emoji: "😈",
      text: "Я никогда не ревновал(а) без причины",
      task: "Если партнёр делал это — обнимает тебя 20 секунд",
    },
    {
      type: "funny",
      emoji: "🤣",
      text: "Я никогда не говорил(а) 'я в пути', ещё не выйдя из дома",
      task: "Если партнёр делал это — изображает очень виноватый вид 10 секунд",
    },
    {
      type: "romantic",
      emoji: "🔥",
      text: "Я никогда не представлял(а) наш идеальный совместный выходной",
      task: "Если партнёр делал это — быстро рассказывает свой вариант",
    },
    {
      type: "spicy",
      emoji: "😈",
      text: "Я никогда не флиртовал(а) ради шутки",
      task: "Если партнёр делал это — выполняет твоё мини-желание",
    },
    {
      type: "funny",
      emoji: "🤣",
      text: "Я никогда не путал(а) имя человека",
      task: "Если партнёр делал это — рассказывает самую неловкую ситуацию",
    },
    {
      type: "romantic",
      emoji: "🔥",
      text: "Я никогда не придумывал(а) милое прозвище для любимого человека",
      task: "Если партнёр делал это — придумывает тебе новое прямо сейчас",
    },
    {
      type: "spicy",
      emoji: "😈",
      text: "Я никогда не подглядывал(а) в чужой телефон",
      task: "Если партнёр делал это — честно признаётся, зачем",
    },
    {
      type: "funny",
      emoji: "🤣",
      text: "Я никогда не делал(а) вид, что слушаю, хотя мысли были в другом месте",
      task: "Если партнёр делал это — должен(на) очень внимательно слушать тебя 30 секунд",
    },
    {
      type: "romantic",
      emoji: "🔥",
      text: "Я никогда не влюблялся(ась) с первого взгляда",
      task: "Если партнёр делал это — делает тебе комплимент",
    },
    {
      type: "spicy",
      emoji: "😈",
      text: "Я никогда не хотел(а) поцеловать человека в первый же вечер",
      task: "Если партнёр делал это — улыбается максимально загадочно",
    },
    {
      type: "funny",
      emoji: "🤣",
      text: "Я никогда не танцевал(а) без музыки",
      task: "Если партнёр делал это — показывает 5 секунд танца",
    },
    {
      type: "romantic",
      emoji: "🔥",
      text: "Я никогда не хотел(а) устроить спонтанную поездку вдвоём",
      task: "Если партнёр делал это — называет место, куда хотел(а) бы поехать с тобой",
    },
    {
      type: "spicy",
      emoji: "😈",
      text: "Я никогда не писал(а) длинное сообщение и потом не удалял(а) его",
      task: "Если партнёр делал это — говорит, почему передумал(а)",
    },
    {
      type: "funny",
      emoji: "🤣",
      text: "Я никогда не удалял(а) фото из-за того, что плохо получился(ась)",
      task: "Если партнёр делал это — показывает свою самую смешную мину",
    },
    {
      type: "romantic",
      emoji: "🔥",
      text: "Я никогда не скучал(а) настолько, что пересматривал(а) фото человека",
      task: "Если партнёр делал это — признаётся, чьи фото так смотрел(а)",
    },
    {
      type: "spicy",
      emoji: "😈",
      text: "Я никогда не говорил(а) 'мне всё равно', когда было очень даже не всё равно",
      task: "Если партнёр делал это — говорит 3 вещи, которые ему(ей) не всё равно",
    },
    {
      type: "funny",
      emoji: "🤣",
      text: "Я никогда не выбирал(а) одежду дольше часа",
      task: "Если партнёр делал это — рассказывает про свой самый сложный выбор",
    },
    {
      type: "romantic",
      emoji: "🔥",
      text: "Я никогда не мечтал(а) проснуться у моря рядом с любимым человеком",
      task: "Если партнёр делал это — описывает такое утро одной фразой",
    },
    {
      type: "spicy",
      emoji: "😈",
      text: "Я никогда не ревновал(а) к прошлому партнёра",
      task: "Если партнёр делал это — честно признаётся, что именно задевало",
    },
    {
      type: "funny",
      emoji: "🤣",
      text: "Я никогда не опаздывал(а) на свидание больше чем на 30 минут",
      task: "Если партнёр делал это — извиняется максимально драматично",
    },
    {
      type: "romantic",
      emoji: "🔥",
      text: "Я никогда не делал(а) сюрприз без повода",
      task: "Если партнёр делал это — обещает маленький сюрприз в будущем",
    },
    {
      type: "spicy",
      emoji: "😈",
      text: "Я никогда не скрывал(а), что мне кто-то нравится",
      task: "Если партнёр делал это — показывает, как он(а) это обычно скрывает",
    },
    {
      type: "funny",
      emoji: "🤣",
      text: "Я никогда не делал(а) скриншот переписки",
      task: "Если партнёр делал это — делает максимально innocent face",
    },
    {
      type: "romantic",
      emoji: "🔥",
      text: "Я никогда не представлял(а) совместную жизнь через 10 лет",
      task: "Если партнёр делал это — рассказывает один такой образ",
    },
    {
      type: "spicy",
      emoji: "😈",
      text: "Я никогда не задерживал(а) ответ специально",
      task: "Если партнёр делал это — признаётся, зачем так делал(а)",
    },
    {
      type: "funny",
      emoji: "🤣",
      text: "Я никогда не делал(а) вид, что не заметил(а) сообщение",
      task: "Если партнёр делал это — признаётся, почему так бывает",
    },
    {
      type: "romantic",
      emoji: "🔥",
      text: "Я никогда не хотел(а) обнять человека сильнее, чем позволяли обстоятельства",
      task: "Если партнёр делал это — обнимает тебя прямо сейчас",
    },
    {
      type: "spicy",
      emoji: "😈",
      text: "Я никогда не устраивал(а) сцену ревности",
      task: "Если партнёр делал это — изображает свою ревность без слов",
    },
    {
      type: "funny",
      emoji: "🤣",
      text: "Я никогда не врал(а), что мне нравится подарок",
      task: "Если партнёр делал это — рассказывает про самый странный подарок",
    },
    {
      type: "romantic",
      emoji: "🔥",
      text: "Я никогда не думал(а): 'с этим человеком было бы очень спокойно'",
      task: "Если партнёр делал это — говорит, что для него(неё) значит спокойствие в любви",
    },
    {
      type: "spicy",
      emoji: "😈",
      text: "Я никогда не хотел(а) сбежать с вечеринки домой с кем-то вдвоём",
      task: "Если партнёр делал это — объясняет, что для него(неё) идеальный вечер",
    },
    {
      type: "funny",
      emoji: "🤣",
      text: "Я никогда не краснел(а) из-за комплимента",
      task: "Если партнёр делал это — получает от тебя новый комплимент",
    },
    {
      type: "romantic",
      emoji: "🔥",
      text: "Я никогда не хранил(а) мелочь на память о важном человеке",
      task: "Если партнёр делал это — рассказывает, что это была за вещь",
    },
    {
      type: "spicy",
      emoji: "😈",
      text: "Я никогда не хотел(а) пофлиртовать, просто чтобы проверить реакцию",
      task: "Если партнёр делал это — признаётся, что это было очень рискованно",
    },
    {
      type: "funny",
      emoji: "🤣",
      text: "Я никогда не пугался(ась) собственного сообщения на максимальной громкости",
      task: "Если партнёр делал это — изображает этот момент",
    },
    {
      type: "romantic",
      emoji: "🔥",
      text: "Я никогда не представлял(а), как мы выглядели бы в старости",
      task: "Если партнёр делал это — рассказывает одну милую деталь",
    },
    {
      type: "spicy",
      emoji: "😈",
      text: "Я никогда не писал(а) бывшему первым(ой) после расставания",
      task: "Если партнёр делал это — рассказывает, зачем это было",
    },
    {
      type: "funny",
      emoji: "🤣",
      text: "Я никогда не спотыкался(ась) на ровном месте на глазах у других",
      task: "Если партнёр делал это — показывает свой самый достойный выход из неловкости",
    },
    {
      type: "romantic",
      emoji: "🔥",
      text: "Я никогда не хотел(а) провести целый день вдвоём без телефонов",
      task: "Если партнёр делал это — описывает этот день одной фразой",
    },
    {
      type: "spicy",
      emoji: "😈",
      text: "Я никогда не делал(а) первый шаг в отношениях",
      task: "Если партнёр делал это — рассказывает, как это было",
    },
    {
      type: "funny",
      emoji: "🤣",
      text: "Я никогда не делал(а) виноватое лицо, чтобы выкрутиться",
      task: "Если партнёр делал это — показывает своё лучшее виноватое лицо",
    },
    {
      type: "romantic",
      emoji: "🔥",
      text: "Я никогда не переслушивал(а) песню из-за воспоминаний о человеке",
      task: "Если партнёр делал это — называет эту песню или её настроение",
    },
    {
      type: "spicy",
      emoji: "😈",
      text: "Я никогда не хотел(а) поцеловать кого-то неожиданно",
      task: "Если партнёр делал это — говорит, насколько это было спонтанно по шкале от 1 до 10",
    },
    {
      type: "funny",
      emoji: "🤣",
      text: "Я никогда не отправлял(а) сообщение не тому человеку",
      task: "Если партнёр делал это — рассказывает, что это было за сообщение",
    },
    {
      type: "romantic",
      emoji: "🔥",
      text: "Я никогда не мечтал(а) о красивом признании в любви",
      task: "Если партнёр делал это — делится одной такой идеей",
    },
    {
      type: "spicy",
      emoji: "😈",
      text: "Я никогда не вёл(вела) себя слишком гордо после ссоры",
      task: "Если партнёр делал это — говорит одну фразу для примирения",
    },
    {
      type: "funny",
      emoji: "🤣",
      text: "Я никогда не делал(а) вид, что всё нормально, когда было очень смешно",
      task: "Если партнёр делал это — пытается не засмеяться 5 секунд, глядя на тебя",
    },
    {
      type: "romantic",
      emoji: "🔥",
      text: "Я никогда не хотел(а) сказать человеку что-то очень нежное, но стеснялся(ась)",
      task: "Если партнёр делал это — говорит тебе это сейчас в мягкой форме",
    },
    {
      type: "spicy",
      emoji: "😈",
      text: "Я никогда не делал(а) вид, что мне неинтересно, хотя было очень интересно",
      task: "Если партнёр делал это — честно признаётся, когда так бывало",
    },
    {
      type: "funny",
      emoji: "🤣",
      text: "Я никогда не репетировал(а) разговор заранее в голове",
      task: "Если партнёр делал это — изображает, как это выглядит",
    },
    {
      type: "romantic",
      emoji: "🔥",
      text: "Я никогда не хотел(а) провести с человеком весь день, ничего особо не делая",
      task: "Если партнёр делал это — говорит, почему это для него(неё) ценно",
    },
    {
      type: "spicy",
      emoji: "😈",
      text: "Я никогда не делал(а) намёк вместо прямого признания",
      task: "Если партнёр делал это — признаётся, понял(а) ли кто-то этот намёк",
    },
    {
      type: "funny",
      emoji: "🤣",
      text: "Я никогда не терял(а) мысль посреди разговора",
      task: "Если партнёр делал это — должен(на) придумать очень умный вид на 3 секунды",
    },
  ] as const;

  function shuffle<T>(array: readonly T[]) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  

  const [index, setIndex] = useState(0);
  const [shuffledCards, setShuffledCards] = useState(() => shuffle(cards));
  const [flipped, setFlipped] = useState(false);
  const [rewardClaimed, setRewardClaimed] = useState(false);

  const card = shuffledCards[index] ?? null;

  

async function handleComplete() {
  if (rewardClaimed || !card) return;

  const rewardKey = `never-have:${card.text}`;
  await onClaimReward(rewardKey);

  setRewardClaimed(true);
  onFinish();

  setTimeout(() => {
    handleNext();
  }, 350);
}

function handleNext() {
  if (index + 1 >= shuffledCards.length) {
    setShuffledCards(shuffle(cards));
    setIndex(0);
  } else {
    setIndex((prev) => prev + 1);
  }

  setFlipped(false);
  setRewardClaimed(false);
}


  

  if (!card) {
  return (
    <div style={{ padding: 16, display: "grid", gap: 14 }}>
      <div style={{ ...cardBaseStyle(), padding: 18 }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: "#1f1d3a" }}>
          Я никогда не...
        </div>

        <div style={{ marginTop: 8, color: "#3a345c", fontSize: 15 }}>
          Загружаем карточки...
        </div>
      </div>

      <button onClick={onBack} style={secondaryButtonStyle}>
        {t.common.back}
      </button>
    </div>
  );
}

const rewardKey = `never-have:${card.text}`;
const alreadyPlayed = playedGameRewardKeys.includes(rewardKey);

const categoryLabel =
  card.type === "romantic"
    ? "Романтика"
    : card.type === "spicy"
    ? "Провокация"
    : "Смешное";

return (
  <div style={{ padding: 16, display: "grid", gap: 14 }}>
    <div style={{ ...cardBaseStyle(), padding: 18 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#1f1d3a" }}>
        Я никогда не...
      </div>

      <div
        style={{
          marginTop: 8,
          color: "#3a345c",
          fontSize: 15,
          lineHeight: 1.45,
        }}
      >
        Скажите что-то, чего вы никогда в жизни не делали, и если ваш партнёр
        делал это, он выполняет задание с карточки.
      </div>

      <div
        style={{
          marginTop: 10,
          color: "#4d466c",
          fontSize: 14,
          lineHeight: 1.45,
        }}
      >
        Например: «Я ни разу не играл в карты на раздевание» — если партнёр
        хотя бы раз делал это, ему пора выполнять задание.
      </div>

      <div
        style={{
          marginTop: 12,
          padding: "12px 14px",
          borderRadius: 16,
          background: "rgba(255,255,255,0.24)",
          color: "#2c2647",
          fontWeight: 800,
        }}
      >
        Награда за карточку: +{reward} очков
      </div>
    </div>

    <div style={{ ...cardBaseStyle(), padding: 18 }}>
      <div
        style={{
          perspective: 1000,
          marginTop: 4,
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            height: 240,
            transformStyle: "preserve-3d",
            transition: "transform 0.6s",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* FRONT */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backfaceVisibility: "hidden",
              borderRadius: 22,
              padding: 22,
              background: "rgba(255,255,255,0.92)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 14,
                left: 14,
                padding: "6px 10px",
                borderRadius: 999,
                background: "rgba(0,0,0,0.06)",
                fontSize: 13,
                fontWeight: 900,
                color: "#241b40",
              }}
            >
              {card.emoji} {categoryLabel}
            </div>

            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: "#211b3b",
                lineHeight: 1.45,
              }}
            >
              {card.text}
            </div>
          </div>

          {/* BACK */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              borderRadius: 22,
              padding: 22,
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(244,242,255,0.98))",
              boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 14,
                left: 14,
                padding: "6px 10px",
                borderRadius: 999,
                background: "rgba(0,0,0,0.06)",
                fontSize: 13,
                fontWeight: 900,
                color: "#241b40",
              }}
            >
              {card.emoji} Задание
            </div>

            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: "#241b40",
                lineHeight: 1.5,
              }}
            >
              {card.task}
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={() => setFlipped((prev) => !prev)}
        style={{ ...primaryButtonStyle, width: "100%", marginTop: 16 }}
      >
        {flipped ? "Показать вопрос" : "Показать задание"}
      </button>


  {flipped && (
  <button
    onClick={handleComplete}
    disabled={rewardClaimed || alreadyPlayed}
    style={{
      ...primaryButtonStyle,
      width: "100%",
      marginTop: 12,
      opacity: rewardClaimed || alreadyPlayed ? 0.6 : 1,
      cursor: rewardClaimed || alreadyPlayed ? "not-allowed" : "pointer",
    }}
  >
    {alreadyPlayed ? "Карточка уже сыграна" : "Карточка сыграна"}
  </button>
)}

     
    </div>

    <button onClick={onBack} style={secondaryButtonStyle}>
      {t.common.back}
      </button>
  </div>
);
}


function TestsScreen({
  completedTestIds,
  onBack,
  onCompleteTest,
}: {
  completedTestIds: string[];
  onBack: () => void;
  onCompleteTest: (test: TestDefinition) => void;
}) {
  const [activeTestId, setActiveTestId] = useState<string | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);

  const market = getMarket();
const t = market === "en" ? TEXT_EN : TEXT_RU;
  const activeTest = TESTS.find((item) => item.id === activeTestId) || null;
  const currentQuestion = activeTest?.questions[currentQuestionIndex] || null;

  function startTest(testId: string) {
    setActiveTestId(testId);
    setCurrentQuestionIndex(0);
    setAnswers([]);
    setFinished(false);
  }

 
function selectOption(optionIndex: number) {
  if (!activeTest) return;
  if (answers[currentQuestionIndex] !== undefined) return;

  const nextAnswers = [...answers];
  nextAnswers[currentQuestionIndex] = optionIndex;
  setAnswers(nextAnswers);

  const isLast = currentQuestionIndex === activeTest.questions.length - 1;

  setTimeout(() => {
    if (isLast) {
      setFinished(true);
    } else {
      setCurrentQuestionIndex((prev) => prev + 1);
    }
  }, 180);
}
  function handleNext() {
    if (!activeTest) return;
    if (answers[currentQuestionIndex] === undefined) return;

    const isLast = currentQuestionIndex === activeTest.questions.length - 1;
    if (isLast) {
      setFinished(true);
      return;
    }

    setCurrentQuestionIndex((prev) => prev + 1);
  }

  function getResult(): TestResult {
    if (!activeTest) {
      return {
        title: "",
        subtitle: "",
        description: "",
      };
    }

    if (activeTest.kind === "scale") {
      const totalScore = answers.reduce((sum, value) => sum + value, 0);
      const maxScore = activeTest.questions.length * 4;
      return getScaleResult(totalScore, maxScore);
    }

    if (activeTest.kind === "love-language") {
      return getLoveLanguageResult(answers);
    }

    return getPersonalityResult(answers);
  }

  function handleFinish() {
    if (!activeTest) return;
    onCompleteTest(activeTest);
    setActiveTestId(null);
    setCurrentQuestionIndex(0);
    setAnswers([]);
    setFinished(false);
  }

  if (!activeTestId) {
  return (
    <div style={{ padding: 10, display: "grid", gap: 8 }}>
      <div style={{ ...cardBaseStyle(), padding: 12 }}>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#1f1d3a" }}>
          Тесты
        </div>
        <div style={{ marginTop: 4, color: "#3a345c", fontSize: 13 }}>
          Узнай о себе и отношениях больше
        </div>
      </div>

      {TESTS.map((test) => {
        const completed = completedTestIds.includes(test.id);

        return (
          <div key={test.id} style={{ ...cardBaseStyle(), padding: 12 }}>
  {/* ВЕРХ: название + бейдж */}
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 10,
    }}
  >
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: 18,
          fontWeight: 900,
          color: "#111111",
          lineHeight: 1.2,
        }}
      >
        {test.title}
      </div>
    </div>

    <div
  style={{
    minWidth: 30,
    height: 30,
    borderRadius: 999,
    background: "rgba(143,107,255,0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#6b46ff",
    fontWeight: 900,
    fontSize: 13,
    flexShrink: 0,
  }}
>
  +{test.reward}
</div>
  </div>

  {/* Описание */}
  <div
    style={{
      marginTop: 4,
      color: "#40395f",
      lineHeight: 1.3,
      fontSize: 13,
    }}
  >
    {test.description}
  </div>

  {/* Только количество вопросов */}
  <div
    style={{
      marginTop: 6,
      color: "#4d466c",
      fontSize: 12,
    }}
  >
    {test.questions.length} вопросов
  </div>

              

            <button
  onClick={() => startTest(test.id)}
  style={{
    ...primaryButtonStyle,
    width: "100%",
    marginTop: 8,
    padding: "11px 14px",
    fontSize: 15,
    opacity: completed ? 0.92 : 1,
  }}
>
            
              {completed ? "Пройти снова" : "Начать"}
            </button>
          </div>
        );
      })}

      <button
  onClick={onBack}
  style={{ ...secondaryButtonStyle, marginTop: 0, padding: "10px 16px" }}
>
        {t.common.back}
      </button>
    </div>
  );
}

  if (!activeTest || !currentQuestion) return null;

  if (finished) {
    const result = getResult();

    return (
      <div style={{ padding: 16 }}>
        <div style={{ ...cardBaseStyle(), padding: 20 }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: "#1f1d3a" }}>
            Результат теста ✨
          </div>

          <div style={{ marginTop: 16, fontSize: 26, fontWeight: 900, color: "#241b40" }}>
            {result.title}
          </div>

          <div style={{ marginTop: 8, fontSize: 16, fontWeight: 800, color: "#4d466c" }}>
            {result.subtitle}
          </div>

          <div style={{ marginTop: 14, color: "#3a345c", lineHeight: 1.55 }}>
            {result.description}
          </div>

          <div
            style={{
              marginTop: 16,
              padding: "12px 14px",
              borderRadius: 16,
              background: "rgba(255,255,255,0.24)",
              color: "#2c2647",
              fontWeight: 800,
            }}
          >
            Награда за тест: +{activeTest.reward} очков
          </div>

          <button
            onClick={handleFinish}
            style={{ ...primaryButtonStyle, width: "100%", marginTop: 16 }}
          >
            Забрать очки
          </button>
        </div>
      </div>
    );
  }

  const selectedIndex = answers[currentQuestionIndex];

  return (
    <div style={{ padding: 16, display: "grid", gap: 14 }}>
      <div style={{ ...cardBaseStyle(), padding: 18 }}>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#1f1d3a" }}>
          {activeTest.title}
        </div>
        <div style={{ marginTop: 8, color: "#4b446a" }}>
          Вопрос {currentQuestionIndex + 1} из {activeTest.questions.length}
        </div>
      </div>

      <div style={{ ...cardBaseStyle(), padding: 18 }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#211b3b",
            lineHeight: 1.35,
          }}
        >
          {currentQuestion.text}
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          {currentQuestion.options.map((option, index) => {
            const isSelected = selectedIndex === index;

            return (
              <button
                key={option}
                onClick={() => selectOption(index)}
                style={{
                  border: isSelected
                    ? "2px solid rgba(108, 58, 255, 0.48)"
                    : "1px solid rgba(255,255,255,0.28)",
                  borderRadius: 18,
                  padding: "14px 16px",
                  background: isSelected
                    ? "rgba(255,255,255,0.38)"
                    : "rgba(255,255,255,0.20)",
                  color: "#1f1d3a",
                  textAlign: "left",
                  fontSize: 16,
                  fontWeight: isSelected ? 900 : 700,
                  cursor: "pointer",
                }}
              >
                {option}
              </button>
            );
          })}
        </div>

       

        <button onClick={() => setActiveTestId(null)} style={secondaryButtonStyle}>
          Выйти из теста
        </button>
      </div>
    </div>
  );
}

function RewardsScreen({
  points,
  wonRewards,
  onBack,
  onSpin,
}: {
  points: number;
  wonRewards: WonReward[];
  onBack: () => void;
  onSpin: (categoryIndex: number) => Promise<WonReward | null>;
}) {

  const market = getMarket();
const t = market === "en" ? TEXT_EN : TEXT_RU;
  const [rotation, setRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedRewardId, setSelectedRewardId] = useState<string | null>(null);

  const size = 320;
  const radius = 150;
  const center = size / 2;
  const count = REWARD_CATEGORIES.length;
  const segmentAngle = 360 / count;
  


  async function handleSpin() {
    if (isSpinning) return;
    if (points < WHEEL_SPIN_COST) {
      setMessage("Недостаточно очков для вращения колеса.");
      return;
    }

    setMessage("");
    setSelectedRewardId(null);
    setIsSpinning(true);

    const targetIndex = pickWeightedIndex(
      REWARD_CATEGORIES.map((category) => category.weight),
    );
    const spins = 5;
    const targetCenterAngle = targetIndex * segmentAngle + segmentAngle / 2;
    const targetRotation = spins * 360 + (360 - targetCenterAngle);

    setRotation((prev) => {
      const normalizedPrev = ((prev % 360) + 360) % 360;
      return prev - normalizedPrev + targetRotation;
    });

   setTimeout(async () => {
  const result = await onSpin(targetIndex);
  setIsSpinning(false);

  if (result) {
    setSelectedRewardId(result.id);
    setMessage(
      `Тебе выпал приз: ${result.title} (${result.categoryTitle})`,
    );
  }
}, 4300);
  }

  return (
    <div style={{ padding: 12, display: "grid", gap: 10 }}>
     <div style={{ ...cardBaseStyle(), padding: 14 }}>
  <div style={{ fontSize: 24, fontWeight: 900, color: "#1f1d3a" }}>
    Колесо призов
  </div>
  <div style={{ marginTop: 4, color: "#3a345c", fontSize: 13, lineHeight: 1.4 }}>
    Одно вращение стоит <b>{WHEEL_SPIN_COST}</b> очков
  </div>

  <div
    style={{
      marginTop: 10,
      padding: "12px 14px",
      borderRadius: 16,
      background: "rgba(255,255,255,0.26)",
      fontSize: 17,
      fontWeight: 900,
      color: "#241b40",
    }}
  >
    ⭐ Очков: {points}
  </div>
</div>

      <div style={{ ...cardBaseStyle(), padding: 18 }}>
        <div
          style={{
            position: "relative",
            width: size,
            maxWidth: "100%",
            margin: "0 auto",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -8,
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "16px solid transparent",
              borderRight: "16px solid transparent",
              borderTop: "28px solid #5f35ff",
              zIndex: 3,
              filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.18))",
            }}
          />

          <svg
            viewBox={`0 0 ${size} ${size}`}
            style={{
              width: "100%",
              height: "auto",
              transform: `rotate(${rotation}deg)`,
              transition: isSpinning
                ? "transform 4.2s cubic-bezier(0.12, 0.82, 0.16, 1)"
                : "none",
              filter: "drop-shadow(0 14px 30px rgba(72,56,120,0.22))",
            }}
          >
            {REWARD_CATEGORIES.map((category, index) => {
              const startAngle = index * segmentAngle;
              const endAngle = startAngle + segmentAngle;
              const midAngle = startAngle + segmentAngle / 2;
              const textPos = polarToCartesian(center, center, radius * 0.62, midAngle);
              const rotationForText = midAngle;

              return (
                <g key={category.id}>
                  <path
                    d={createSectorPath(center, center, radius, startAngle, endAngle)}
                    fill={WHEEL_COLORS[index % WHEEL_COLORS.length]}
                    stroke="rgba(255,255,255,0.72)"
                    strokeWidth={2}
                  />
                  <g
                    transform={`translate(${textPos.x} ${textPos.y}) rotate(${rotationForText})`}
                  >
                    <text
                      x="0"
                      y="-8"
                      textAnchor="middle"
                      fill="#241b40"
                      fontSize="22"
                      fontWeight="700"
                    >
                      {category.emoji}
                    </text>
                    <text
                      x="0"
                      y="14"
                      textAnchor="middle"
                      fill="#241b40"
                      fontSize="11"
                      fontWeight="800"
                    >
                      {category.title}
                    </text>
                  </g>
                </g>
              );
            })}

            <circle
              cx={center}
              cy={center}
              r="34"
              fill="rgba(255,255,255,0.92)"
              stroke="rgba(255,255,255,0.8)"
              strokeWidth="4"
            />
            <text
              x={center}
              y={center + 6}
              textAnchor="middle"
              fill="#4c2fe2"
              fontSize="15"
              fontWeight="900"
            >
              GO
            </text>
          </svg>
        </div>

        <button
          onClick={handleSpin}
          disabled={isSpinning || points < WHEEL_SPIN_COST}
          style={{
  ...primaryButtonStyle,
  width: "100%",
  marginTop: 12,
  padding: "12px 14px",
  fontSize: 15,
            opacity: isSpinning || points < WHEEL_SPIN_COST ? 0.6 : 1,
            cursor:
              isSpinning || points < WHEEL_SPIN_COST ? "not-allowed" : "pointer",
          }}
        >
          {isSpinning ? "Крутим..." : `Крутить за ${WHEEL_SPIN_COST} очков`}
        </button>

        {message ? (
          <div
            style={{
              marginTop: 12,
              padding: "12px 14px",
              borderRadius: 16,
              background: "rgba(255,255,255,0.22)",
              color: "#2f2850",
              fontWeight: 700,
              lineHeight: 1.45,
            }}
          >
            {message}
          </div>
        ) : null}
      </div>

      <div style={{ ...cardBaseStyle(), padding: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#1f1d3a" }}>
          Выпавшие призы
        </div>

        {wonRewards.length === 0 ? (
          <div style={{ marginTop: 10, color: "#4a4468", lineHeight: 1.5 }}>
            Пока здесь пусто. Заработай очки и крутанни колесо.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {[...wonRewards].reverse().map((reward, index) => (
              <div
                key={`${reward.id}-${index}-${reward.wonAt}`}
                style={{
                  padding: "12px 14px",
                  borderRadius: 16,
                  background:
                    reward.id === selectedRewardId
                      ? "rgba(255,255,255,0.34)"
                      : "rgba(255,255,255,0.24)",
                  border:
                    reward.id === selectedRewardId
                      ? "2px solid rgba(108,58,255,0.42)"
                      : "1px solid transparent",
                }}
              >
                <div style={{ fontWeight: 900, color: "#241b40" }}>
                  {reward.title}
                </div>
                <div style={{ marginTop: 4, fontSize: 14, color: "#4d466c" }}>
                  Категория: {reward.categoryTitle}
                </div>
                <div style={{ marginTop: 2, fontSize: 13, color: "#5b5578" }}>
                  {reward.wonAt}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={onBack} style={secondaryButtonStyle}>
        {t.common.back}
      </button>
    </div>
  );
}

 function GenderSelectScreen({
  onSelect,
}: {
  onSelect: (gender: "boy" | "girl") => void;
}) {
  return (
    <div style={{ padding: 16 }}>
      <div style={{ ...cardBaseStyle(), padding: 20 }}>
        <div
          style={{
            fontSize: 24,
            fontWeight: 900,
            color: "#1f1d3a",
            textAlign: "center",
          }}
        >
          Выбери свой пол
        </div>

       <div
  style={{
    marginTop: 8,
    color: "#5a5378",
    fontSize: 14,
    lineHeight: 1.45,
    textAlign: "center",
  }}
>
  Это нужно только один раз, чтобы показывать тебе подходящие тесты и опросы!
</div>

        <button
          style={{ ...primaryButtonStyle, width: "100%", marginTop: 18 }}
          onClick={() => onSelect("boy")}
        >
          Я парень
        </button>

        <button
          style={{ ...secondaryButtonStyle, width: "100%", marginTop: 10 }}
          onClick={() => onSelect("girl")}
        >
          Я девушка
        </button>
      </div>
    </div>
  );
}

function TopPlayersScreen({
  pair,
  leaderboard,
  previousLeaderboard,
  weeklyTopRewardClaimedWeek,
  onBack,
  onClaimWeeklyReward,
  t,
}: {
  pair: PairState;
  leaderboard: WeeklyPairLeaderboardRow[];
  previousLeaderboard: WeeklyPairLeaderboardRow[];
  weeklyTopRewardClaimedWeek: string | null;
  onBack: () => void;
  onClaimWeeklyReward: () => void;
  t: any;
}) {


 const currentWeekKey = getCurrentWeekKey();
const previousWeekKey = getPreviousWeekKey();

const allPairs = leaderboard.map((row, index) => ({
  ...row,
  place: index + 1,
  isCurrentPair: row.pair_id === pair.pairId,
}));

const previousWeekPairs = previousLeaderboard.map((row, index) => ({
  ...row,
  place: index + 1,
  isCurrentPair: row.pair_id === pair.pairId,
}));

const currentPairRow = allPairs.find((row) => row.isCurrentPair);
const previousWeekPairRow = previousWeekPairs.find((row) => row.isCurrentPair);

const wasTopThreeLastWeek =
  previousWeekPairRow?.place === 1 ||
  previousWeekPairRow?.place === 2 ||
  previousWeekPairRow?.place === 3;

const alreadyClaimedLastWeek =
  weeklyTopRewardClaimedWeek === previousWeekKey;

const canClaimWeeklyReward =
  wasTopThreeLastWeek && !alreadyClaimedLastWeek;

  return (
    <div style={{ padding: 12, display: "grid", gap: 10 }}>
      <div style={{ ...cardBaseStyle(), padding: 14 }}>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#1f1d3a" }}>
          🏆 {t.top.title}
        </div>
        <div style={{ marginTop: 4, color: "#3a345c", fontSize: 13, lineHeight: 1.4 }}>
          {t.top.subtitle}
        </div>
      </div>

      <div style={{ ...cardBaseStyle(), padding: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#1f1d3a" }}>
          Рейтинг
        </div>

        {allPairs.length === 0 ? (
          <div style={{ marginTop: 10, color: "#4a4468", lineHeight: 1.45, fontSize: 14 }}>
            {t.top.noData}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {allPairs.map((pairRow) => {
              const isTop1 = pairRow.place === 1;
              const isTop2 = pairRow.place === 2;
              const isTop3 = pairRow.place === 3;

              return (
                <div             
  key={pairRow.id}
  style={{
    padding: "10px 12px",
    borderRadius: 16,
    background: pairRow.isCurrentPair
      ? "rgba(255,255,255,0.34)"
      : "rgba(255,255,255,0.24)",
    border: pairRow.isCurrentPair
      ? "2px solid rgba(108,58,255,0.42)"
      : "1px solid transparent",
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    boxSizing: "border-box",
    overflow: "hidden",
  }}
>
<div
  style={{
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    flex: 1,
  }}
>                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 999,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 900,
                        fontSize: 14,
                        color: "#1f1d3a",
                        background: isTop1
                          ? "linear-gradient(135deg, #ffd54f, #ffb300)"
                          : isTop2
                          ? "linear-gradient(135deg, #f1f1f1, #cfcfcf)"
                          : isTop3
                          ? "linear-gradient(135deg, #ffcc80, #ff9e80)"
                          : "rgba(255,255,255,0.45)",
                      }}
                    >
                      {pairRow.place}
                    </div>

                    <div style={{ minWidth: 0 }}>
                     <div
  style={{
    fontWeight: 900,
    color: "#241b40",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  }}
>
  {pairRow.pair_title}

                        {pairRow.isCurrentPair ? " (Вы)" : ""}
                      </div>
                      <div style={{ marginTop: 3, fontSize: 12, color: "#4d466c" }}>
                        {isTop1 ? "Лидеры недели" : `Место #${pairRow.place}`}
                      </div>
                    </div>
                  </div>

                  <div
  style={{
    flexShrink: 0,
    textAlign: "right",
    color: "#241b40",
    fontWeight: 900,
    fontSize: 15,
    whiteSpace: "nowrap",
  }}
>
 ⭐ {pairRow.total_points}
</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ ...cardBaseStyle(), padding: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#1f1d3a" }}>
          Награда недели
        </div>

        <div
          style={{
            marginTop: 8,
            color: "#4a4468",
            lineHeight: 1.45,
            fontSize: 13,
          }}
        >
          Пары из топа получают <b>+500 очков</b> 
        </div>

       <div
  style={{
    marginTop: 10,
    padding: "12px 14px",
    borderRadius: 16,
    background: "rgba(255,255,255,0.24)",
    color: "#241b40",
    fontWeight: 800,
    fontSize: 14,
  }}
>
  {wasTopThreeLastWeek
    ? alreadyClaimedLastWeek
      ? "Награда за прошлую неделю уже получена ✅"
      : "Ваша пара вошла в топ-3 по итогам прошлой недели! Можно забрать награду 🎉"
    : "Награда появляется только после завершения недели и только для пар из топ-3 прошлой недели"}
</div>

       {canClaimWeeklyReward && (
  <button
    onClick={onClaimWeeklyReward}
    style={{ ...primaryButtonStyle, width: "100%", marginTop: 12 }}
  >
    {t.top.weeklyReward}
  </button>
)}
      </div>

      <button onClick={onBack} style={{ ...secondaryButtonStyle, marginTop: 0 }}>
        {t.common.back}
      </button>
    </div>
  );
}

function ReferralsScreen({
  user,
  appState,
  onBack,
}: {
  user: TgUser | null;
  appState: AppState;
  onBack: () => void;
}) {
  const inviteLink = user?.id
    ? `https://t.me/${window.Telegram?.WebApp ? "couple_quizzes_bot" : "couple_quizzes_bot"}?startapp=ref_${user.id}`
    : "";

  const handleInvite = () => {
    if (!user?.id) return;

    const text =
      `💖 Присоединяйся к Couple Quizzes!\n\n` +
      `Проходите тесты, опросы и игры для пары вместе.\n\n` +
      `Вот моя ссылка-приглашение:\n${inviteLink}`;

    if (window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(text)}`
      );
      return;
    }

    navigator.clipboard?.writeText(inviteLink);
    alert("Ссылка приглашения скопирована");
  };

return (
  <div style={{ padding: 16 }}>
    
    {/* Заголовок */}
    <div style={{ ...cardBaseStyle(), padding: 16, marginBottom: 14 }}>
      <div
        style={{
          fontSize: 22,
          fontWeight: 900,
          color: "#1f1d3a",
          textAlign: "center",
        }}
      >
         Пригласить друзей
      </div>
    </div>

    {/* Основная карточка */}
    <div style={{ ...cardBaseStyle(), padding: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#1f1d3a" }}>
          Твоя реферальная программа
        </div>

        <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.5, color: "#5f5a7a" }}>
          Приглашай друзей в Couple Quizzes и получай +200 очков за каждого нового пользователя,
          который зашел по твоей ссылке.
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          <div style={{ ...cardBaseStyle(), padding: 14 }}>
            <div style={{ fontSize: 13, color: "#7b7698", fontWeight: 700 }}>
              Приглашено друзей
            </div>
            <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900, color: "#1f1d3a" }}>
              {appState.referrals.invitedUsers.length}
            </div>
          </div>

          <div style={{ ...cardBaseStyle(), padding: 14 }}>
            <div style={{ fontSize: 13, color: "#7b7698", fontWeight: 700 }}>
              Заработано очков
            </div>
            <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900, color: "#6b46ff" }}>
              +{appState.referrals.totalReward}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, color: "#7b7698", fontWeight: 700, marginBottom: 8 }}>
            Твоя ссылка
          </div>

          <div
            style={{
              background: "#f6f3ff",
              borderRadius: 16,
              padding: 12,
              fontSize: 13,
              lineHeight: 1.45,
              color: "#1f1d3a",
              wordBreak: "break-word",
            }}
          >
            {inviteLink || "Ссылка появится после загрузки профиля"}
          </div>
        </div>

        <button
          style={{ ...primaryButtonStyle, width: "100%", marginTop: 16 }}
          onClick={handleInvite}
        >
          Пригласить друзей
        </button>
      </div>

     <button
  onClick={onBack}
  style={{
    ...secondaryButtonStyle,
    width: "100%",
    marginTop: 16,
  }}
>
  {t.common.back}
</button>
    </div>
  );
}


function ProfileAndStatsScreen({
  user,
  points,
  stats,
  bonusState,
  wonRewards,
 pairPollAnswers,
  referrals,
  isPremium,
  onBack,
  onNavigate,
}: {
  

  user: TgUser | null;
  points: number;
  stats: AppStats;
  bonusState: DailyBonusState;
  wonRewards: WonReward[];
    onNavigate: (screen: Screen) => void;
  pairPollAnswers: Record<string, number[]>;

  referrals: {
    invitedUsers: string[];
    totalReward: number;

  };
  isPremium: boolean;
  onBack: () => void;
}) {


  const market = getMarket();
const t = market === "en" ? TEXT_EN : TEXT_RU;
  const fullName =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    "Пользователь";

 const pairStats = calculatePairStats(pairPollAnswers);


  return (
    <div style={{ padding: 16, display: "grid", gap: 14 }}>
      <div style={{ ...cardBaseStyle(), padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {user?.photo_url ? (
            <img
              src={user.photo_url}
              alt={fullName}
              style={{
                width: 74,
                height: 74,
                borderRadius: 999,
                objectFit: "cover",
                border: "2px solid rgba(255,255,255,0.45)",
              }}
            />
          ) : (
            <div
              style={{
                width: 74,
                height: 74,
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,255,255,0.35)",
                color: "#201a39",
                fontWeight: 900,
                fontSize: 26,
                border: "2px solid rgba(255,255,255,0.42)",
              }}
            >
              {getInitials(user?.first_name, user?.last_name)}
            </div>
          )}

          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#1f1d3a" }}>
              {fullName}
            </div>
            {isPremium ? (
  <div
    style={{
      marginTop: 6,
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 10px",
      borderRadius: 999,
      background: "rgba(255,255,255,0.30)",
      color: "#3b3158",
      fontSize: 12,
      fontWeight: 800,
    }}
  >
    ✨ Premium активен
  </div>
) : (
  <button
    onClick={() => onNavigate("paywall")}
    style={{
      marginTop: 6,
      padding: "6px 10px",
      fontSize: 12,
      borderRadius: 999,
      border: "none",
      background: "linear-gradient(135deg,#8f6bff,#ff76ba)",
      color: "#fff",
      fontWeight: 700,
      cursor: "pointer",
    }}
  >
    Разблокировать Premium ✨
  </button>
)}
            {isPremium && (
  <div
    style={{
      marginTop: 8,
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 12px",
      borderRadius: 999,
      background: "rgba(255,255,255,0.30)",
      color: "#241b40",
      fontWeight: 900,
      fontSize: 13,
    }}
  >
    👑 Premium
  </div>
)}

            <div
              style={{
                marginTop: 10,
                fontWeight: 900,
                fontSize: 18,
                color: "#241b40",
              }}
            >
              ⭐ {points} очков
            </div>
          </div>
        </div>
      </div>

      <div style={{ ...cardBaseStyle(), padding: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#1f1d3a" }}>
          {t.profile.stats}
        </div>
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          <StatRow label={t.profile.pollsCompleted} value={stats.pollsCompleted} />

         <StatRow label={t.profile.recentPrizes} value={stats.rewardsRedeemed} />
<StatRow label={t.profile.totalPoints} value={points} />
         
      
        </div>
      </div>

      <div style={{ ...cardBaseStyle(), padding: 18 }}>
  <div style={{ fontSize: 22, fontWeight: 900, color: "#1f1d3a" }}>
    Пригласи друзей 👥
  </div>

  <div
    style={{
      marginTop: 8,
      color: "#4b446a",
      fontSize: 14,
      lineHeight: 1.45,
    }}
  >
    Получай +200 очков за каждого друга,
    который откроет приложение по твоей ссылке.
  </div>



  <button
  onClick={() => onNavigate("referrals")}
  style={{ ...primaryButtonStyle, width: "100%", marginTop: 12 }}
>
  Пригласить друзей
</button>
  
</div>

<button
  onClick={onBack}
  style={{
    ...secondaryButtonStyle,
    width: "100%",
    marginTop: 16,
  }}
>
  {t.common.back}
</button>
  
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 16,
        background: "rgba(255,255,255,0.24)",
      }}
    >
      <div style={{ color: "#2c2647", fontWeight: 700 }}>{label}</div>
      <div style={{ color: "#1c1733", fontWeight: 900 }}>{value}</div>
    </div>
  );
}

const primaryButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 16,
  padding: "13px 16px",
  fontSize: 16,
  fontWeight: 900,
  cursor: "pointer",
  color: "white",
  background: "linear-gradient(135deg, #8f6bff, #ff76ba)",
  boxShadow: "0 10px 24px rgba(126, 75, 255, 0.24)",
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.34)",
  borderRadius: 16,
  padding: "12px 16px",
  fontSize: 15,
  fontWeight: 900,
  cursor: "pointer",
  color: "#201b39",
  background: "rgba(255,255,255,0.22)",
  marginTop: 10,
  width: "100%",
};

async function upsertTelegramProfile(user: TgUser) {
  if (!user.id) return null;

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        telegram_id: user.id,
        first_name: user.first_name ?? null,
        last_name: user.last_name ?? null,
        username: user.username ?? null,
        photo_url: user.photo_url ?? null,
      },
      { onConflict: "telegram_id" }
    )
    .select()
    .single();

  if (error) {
    console.error("upsertTelegramProfile error:", error);
    return null;
  }

  return data;
}

async function loadWeeklyPairLeaderboard(weekKey: string): Promise<WeeklyPairLeaderboardRow[]> {
  const { data, error } = await supabase
    .from("weekly_pair_leaderboard")
    .select("*")
    .eq("week_key", weekKey)
    .order("total_points", { ascending: false })
    .limit(20);

  if (error || !data) {
    console.error("loadWeeklyPairLeaderboard error:", error);
    return [];
  }

  return data as WeeklyPairLeaderboardRow[];
}

async function upsertWeeklyPairLeaderboardEntry(params: {
  weekKey: string;
  pairId: string;
  pairTitle: string;
  totalPoints: number;
}) {
  const { weekKey, pairId, pairTitle, totalPoints } = params;

  const { error } = await supabase
    .from("weekly_pair_leaderboard")
    .upsert(
      {
        week_key: weekKey,
        pair_id: pairId,
        pair_title: pairTitle,
        total_points: totalPoints,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "week_key,pair_id" }
    );

  if (error) {
    console.error("upsertWeeklyPairLeaderboardEntry error:", error);
  }
}


async function loadPairStateForUser(telegramId: number): Promise<PairState> {
  const emptyState: PairState = {
  pairId: null,
  inviteCode: null,
  partner: null,
  createdByTelegramId: null,
  totalPoints: 0,
};



  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("pair_id")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (profileError || !profile?.pair_id) {
    return emptyState;
  }

  const { data: pair, error: pairError } = await supabase
    .from("pairs")
    .select("*")
    .eq("id", profile.pair_id)
    .single();

  if (pairError || !pair) {
    return emptyState;
  }

  const currentTelegramId = Number(telegramId);
  const partner1Id = pair.partner_1_telegram_id != null ? Number(pair.partner_1_telegram_id) : null;
  const partner2Id = pair.partner_2_telegram_id != null ? Number(pair.partner_2_telegram_id) : null;
  const createdByTelegramId =
    pair.created_by_telegram_id != null ? Number(pair.created_by_telegram_id) : null;

  const rawPartnerTelegramId =
    partner1Id === currentTelegramId ? partner2Id : partner1Id;

  const partnerTelegramId =
    rawPartnerTelegramId && rawPartnerTelegramId !== currentTelegramId
      ? rawPartnerTelegramId
      : null;

  let partner: PairMember | null = null;

  if (partnerTelegramId) {
    const { data: partnerProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("telegram_id", partnerTelegramId)
      .maybeSingle();

    if (partnerProfile) {
      partner = {
        telegramId: Number(partnerProfile.telegram_id),
        firstName: partnerProfile.first_name ?? undefined,
        lastName: partnerProfile.last_name ?? undefined,
        username: partnerProfile.username ?? undefined,
        photoUrl: partnerProfile.photo_url ?? undefined,
      };
    }
  }
return {
  pairId: pair.id,
  inviteCode: pair.invite_code,
  partner,
  createdByTelegramId,
  totalPoints: pair.total_points ?? 0,
};

}

async function updatePairPoints(params: {
  pairId: string;
  delta: number;
}): Promise<number | null> {
  const { pairId, delta } = params;

  const { data: pair, error: readError } = await supabase
    .from("pairs")
    .select("total_points")
    .eq("id", pairId)
    .single();

  if (readError || !pair) {
    console.error("updatePairPoints read error:", readError);
    return null;
  }

  const nextPoints = Math.max(0, (pair.total_points ?? 0) + delta);

  const { error: updateError } = await supabase
    .from("pairs")
    .update({ total_points: nextPoints })
    .eq("id", pairId);

  if (updateError) {
    console.error("updatePairPoints update error:", updateError);
    return null;
  }

  return nextPoints;
}


async function savePollSubmission(params: {
  pairId: string;
  telegramId: number;
  pollId: string;
  answers: number[];
}) {
  const { pairId, telegramId, pollId, answers } = params;

  const { error } = await supabase
    .from("poll_submissions")
    .upsert(
      {
        pair_id: pairId,
        telegram_id: telegramId,
        poll_id: pollId,
        answers,
      },
      { onConflict: "telegram_id,poll_id" }
    );

  if (error) {
    console.error("savePollSubmission error:", error);
  }
}

async function loadPairPollAnswers(pairId: string): Promise<Record<string, number[]>> {
  const { data, error } = await supabase
    .from("poll_submissions")
    .select("poll_id, answers")
    .eq("pair_id", pairId);

  if (error || !data) {
    console.error("loadPairPollAnswers error:", error);
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

async function saveDailyPairAnswer(params: {
  pairId: string;
  date: string;
  questionId: string;
  telegramId: number;
  answerIndex: number;
}) {
  const { pairId, date, questionId, telegramId, answerIndex } = params;

  const { error } = await supabase
    .from("daily_pair_answers")
    .upsert(
      {
        pair_id: pairId,
        answer_date: date,
        question_id: questionId,
        telegram_id: telegramId,
        answer_index: answerIndex,
      },
      { onConflict: "answer_date,telegram_id" }
    );

  if (error) {
    console.error("saveDailyPairAnswer error:", error);
  }
}

async function loadDailyPairAnswersForDate(params: {
  pairId: string;
  date: string;
}) {
  const { pairId, date } = params;

  const { data, error } = await supabase
    .from("daily_pair_answers")
    .select("telegram_id, question_id, answer_index, created_at")
    .eq("pair_id", pairId)
    .eq("answer_date", date)
    .order("created_at", { ascending: true });

  if (error || !data) {
    console.error("loadDailyPairAnswersForDate error:", error);
    return [];
  }

  return data;
}

async function loadDailyPairHistory(pairId: string): Promise<
  Array<{
    date: string;
    questionId: string;
    boyAnswerIndex: number | null;
    girlAnswerIndex: number | null;
  }>
> {
  const { data, error } = await supabase
    .from("daily_pair_answers")
    .select("answer_date, question_id, telegram_id, answer_index, created_at")
    .eq("pair_id", pairId)
    .order("answer_date", { ascending: false })
    .order("created_at", { ascending: true });

  if (error || !data) {
    console.error("loadDailyPairHistory error:", error);
    return [];
  }

  const grouped = new Map<
    string,
    {
      date: string;
      questionId: string;
      boyAnswerIndex: number | null;
      girlAnswerIndex: number | null;
    }
  >();

  for (const row of data) {
    const key = String(row.answer_date);

    if (!grouped.has(key)) {
      grouped.set(key, {
        date: String(row.answer_date),
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

function getPreviousDateString(dateString: string) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() - 1);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function calculateDailyPairStreak(
  history: Array<{
    date: string;
    questionId: string;
    boyAnswerIndex: number | null;
    girlAnswerIndex: number | null;
  }>
) {
  if (!history.length) {
    return {
      current: 0,
      reachedMilestones: [] as number[],
    };
  }

  const completedDates = history
    .filter(
      (item) =>
        item.boyAnswerIndex !== null &&
        item.girlAnswerIndex !== null
    )
    .map((item) => item.date)
    .sort((a, b) => b.localeCompare(a));

  if (!completedDates.length) {
    return {
      current: 0,
      reachedMilestones: [] as number[],
    };
  }

  let streak = 1;

  for (let i = 0; i < completedDates.length - 1; i++) {
    const currentDate = completedDates[i];
    const nextExpected = getPreviousDateString(currentDate);
    const nextDate = completedDates[i + 1];

    if (nextDate === nextExpected) {
      streak += 1;
    } else {
      break;
    }
  }

  const milestones = [3, 5, 10, 15];
  const reachedMilestones = milestones.filter((m) => streak >= m);

  return {
    current: streak,
    reachedMilestones,
  };
}

async function refreshPairData(params: {
  user: TgUser | null;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
}) {
  const { user, setAppState } = params;

  if (!user?.id) return;

  const nextPairState = await loadPairStateForUser(user.id);

  let pairPollAnswersFromDb: Record<string, number[]> = {};
let dailyPairHistoryFromDb: Array<{
  date: string;
  questionId: string;
  boyAnswerIndex: number | null;
  girlAnswerIndex: number | null;
}> = [];

let dailyPairStreakFromDb = {
  current: 0,
  reachedMilestones: [] as number[],
};

if (nextPairState.pairId) {
  pairPollAnswersFromDb = await loadPairPollAnswers(nextPairState.pairId);
  dailyPairHistoryFromDb = await loadDailyPairHistory(nextPairState.pairId);
  dailyPairStreakFromDb = calculateDailyPairStreak(dailyPairHistoryFromDb);
}

const referralStats = await loadReferralStats(user.id);

setAppState((prev) => ({
  ...prev,
  pair: nextPairState,
  points: nextPairState.totalPoints || 0,
  pairPollAnswers: pairPollAnswersFromDb,
  dailyPairHistory: dailyPairHistoryFromDb,
  dailyPairStreak: dailyPairStreakFromDb,
  referrals: referralStats,
}));
}


async function joinPairByInviteCode(
  telegramId: number,
  inviteCode: string
): Promise<PairState | null> {
  const normalizedCode = inviteCode.trim().toUpperCase();
  const currentTelegramId = Number(telegramId);

  const { data: profile } = await supabase
    .from("profiles")
    .select("pair_id")
    .eq("telegram_id", currentTelegramId)
    .maybeSingle();

  if (profile?.pair_id) {
    return loadPairStateForUser(currentTelegramId);
  }

  const { data: pair, error: pairError } = await supabase
    .from("pairs")
    .select("*")
    .eq("invite_code", normalizedCode)
    .maybeSingle();

  if (pairError || !pair) {
    console.error("joinPairByInviteCode: pair not found", pairError);
    return null;
  }

  const createdById =
    pair.created_by_telegram_id != null ? Number(pair.created_by_telegram_id) : null;
  const partner1Id =
    pair.partner_1_telegram_id != null ? Number(pair.partner_1_telegram_id) : null;
  const partner2Id =
    pair.partner_2_telegram_id != null ? Number(pair.partner_2_telegram_id) : null;

  if (
    createdById === currentTelegramId ||
    partner1Id === currentTelegramId ||
    partner2Id === currentTelegramId
  ) {
    alert("Нельзя подключить самого себя по своему приглашению");
    return null;
  }

  if (partner2Id) {
    alert("Эта пара уже подключена");
    return null;
  }

  const { error: updatePairError } = await supabase
    .from("pairs")
    .update({ partner_2_telegram_id: currentTelegramId })
    .eq("id", pair.id)
    .is("partner_2_telegram_id", null);

  if (updatePairError) {
    console.error("joinPairByInviteCode update pair error:", updatePairError);
    return null;
  }

  const { error: updateProfileError } = await supabase
    .from("profiles")
    .update({ pair_id: pair.id })
    .eq("telegram_id", currentTelegramId);

  if (updateProfileError) {
    console.error("joinPairByInviteCode update profile error:", updateProfileError);
    return null;
  }

  return loadPairStateForUser(currentTelegramId);
}

async function claimReferralReward(params: {
  referrerTelegramId: number;
  invitedTelegramId: number;
}) {
  const { referrerTelegramId, invitedTelegramId } = params;

  if (referrerTelegramId === invitedTelegramId) {
    return { ok: false, reason: "self-referral" as const };
  }

  const { data: existing } = await supabase
    .from("referrals")
    .select("id")
    .eq("invited_telegram_id", invitedTelegramId)
    .maybeSingle();

  if (existing) {
    return { ok: false, reason: "already-claimed" as const };
  }

  const { error } = await supabase.from("referrals").insert({
    referrer_telegram_id: referrerTelegramId,
    invited_telegram_id: invitedTelegramId,
    reward_points: 200,
  });

  if (error) {
    console.error("referral insert error", error);
    return { ok: false, reason: "insert-failed" as const };
  }

  return { ok: true };
}


async function loadReferralStats(telegramId: number) {
  const { data, error } = await supabase
    .from("referrals")
    .select("invited_telegram_id,reward_points")
    .eq("referrer_telegram_id", telegramId);

  if (error || !data) {
    console.error("loadReferralStats error", error);
    return {
      invitedUsers: [],
      totalReward: 0,
    };
  }

  return {
    invitedUsers: data.map((r) => String(r.invited_telegram_id)),
    totalReward: data.reduce((sum, r) => sum + (r.reward_points ?? 0), 0),
  };
}

function getTelegramUserSafe(fallbackUser: TgUser | null): TgUser | null {
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;

  if (tgUser?.id) {
    return {
      id: tgUser.id,
      first_name: tgUser.first_name,
      last_name: tgUser.last_name,
      username: tgUser.username,
      photo_url: tgUser.photo_url,
    };
  }

  if (fallbackUser?.id) {
    return fallbackUser;
  }

  return null;
}



export default function Page() {

  const [appState, setAppState] = useState<AppState>(DEFAULT_STATE);
  const [selectedLang, setSelectedLang] = useState<"ru" | "en" | null>(null);

const market = selectedLang;
const t = market === "en" ? TEXT_EN : TEXT_RU;
const REWARD_CATEGORIES =
  market === "en" ? REWARD_CATEGORIES_EN : REWARD_CATEGORIES_RU;

    useEffect(() => {
  if (typeof window === "undefined") return;

  const saved = window.localStorage.getItem("couple-quizzes-lang");
  if (saved === "ru" || saved === "en") {
    setSelectedLang(saved);
  }
}, []);

  

 

  const FREE_POLLS_LIMIT = 3;
  const FREE_TESTS_LIMIT = 1;
  const FREE_GAME_STEPS_LIMIT = 3;

  const freeAccessExhausted =
    (appState.completedPollIds?.length ?? 0) >= FREE_POLLS_LIMIT &&
    (appState.completedTestIds?.length ?? 0) >= FREE_TESTS_LIMIT &&
    (appState.playedGameRewardKeys?.length ?? 0) >= FREE_GAME_STEPS_LIMIT;





  function getLiveTelegramUser(): TgUser | null {
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (!tgUser?.id) return null;


  

  return {
    id: tgUser.id,
    first_name: tgUser.first_name,
    last_name: tgUser.last_name,
    username: tgUser.username,
    photo_url: tgUser.photo_url,
  };
}

const [premiumLoading, setPremiumLoading] = useState(false);

const handleBuyPremium = async () => {
  try {
    setPremiumLoading(true);

    const res = await fetch("/api/payments/create-stars-invoice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        telegramId: user?.id,
        plan: "premium_month",
      }),
    });

    const data = await res.json();
    console.log("BUY PREMIUM RESPONSE:", data);

    if (!res.ok) {
      throw new Error(data?.error || "Не удалось создать оплату");
    }

    const invoiceLink = data?.invoiceLink;
    if (!invoiceLink) {
      throw new Error("Ссылка на оплату не получена");
    }

    if (window.Telegram?.WebApp?.openInvoice) {
      window.Telegram.WebApp.openInvoice(invoiceLink, async (status) => {
  console.log("INVOICE STATUS:", status);

  if (status !== "paid" || !user?.id) return;

  const hasPremium = await loadPremiumStatus(user.id);

  setAppState((prev) => ({
    ...prev,
    isPremium: hasPremium,
  }));

  if (hasPremium) {
    setShowPaymentChoice(false);
    if (screen === "paywall") {
      setScreen(paywallBackScreen || "menu");
    }
  }
});
    } else {
      throw new Error("Telegram WebApp openInvoice недоступен");
    }
  } catch (error) {
    console.error("BUY PREMIUM ERROR:", error);
    alert(error instanceof Error ? error.message : "Не удалось открыть оплату");
  } finally {
    setPremiumLoading(false);
  }
};

const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true);
}, []);


const handleSelectGender = (gender: "boy" | "girl") => {
  setAppState((prev) => ({
    ...prev,
    profile: {
      ...prev.profile,
      gender,
    },
  }));

  setScreen("menu");
};





function animatePairPoints(from: number, to: number) {
  const duration = 900;
  const start = performance.now();

  function frame(now: number) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(from + (to - from) * eased);

    setAnimatedPairPoints(value);

    if (progress < 1) {
      requestAnimationFrame(frame);
    }
  }

  requestAnimationFrame(frame);
}

const completionOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  background:
    "radial-gradient(circle at top, rgba(255,255,255,0.18), rgba(107,70,255,0.96) 35%, rgba(31,29,58,0.98) 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};

const completionCardStyle: CSSProperties = {
  width: "100%",
  maxWidth: 420,
  borderRadius: 28,
  padding: "28px 22px",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(245,240,255,0.98) 100%)",
  boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
  textAlign: "center",
  position: "relative",
  overflow: "hidden",
};

const completionGlowStyle: CSSProperties = {
  position: "absolute",
  top: -80,
  left: "50%",
  transform: "translateX(-50%)",
  width: 220,
  height: 220,
  borderRadius: "50%",
  background: "rgba(255, 215, 120, 0.35)",
  filter: "blur(30px)",
  pointerEvents: "none",
};

const completionEmojiStyle: CSSProperties = {
  fontSize: 64,
  lineHeight: 1,
  marginBottom: 12,
};

const completionTitleStyle: CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
  color: "#241b4b",
  lineHeight: 1.15,
};

const completionSubtitleStyle: CSSProperties = {
  marginTop: 10,
  fontSize: 15,
  lineHeight: 1.45,
  color: "#5b5675",
};

const completionPointsStyle: CSSProperties = {
  marginTop: 22,
  fontSize: 42,
  fontWeight: 900,
  color: "#6b46ff",
  lineHeight: 1,
};

const completionPointsLabelStyle: CSSProperties = {
  marginTop: 8,
  fontSize: 14,
  fontWeight: 700,
  color: "#7b7698",
  textTransform: "uppercase",
  letterSpacing: 0.8,
};

const completionBadgeRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  justifyContent: "center",
  flexWrap: "wrap",
  marginTop: 18,
};

const completionBadgeStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 999,
  background: "rgba(107,70,255,0.10)",
  color: "#5a35eb",
  fontWeight: 800,
  fontSize: 13,
};

const completionButtonStyle: CSSProperties = {
  marginTop: 24,
  width: "100%",
  border: "none",
  borderRadius: 18,
  padding: "16px 18px",
  fontSize: 16,
  fontWeight: 900,
  color: "#fff",
  background: "linear-gradient(135deg, #7c4dff 0%, #ff5db1 100%)",
  boxShadow: "0 14px 30px rgba(124,77,255,0.35)",
  cursor: "pointer",
};

const syncPairAfterPointsChange = async (
  fallbackPairState?: PairState
): Promise<PairState> => {
  let nextPairState = fallbackPairState ?? appState.pair;

  if (user?.id) {
    nextPairState = await loadPairStateForUser(user.id);
  }

  const nextState: AppState = {
    ...appState,
    pair: nextPairState,
    points: nextPairState.totalPoints || 0,
  };

  await syncWeeklyPairLeaderboard(nextState, user);

  const freshLeaderboard = await loadWeeklyPairLeaderboard(getCurrentWeekKey());
  setWeeklyPairLeaderboard(freshLeaderboard);

  const previousRows = await loadWeeklyPairLeaderboard(getPreviousWeekKey());
  setPreviousWeeklyPairLeaderboard(previousRows);

  return nextPairState;
};





const [previousWeeklyPairLeaderboard, setPreviousWeeklyPairLeaderboard] = useState<WeeklyPairLeaderboardRow[]>([]);



const claimCompletionBonus = async (
  type: "polls" | "tests" | "games"
) => {
  if (appState.completionBonusesClaimed[type]) {
    return false;
  }

let nextPairState = appState.pair;

if (appState.pair.pairId) {
  await updatePairPoints({
    pairId: appState.pair.pairId,
    delta: 200,
  });

  nextPairState = await syncPairAfterPointsChange(appState.pair);
}   

const freshLeaderboard = await loadWeeklyPairLeaderboard(getCurrentWeekKey());
setWeeklyPairLeaderboard(freshLeaderboard);

const freshPreviousLeaderboard = await loadWeeklyPairLeaderboard(getPreviousWeekKey());
setPreviousWeeklyPairLeaderboard(freshPreviousLeaderboard);

  const bonusData =
    type === "polls"
      ? { title: "Пройдены все опросы", emoji: "🗳️" }
      : type === "tests"
      ? { title: "Пройдены все тесты", emoji: "🧠" }
      : { title: "Пройден весь игровой раздел", emoji: "🎮" };

  setAppState((prev) => ({
    ...prev,
    pair: nextPairState,
    points: nextPairState.totalPoints || prev.points + 200,
    completionBonusesClaimed: {
      ...prev.completionBonusesClaimed,
      [type]: true,
    },
  }));

setCompletionBonusData({
  title: bonusData.title,
  points: 200,
  section: type,
  emoji: bonusData.emoji,
});
setShowCompletionBonus(true);

  return true;
};

const claimGameStepReward = async (rewardKey: string) => {
  if (appState.playedGameRewardKeys.includes(rewardKey)) {
    return false;
  }

  let nextPairState = appState.pair;

if (appState.pair.pairId) {
  await updatePairPoints({
    pairId: appState.pair.pairId,
    delta: 10,
  });

  nextPairState = await syncPairAfterPointsChange(appState.pair);
}


  setAppState((prev) => ({
    ...prev,
    pair: nextPairState,
    points: nextPairState.totalPoints || prev.points + 10,
    playedGameRewardKeys: [...prev.playedGameRewardKeys, rewardKey],
  }));

  return true;
};

const handleCompleteGame = async (game: Game, score: number) => {
  const alreadyCompleted = appState.completedGameIds.includes(game.id);
  const rewardToAdd = alreadyCompleted ? 0 : game.reward;

  let nextPairState = appState.pair;
  let leveledUpTo: { level: number; title: string } | null = null;

  if (rewardToAdd > 0 && appState.pair.pairId) {
    await updatePairPoints({
      pairId: appState.pair.pairId,
      delta: rewardToAdd,
    });

    if (user?.id) {
      nextPairState = await loadPairStateForUser(user.id);
    }
  }


  const previousPoints = appState.pair.totalPoints || 0;
const nextPoints = nextPairState.totalPoints || 0;

if (nextPoints > previousPoints) {
  setAnimatedPairPoints(previousPoints);
  animatePairPoints(previousPoints, nextPoints);
}

  setAppState((prev) => {
    const oldLevel = getPairLevelInfo(prev.pair.totalPoints || 0);
    const newLevel = getPairLevelInfo(nextPairState.totalPoints || 0);

    if (newLevel.level > oldLevel.level) {
      leveledUpTo = {
        level: newLevel.level,
        title: newLevel.title,
      };
    }

    return {
      ...prev,
      pair: nextPairState,
      points: nextPairState.totalPoints || 0,
      stats: {
        ...prev.stats,
        gamesPlayed: prev.stats.gamesPlayed + 1,
      },
      completedGameIds: alreadyCompleted
        ? prev.completedGameIds
        : [...prev.completedGameIds, game.id],
    };
  });

  if (leveledUpTo) {
    setLevelUpData(leveledUpTo);
    setShowLevelUp(true);
  }

  await refreshPairData({
    user,
    setAppState,
  });



  if (
  game.id !== "90-questions" &&
  game.id !== "bottle" &&
  game.id !== "never-have-i-ever"
) {
  setScreen("menu");
}
};


const handleClaimWeeklyTopReward = async () => {
  const previousWeekKey = getPreviousWeekKey();

  if (!appState.pair.pairId) return;
  if (appState.weeklyTopRewardClaimedWeek === previousWeekKey) return;

  const previousRows = await loadWeeklyPairLeaderboard(previousWeekKey);
  const previousWeekPairRow = previousRows.find(
    (row) => row.pair_id === appState.pair.pairId
  );

  const isEligible =
    previousWeekPairRow?.pair_id === appState.pair.pairId &&
    [1, 2, 3].includes(
      previousRows.findIndex((row) => row.pair_id === appState.pair.pairId) + 1
    );

  if (!isEligible) return;

  await updatePairPoints({
    pairId: appState.pair.pairId,
    delta: 500,
  });

  let refreshedPair = appState.pair;
  if (user?.id) {
    refreshedPair = await loadPairStateForUser(user.id);
  }

  const previousPoints = appState.pair.totalPoints || 0;
  const nextPoints = refreshedPair.totalPoints || 0;

  if (nextPoints > previousPoints) {
    setAnimatedPairPoints(previousPoints);
    animatePairPoints(previousPoints, nextPoints);
  }

  const nextState = {
    ...appState,
    pair: refreshedPair,
    points: refreshedPair.totalPoints || 0,
    weeklyTopRewardClaimedWeek: previousWeekKey,
  };

  setAppState(nextState);
  await syncWeeklyPairLeaderboard(nextState, user);

  const freshCurrent = await loadWeeklyPairLeaderboard(getCurrentWeekKey());
  setWeeklyPairLeaderboard(freshCurrent);

  const freshPrevious = await loadWeeklyPairLeaderboard(getPreviousWeekKey());
  setPreviousWeeklyPairLeaderboard(freshPrevious);

  await refreshPairData({
    user,
    setAppState,
  });
};




const syncWeeklyPairLeaderboard = async (nextState: AppState, currentUser?: TgUser | null) => {
  const pairId = nextState.pair.pairId;
  if (!pairId) return;

  const weekKey = getCurrentWeekKey();
  const pairTitle = getPairDisplayTitle(currentUser ?? user, nextState.pair);

  await upsertWeeklyPairLeaderboardEntry({
    weekKey,
    pairId,
    pairTitle,
    totalPoints: nextState.points,
  });

  const rows = await loadWeeklyPairLeaderboard(weekKey);
  setWeeklyPairLeaderboard(rows);
};



const handleJoinByCode = async (inviteCode: string) => {
  const actualUser = getTelegramUserSafe(user);

  if (!actualUser?.id) {
    alert("Не удалось получить пользователя Telegram");
    return;
  }

  setUser(actualUser);
  await upsertTelegramProfile(actualUser);

  const joinedPair = await joinPairByInviteCode(actualUser.id, inviteCode.trim().toUpperCase());

  if (!joinedPair) {
    alert("Не удалось подключиться. Проверь код приглашения.");
    return;
  }

 const nextStateAfterJoin = {
  ...appState,
  pair: joinedPair,
  points: joinedPair.totalPoints || 0,
};

  setAppState(nextStateAfterJoin);

await refreshPairData({
  user: actualUser,
  setAppState,
});


alert("Пара успешно подключена 💕");
setScreen("pair");
};



const handleCreateInvite = async () => {
  const actualUser = getTelegramUserSafe(user);

  if (!actualUser?.id) {
    alert("Не удалось получить пользователя Telegram");
    return;
  }

  setUser(actualUser);
  await upsertTelegramProfile(actualUser);

  if (appState.pair?.inviteCode) {
    return;
  }

  if (appState.pair?.pairId && !appState.pair?.partner) {
    return;
  }

  console.log("CREATE INVITE state user:", user);
console.log("CREATE INVITE tg user:", window.Telegram?.WebApp?.initDataUnsafe?.user);

  const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();

  const { data: createdPair, error: createPairError } = await supabase
  .from("pairs")
  .insert({
    invite_code: inviteCode,
    created_by_telegram_id: actualUser.id,
    partner_1_telegram_id: actualUser.id,
    partner_2_telegram_id: null,
  })
  .select()
  .single();

console.log("CREATE PAIR RESULT:", createdPair);
console.log("CREATE PAIR ERROR:", createPairError);

  if (createPairError || !createdPair) {
  console.error("create pair error:", createPairError);
  alert(
    `Не удалось создать приглашение: ${
      createPairError?.message || "unknown error"
    }`
  );
  return;
}

  const { error: updateProfileError } = await supabase
    .from("profiles")
    .update({ pair_id: createdPair.id })
    .eq("telegram_id", actualUser.id);

  if (updateProfileError) {
    console.error("update profile with pair_id error:", updateProfileError);
    alert("Пара создана, но не удалось привязать её к профилю");
    return;
  }

  const nextPairState = await loadPairStateForUser(actualUser.id);

 setAppState((prev) => ({
  ...prev,
  pair: nextPairState,
  points: nextPairState.totalPoints || 0,
}));

await refreshPairData({
  user: actualUser,
  setAppState,
});
};



const [weeklyPairLeaderboard, setWeeklyPairLeaderboard] = useState<WeeklyPairLeaderboardRow[]>([]);

const [showPaymentChoice, setShowPaymentChoice] = useState(false);

const TRIBUTE_LINK = "https://t.me/tribute/app?startapp=sMuC";
  
  const [screen, setScreen] = useState<Screen>("welcome");
  const [paywallBackScreen, setPaywallBackScreen] = useState<Screen>("menu");
  const [user, setUser] = useState<TgUser | null>(null);
  const [showDailyBonus, setShowDailyBonus] = useState(true);
  const [claimableDay, setClaimableDay] = useState(1);
  const [bonusClaimAvailable, setBonusClaimAvailable] = useState(true);
  const [showLevelUp, setShowLevelUp] = useState(false);
   const [animatedPairPoints, setAnimatedPairPoints] = useState(0);
  useEffect(() => {
  if (!mounted) return;
  setAnimatedPairPoints(appState.pair.totalPoints || 0);
}, [mounted]);

  useEffect(() => {
  if (showLevelUp) {
    launchLevelConfetti();
  }
}, [showLevelUp]);

const [showCompletionBonus, setShowCompletionBonus] = useState(false);
const [completionBonusData, setCompletionBonusData] = useState<{
  title: string;
  points: number;
  section: string;
  emoji?: string;
} | null>(null);

useEffect(() => {
  if (showCompletionBonus) {
    launchLevelConfetti();
  }
}, [showCompletionBonus]);






useEffect(() => {
  if (!mounted) return;

  const today = getTodayLocalDateString();

  const alreadyOpenedToday =
    appState.lastDailyBonusPopupDate === today;

  const bonusNotClaimedToday =
    appState.dailyBonus.lastClaimDate !== today;

  if (!alreadyOpenedToday && bonusNotClaimedToday) {
    setShowDailyBonus(true);

    setAppState((prev) => ({
      ...prev,
      lastDailyBonusPopupDate: today,
    }));
  }
}, [mounted, appState.dailyBonus.lastClaimDate]);

const [levelUpData, setLevelUpData] = useState<{ level: number; title: string } | null>(null);



useEffect(() => {
  const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
  if (!startParam) return;

  if (startParam.startsWith("ref_")) {
    const referrerId = startParam.replace("ref_", "");

    setAppState((prev) => {
      if (prev.referrals.invitedUsers.includes(referrerId)) return prev;

      return {
        ...prev,
        points: prev.points + 200,
        referrals: {
          invitedUsers: [...prev.referrals.invitedUsers, referrerId],
          totalReward: prev.referrals.totalReward + 200,
        },
      };
    });
  }
}, []);



  useEffect(() => {
  async function test() {
    const { data, error } = await supabase
      .from("profiles")
      .select("*");

    console.log("SUPABASE TEST:", data, error);
  }

  test();
}, []);

 useEffect(() => {
  async function bootstrap() {
    setMounted(true);


    const tg = window.Telegram?.WebApp;
    console.log("WINDOW TELEGRAM:", window.Telegram);
console.log("WEBAPP:", window.Telegram?.WebApp);
console.log("INIT DATA UNSAFE:", window.Telegram?.WebApp?.initDataUnsafe);
console.log("TG USER:", window.Telegram?.WebApp?.initDataUnsafe?.user);
    tg?.ready?.();
    tg?.expand?.();

 let telegramUser = tg?.initDataUnsafe?.user;
let startParam = tg?.initDataUnsafe?.start_param;

const saved = loadState();
setAppState(saved);

const alreadyClaimed = hasClaimedToday(saved.dailyBonus.lastClaimDate);
const nextDay = getNextStreakDay(
  saved.dailyBonus.lastClaimDate,
  saved.dailyBonus.streakDay
);



const today = getTodayLocalDateString();
const alreadyOpenedToday = saved.lastDailyBonusPopupDate === today;

setClaimableDay(nextDay);
setBonusClaimAvailable(!alreadyClaimed);
setShowDailyBonus(!alreadyClaimed && !alreadyOpenedToday);

if (!telegramUser?.id) {
  await new Promise((resolve) => setTimeout(resolve, 600));
  telegramUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
}

if (!telegramUser?.id) {
  console.log("Telegram user still not available");
  return;
}

const telegramId = telegramUser.id;

if (!telegramId) {
  console.log("Telegram user id is missing");
  return;
}

const hasPremium = await loadPremiumStatus(telegramId);

setAppState((prev) => ({
  ...prev,
  isPremium: hasPremium,
}));



   const currentUser: TgUser = {
  id: telegramUser.id,
  first_name: telegramUser.first_name,
  last_name: telegramUser.last_name,
  username: telegramUser.username,
  photo_url: telegramUser.photo_url,
};

setUser(currentUser);

await upsertTelegramProfile(currentUser);

if (startParam?.startsWith("ref_")) {
  const referrerTelegramId = Number(startParam.replace("ref_", ""));

  if (Number.isFinite(referrerTelegramId)) {
    await claimReferralReward({
      referrerTelegramId,
      invitedTelegramId: currentUser.id!,
    });
  }
}



const referralStats = await loadReferralStats(currentUser.id!);

let nextPairState = await loadPairStateForUser(currentUser.id!);

if (!nextPairState.pairId && startParam?.startsWith("invite_")) {
  const inviteCode = startParam.replace("invite_", "");

  console.log("TRY JOIN WITH CODE:", inviteCode);

  const joinedPair = await joinPairByInviteCode(
    currentUser.id!,
    inviteCode
  );

  if (joinedPair) {
    nextPairState = joinedPair;
  }
}

console.log("PAIR STATE AFTER BOOTSTRAP:", nextPairState);

let pairPollAnswersFromDb: Record<string, number[]> = {};

if (nextPairState.pairId) {
  pairPollAnswersFromDb = await loadPairPollAnswers(nextPairState.pairId);
}

setAppState((prev) => ({
  ...prev,
  pair: nextPairState,
  points: nextPairState.totalPoints || 0,
  referrals: referralStats,
  pairPollAnswers: pairPollAnswersFromDb,
}));




    const weekKey = getCurrentWeekKey();
const leaderboardRows = await loadWeeklyPairLeaderboard(weekKey);
setWeeklyPairLeaderboard(leaderboardRows);


  }

  bootstrap();
}, []);



useEffect(() => {
  const screensToRefresh: Screen[] = ["menu", "pair", "profile", "rewards", "top"];

  if (!user?.id) return;
  if (!screensToRefresh.includes(screen)) return;

  refreshPairData({
    user,
    setAppState,
  });
}, [screen, user]);



  useEffect(() => {
    if (!mounted) return;
    saveState(appState);
  }, [appState, mounted]);

  const totalActivities = useMemo(() => {
    return (
      appState.stats.pollsCompleted +
      appState.stats.gamesPlayed +
      appState.stats.testsCompleted
    );
  }, [appState.stats]);




  const handleClaimBonus = () => {
    const reward = getRewardForDay(claimableDay);
    const today = getTodayLocalDateString();

    setAppState((prev) => ({
      ...prev,
      points: prev.points + reward,
      dailyBonus: {
        streakDay: claimableDay,
        lastClaimDate: today,
        totalPointsEarnedFromBonus:
          prev.dailyBonus.totalPointsEarnedFromBonus + reward,
      },
    }));

    setBonusClaimAvailable(false);
    setShowDailyBonus(false);
  };

 const handleCompletePoll = async (poll: Poll, answers: number[]) => {
  const alreadyCompleted = appState.completedPollIds.includes(poll.id);
  const rewardToAdd = alreadyCompleted ? 0 : poll.reward;

  let nextPairState = appState.pair;
  let leveledUpTo: { level: number; title: string } | null = null;

  let pairPollAnswersFromDb = appState.pairPollAnswers;

if (appState.pair.pairId && user?.id) {
  await savePollSubmission({
    pairId: appState.pair.pairId,
    telegramId: user.id,
    pollId: poll.id,
    answers,
  });

  pairPollAnswersFromDb = await loadPairPollAnswers(appState.pair.pairId);
}

if (rewardToAdd > 0 && appState.pair.pairId) {
  await updatePairPoints({
    pairId: appState.pair.pairId,
    delta: rewardToAdd,
  });

  nextPairState = await syncPairAfterPointsChange(appState.pair);
}

const previousPoints = appState.pair.totalPoints || 0;
const nextPoints = nextPairState.totalPoints || 0;

if (nextPoints > previousPoints) {
  setAnimatedPairPoints(previousPoints);
  animatePairPoints(previousPoints, nextPoints);
}

  setAppState((prev) => {
    const oldLevel = getPairLevelInfo(prev.pair.totalPoints || 0);
    const newLevel = getPairLevelInfo(nextPairState.totalPoints || 0);

    if (newLevel.level > oldLevel.level) {
      leveledUpTo = {
        level: newLevel.level,
        title: newLevel.title,
      };
    }

    return {
  ...prev,
  pair: nextPairState,
  points: nextPairState.totalPoints || 0,
  pairPollAnswers: pairPollAnswersFromDb,
  stats: {
    ...prev.stats,
    pollsCompleted: prev.stats.pollsCompleted + 1,
  },
  completedPollIds: alreadyCompleted
    ? prev.completedPollIds
    : [...prev.completedPollIds, poll.id],
  pollAnswers: {
    ...prev.pollAnswers,
    [poll.id]: answers,
  },
};
  });

  if (leveledUpTo) {
    setLevelUpData(leveledUpTo);
    setShowLevelUp(true);
  }

  await refreshPairData({
  user,
  setAppState,
});

const allPollIds = POLLS.map((item) => item.id);
const nextCompletedPollIds = alreadyCompleted
  ? appState.completedPollIds
  : [...appState.completedPollIds, poll.id];

const finishedAllPolls = allPollIds.every((id) =>
  nextCompletedPollIds.includes(id)
);

if (finishedAllPolls && !appState.completionBonusesClaimed.polls) {
  await claimCompletionBonus("polls");
}

 
};



   const handleCompleteTest = async (test: TestDefinition) => {
  const alreadyCompleted = appState.completedTestIds.includes(test.id);
  const rewardToAdd = alreadyCompleted ? 0 : test.reward;

let nextPairState = appState.pair;
let leveledUpTo: { level: number; title: string } | null = null;

if (rewardToAdd > 0 && appState.pair.pairId) {
  await updatePairPoints({
    pairId: appState.pair.pairId,
    delta: rewardToAdd,
  });

  nextPairState = await syncPairAfterPointsChange(appState.pair);
}

const previousPoints = appState.pair.totalPoints || 0;
const nextPoints = nextPairState.totalPoints || 0;

if (nextPoints > previousPoints) {
  setAnimatedPairPoints(previousPoints);
  animatePairPoints(previousPoints, nextPoints);
}

  setAppState((prev) => {
    const oldLevel = getPairLevelInfo(prev.pair.totalPoints || 0);
    const newLevel = getPairLevelInfo(nextPairState.totalPoints || 0);

    if (newLevel.level > oldLevel.level) {
      leveledUpTo = {
        level: newLevel.level,
        title: newLevel.title,
      };
    }

    return {
      ...prev,
      pair: nextPairState,
      points: nextPairState.totalPoints || 0,
      stats: {
        ...prev.stats,
        testsCompleted: prev.stats.testsCompleted + 1,
      },
      completedTestIds: alreadyCompleted
        ? prev.completedTestIds
        : [...prev.completedTestIds, test.id],
    };
  });

  if (leveledUpTo) {
    setLevelUpData(leveledUpTo);
    setShowLevelUp(true);
  }

  await refreshPairData({
  user,
  setAppState,
});

const allTestIds = TESTS.map((item) => item.id);
const nextCompletedTestIds = alreadyCompleted
  ? appState.completedTestIds
  : [...appState.completedTestIds, test.id];

const finishedAllTests = allTestIds.every((id) =>
  nextCompletedTestIds.includes(id)
);

if (finishedAllTests && !appState.completionBonusesClaimed.tests) {
  await claimCompletionBonus("tests");
}

  setScreen("menu");
};


 const handleSpinReward = async (categoryIndex: number) => {
  let result: WonReward | null = null;

  if (!appState.pair.pairId) {
    alert("Сначала нужно создать пару");
    return null;
  }

  if ((appState.pair.totalPoints || 0) < WHEEL_SPIN_COST) {
    return null;
  }

  await updatePairPoints({
    pairId: appState.pair.pairId,
    delta: -WHEEL_SPIN_COST,
  });

  let refreshedPair = appState.pair;
  if (user?.id) {
    refreshedPair = await loadPairStateForUser(user.id);
  }

  const category = REWARD_CATEGORIES[categoryIndex];
  const itemIndex = pickWeightedIndex(
    category.items.map((item) => item.weight ?? 1),
  );
  const item = category.items[itemIndex];

  result = {
    id: item.id,
    title: item.title,
    categoryId: category.id,
    categoryTitle: category.title,
    wonAt: getCurrentDateTimeLabel(),
  };

  setAppState((prev) => ({
    ...prev,
    pair: refreshedPair,
    points: refreshedPair.totalPoints || 0,
    stats: {
      ...prev.stats,
      rewardsRedeemed: prev.stats.rewardsRedeemed + 1,
    },
    wonRewards: result ? [...prev.wonRewards, result] : prev.wonRewards,
  }));

  await refreshPairData({
  user,
  setAppState,
});

  return result;
};

  if (!mounted) return null;

  return (
    <main
  style={{
    minHeight: "100vh",
   background: appState.isPremium
  ? "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)"
  : "radial-gradient(circle, rgba(238,174,202,1) 0%, rgba(148,187,233,1) 100%)",
    paddingBottom: 24,
  }}
>


<style>{`
  @keyframes matchPop {
  0% {
    transform: scale(0.9);
    opacity: 0;
  }
  60% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
`}</style>

<style jsx global>{`
  @keyframes rewardFloatUp {
    0% {
      opacity: 0;
      transform: translateX(-50%) translateY(18px) scale(0.9);
    }
    20% {
      opacity: 1;
      transform: translateX(-50%) translateY(0) scale(1);
    }
    100% {
      opacity: 0;
      transform: translateX(-50%) translateY(-60px) scale(1.05);
    }
  }
`}</style>

    
      <div style={{ width: "100%", maxWidth: 520, margin: "0 auto" }}>

        {showLevelUp && levelUpData && (
  <PairLevelUpModal
    level={levelUpData.level}
    title={levelUpData.title}
    onClose={() => {
      setShowLevelUp(false);
      setLevelUpData(null);
    }}
  />
)}

{showCompletionBonus && completionBonusData && (
  <CompletionBonusModal
    title={completionBonusData?.title}
    points={completionBonusData.points}
    emoji={completionBonusData.emoji ?? "🎉"}
    onClose={() => {
      setShowCompletionBonus(false);
      setCompletionBonusData(null);
    }}
  />
)}

        {showDailyBonus && (
          <DailyBonusModal
            currentDay={claimableDay}
            canClaim={bonusClaimAvailable}
            onClaim={handleClaimBonus}
            onClose={() => setShowDailyBonus(false)}
          />
        )}

        {screen === "welcome" && (
  <WelcomeScreen
   onStart={() =>
  setScreen(
    appState.profile.gender
      ? "menu"
      : selectedLang
      ? "gender-select"
      : "language-select"
  )
}
  />
)}

{screen === "language-select" && (
  <div style={{ padding: 16, display: "grid", gap: 14 }}>
    <div style={{ ...cardBaseStyle(), padding: 18, textAlign: "center" }}>
      <div style={{ fontSize: 28, fontWeight: 900 }}>
        Choose language
      </div>
    </div>

    <button
      onClick={() => {
        setSelectedLang("ru");
        localStorage.setItem("couple-quizzes-lang", "ru");
        setScreen("gender-select");
      }}
      style={{ ...primaryButtonStyle }}
    >
      🇷🇺 Русский
    </button>

    <button
      onClick={() => {
        setSelectedLang("en");
        localStorage.setItem("couple-quizzes-lang", "en");
        setScreen("gender-select");
      }}
      style={{ ...primaryButtonStyle }}
    >
      🇬🇧 English
    </button>

    <button
      onClick={() => setScreen("gender-select")}
      style={{ ...primaryButtonStyle }}
    >
      Continue
    </button>
  </div>
)}

{screen === "gender-select" && (
  <GenderSelectScreen
    onSelect={(gender) => {
      setAppState((prev) => ({
        ...prev,
        profile: {
          ...prev.profile,
          gender,
        },
      }));
      setScreen("menu");
    }}
  />
)}

{screen === "menu" && (
  <MainMenu
    points={appState.points}
    t={t}
    user={user}
    pairLevel={getPairLevelInfo(animatedPairPoints)}
    appState={appState}
   onNavigate={(next) => {
  const wantsContent =
    next === "polls" ||
    next === "polls-boy" ||
    next === "polls-girl" ||
    next === "tests" ||
    next === "games";

  if (!appState.isPremium && freeAccessExhausted && wantsContent) {
    setPaywallBackScreen(next);
    setScreen("paywall");
    return;
  }

  setScreen(next);
}}
  />
)}



      

{screen === "polls-boy" && (
  <PollsScreen
    genderFilter="boy"
    completedPollIds={appState.completedPollIds}
     onBack={() => setScreen("menu")}
    onCompletePoll={handleCompletePoll}
  />
)}

{screen === "polls-girl" && (
  <PollsScreen
    genderFilter="girl"
    completedPollIds={appState.completedPollIds}
     onBack={() => setScreen("menu")}
    onCompletePoll={handleCompletePoll}
  />
)}

     {screen === "games" && (
 <GamesScreen
  completedGameIds={appState.completedGameIds}
  playedGameRewardKeys={appState.playedGameRewardKeys}
  appState={appState}
  setAppState={setAppState}
  onBack={() => setScreen("menu")}
 onCompleteGame={handleCompleteGame}
  onClaimStepReward={claimGameStepReward}
/>
)}

              {screen === "tests" && (
          <TestsScreen
            completedTestIds={appState.completedTestIds}
            onBack={() => setScreen("menu")}
            onCompleteTest={handleCompleteTest}
          />
        )}

        {screen === "rewards" && (
          <RewardsScreen
            points={appState.points}
            wonRewards={appState.wonRewards}
            onBack={() => setScreen("menu")}
            onSpin={handleSpinReward}
          />
        )}

   {screen === "top" && (
  <TopPlayersScreen
  t={t}
    pair={appState.pair}
    leaderboard={weeklyPairLeaderboard}
    weeklyTopRewardClaimedWeek={appState.weeklyTopRewardClaimedWeek}
    previousLeaderboard={previousWeeklyPairLeaderboard}
    onBack={() => setScreen("menu")}
    onClaimWeeklyReward={handleClaimWeeklyTopReward}
  />
)}


        {screen === "profile" && (
      <ProfileAndStatsScreen
  user={user}
  points={appState.points}
  stats={appState.stats}
  bonusState={appState.dailyBonus}
  wonRewards={appState.wonRewards}
  pairPollAnswers={appState.pairPollAnswers}
  referrals={appState.referrals}
  isPremium={appState.isPremium}
  onNavigate={setScreen}
  onBack={() => setScreen("menu")}
/>

)}


{screen === "referrals" && (
  <ReferralsScreen
    user={user}
    appState={appState}

    onBack={() => setScreen("menu")}
  />
)}

{screen === "pair" && (
  <PairScreen
  t={t}
  user={user}
  pair={appState.pair}
  points={appState.points}
  pairLevel={getPairLevelInfo(animatedPairPoints)}
  pairPollAnswers={appState.pairPollAnswers}
  dailyPairStreak={appState.dailyPairStreak}
  onBack={() => setScreen("menu")}
  onOpenInvite={() => setScreen("pair-invite")}
  onOpenDailyQuestion={() => setScreen("daily-pair-question")}
  onOpenCompatibilityInfo={() => setScreen("pair-compatibility-info")}
  onOpenPolls={() => setScreen("polls")}
/>
)}

{screen === "pair-invite" && (
  <PairInviteScreen
    pair={appState.pair}
    onBack={() => setScreen("pair")}
    onCreateInvite={handleCreateInvite}
    onJoinByCode={handleJoinByCode}
  />
)}


{screen === "daily-pair-question" && (
  <DailyPairQuestionScreen
    user={user}
    pair={appState.pair}
    appState={appState}
    setAppState={setAppState}
    onBack={() => setScreen("pair")}
    onOpenStreakInfo={() => setScreen("pair-streak-info")}
  />
)}

{screen === "pair-streak-info" && (
  <PairStreakInfoScreen
    appState={appState}
    onBack={() => setScreen("daily-pair-question")}
  />
)}

{screen === "pair-compatibility-info" && (
  <PairCompatibilityInfoScreen
    appState={appState}
    onBack={() => setScreen("pair")}
  />
)}

{screen === "paywall" && (
  <div style={{ padding: 16 }}>
    <div style={{ ...cardBaseStyle(), padding: 20 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#1f1d3a" }}>
        Полный доступ
      </div>

      <div
        style={{
          marginTop: 10,
          color: "#3a345c",
          lineHeight: 1.5,
          fontSize: 15,
        }}
      >
        Вы прошли все бесплатные опросы. Откройте полный доступ к Couple Quizzes.
      </div>

      <div
        style={{
          marginTop: 16,
          padding: "14px 16px",
          borderRadius: 18,
          background: "rgba(255,255,255,0.24)",
          color: "#241b40",
          lineHeight: 1.7,
          fontWeight: 700,
        }}
      >
        🔓 Все опросы<br />
        🎮 Все игры<br />
        🧠 Все тесты<br />
        🎡 Рулетка призов<br />
        🎁 +500 очков<br />
        🎨 Специальный дизайн
      </div>

      <div
        style={{
          marginTop: 16,
          fontSize: 24,
          fontWeight: 900,
          color: "#6b46ff",
        }}
      >
        149 ₽
      </div>

      <button
  style={{ ...primaryButtonStyle, width: "100%", marginTop: 14 }}
  onClick={() => setShowPaymentChoice(true)}
>
  Получить полный доступ
</button>

      <button
  onClick={() => setScreen(paywallBackScreen)}
  style={{ ...secondaryButtonStyle, marginTop: 10 }}
>
  {t.common.back}
</button>
    </div>
  </div>
)}







        {!showDailyBonus && screen === "welcome" && totalActivities > 999999 && <div />}
      </div>

     {showCompletionBonus && completionBonusData && (
  <div style={completionOverlayStyle}>
    <div style={completionCardStyle}>
      <div style={completionGlowStyle} />

      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={completionEmojiStyle}>
          {completionBonusData?.emoji ?? "🎉"}
        </div>

        <div style={completionTitleStyle}>
          {completionBonusData?.title}
        </div>

        <div style={completionSubtitleStyle}>
          Ты полностью завершил
          {completionBonusData?.section === "polls"
            ? " опросы"
            : completionBonusData?.section === "tests"
            ? " тесты"
            : " раздел"}
          {" "}и получаешь бонус!
        </div>

        <div style={completionPointsStyle}>
          +{completionBonusData?.points ?? 0}
        </div>

        <div style={completionPointsLabelStyle}>
          очков пары
        </div>

        <button
          style={completionButtonStyle}
          onClick={() => {
            setShowCompletionBonus(false);
            setCompletionBonusData(null);
          }}
        >
          Забрать награду
        </button>
      </div>
    </div>
  </div>
)}

{showPaymentChoice && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 9999,
      background: "rgba(12, 10, 24, 0.72)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
    }}
  >
    <div
      style={{
        width: "100%",
        maxWidth: 420,
        borderRadius: 24,
        background: "#fff",
        padding: 22,
        boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
      }}
    >
      <div
        style={{
          fontSize: 26,
          fontWeight: 900,
          color: "#1f1d3a",
          textAlign: "center",
        }}
      >
        Полный доступ
      </div>

      <div
        style={{
          marginTop: 10,
          fontSize: 15,
          lineHeight: 1.5,
          color: "#5f5a7a",
          textAlign: "center",
        }}
      >
        Выбери удобный способ оплаты
      </div>

      <button
        style={{
          ...primaryButtonStyle,
          width: "100%",
          marginTop: 18,
          opacity: premiumLoading ? 0.7 : 1,
        }}
        disabled={premiumLoading}
        onClick={() => {
          setShowPaymentChoice(false);
          handleBuyPremium();
        }}
      >
        {premiumLoading ? "Открываем оплату..." : "⭐ Оплатить через Stars"}
      </button>

      <button
        style={{
          width: "100%",
          marginTop: 10,
          border: "1px solid rgba(31,29,58,0.12)",
          background: "#fff",
          color: "#1f1d3a",
          borderRadius: 16,
          padding: "14px 16px",
          fontSize: 16,
          fontWeight: 800,
          cursor: "pointer",
        }}
        onClick={() => {
          if (window.Telegram?.WebApp?.openTelegramLink) {
            window.Telegram.WebApp.openTelegramLink(TRIBUTE_LINK);
          } else {
            window.location.href = TRIBUTE_LINK;
          }
        }}
      >
        💎 Оплатить через Tribute
      </button>

      <button
        style={{
          width: "100%",
          marginTop: 10,
          border: "none",
          background: "transparent",
          color: "#6b46ff",
          borderRadius: 16,
          padding: "12px 16px",
          fontSize: 15,
          fontWeight: 800,
          cursor: "pointer",
        }}
        onClick={() => setShowPaymentChoice(false)}
      >
        Отмена
      </button>
    </div>
  </div>
)}

    </main>
  


    
  );
}