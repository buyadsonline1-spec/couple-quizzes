"use client";

import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { getMarket, Market } from "@/config/markets";
import { REWARD_CATEGORIES_RU } from "@/config/rewards-ru";
import { REWARD_CATEGORIES_EN } from "@/config/rewards-en";
import { REWARD_CATEGORIES_FI } from "@/config/rewards-fi";
import {
  TEST_REWARD,
  POLL_REWARD,
  DAILY_BONUS_REWARDS,
} from "@/config/reward-catalog";



import { confirmGiveawayAction } from "@/lib/giveaway";
import { supabase } from "@/lib/supabase";
import {
  isCapacitorApp,
  installCapacitorTelegramShim,
  hasSupabaseSession,
  setSyntheticTelegramId,
} from "@/lib/platform";
import confetti from "canvas-confetti";
import { TEXT_RU } from "@/config/text-ru";
import { TEXT_EN } from "@/config/text-en";
import { TEXT_FI } from "@/config/text-fi";

const market = getMarket();
const t = market === "fi" ? TEXT_FI : market === "en" ? TEXT_EN : TEXT_RU;
const MANAGER_CHAT_URL = "https://t.me/Couple_quizzes_support";

const REWARD_CATEGORIES =
  market === "en" ? REWARD_CATEGORIES_EN : REWARD_CATEGORIES_RU;




declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
    
        initData?: string;
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
    language_code?: string;
  };
  start_param?: string;
};
      };
    };
  }
}

type Screen =
  | "auth"
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
  | "pair-compatibility-info"
  | "freePremium"
  | "ai-psychologist-chat";



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

type WheelOutcomeType = "prize" | "bonus_points" | "bonus_spin";

type WonReward = {
  // Уникальный ключ выигрыша — именно spinId, а не itemId: один и тот
  // же приз (например "wb500") можно выиграть больше одного раза.
  spinId: string;
  itemId: string;
  title: string;
  categoryId: string;
  categoryTitle: string;
  wonAt: string;
  spentPoints: number;
  spinsUsedToday: number;
  spinsRemainingToday: number;
  market: Market;
  // 70% вращений — это не настоящий приз, а один из двух видов бонуса:
  // +500 очков сразу, либо +1 в банк бесплатных вращений (bonusSpinCredits) —
  // следующее вращение из банка бесплатно и не тратит дневной лимит.
  outcomeType: WheelOutcomeType;
  bonusValue: number | null;
  spinSource: "paid" | "bonus_credit";
  bonusSpinCredits: number;
};


type AppState = {
  points: number;
  soloPoints: number;
  soloWeeklyPoints: number;
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

  image?: string;      // 👈 добавили

  options: string[];
  optionsRu: string[];
  optionsEn: string[];
};

type Poll = {
  id: string;
  theme: string;
  image: string;


  title: string;
  description: string;
  
  titleRu?: string;
  titleEn?: string;
  descriptionRu?: string;
  descriptionEn?: string;

  reward: number;
  gender: "boy" | "girl";
  page: number;
  
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
  textRu: string;
  textEn: string;
};

type TestKind = "scale" | "love-language" | "personality";

type TestQuestion = {
  id: string;
  text: string;
  textRu: string;
  textEn: string;
  image?: string;
  options: string[];
  optionsRu: string[];
  optionsEn: string[];
};

type TestDefinition = {
  id: string;
  image?: string;
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
  textRu: string;
  textEn: string;
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
  weeklyPoints: number;
  dailyTestsUsed: number;
dailyPollsUsed: number;
dailyGamesUsed: number;
dailyLimitDate: string | null;
isPremium?: boolean;
  weeklyTopRewardClaimedWeek: string | null;
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

type WeeklyUserLeaderboardRow = {
  id: string;
  week_key: string;
  telegram_id: number;
  display_name: string;
  username: string | null;
  photo_url: string | null;
  total_points: number;
  updated_at: string;
};



const DAILY_REWARDS = DAILY_BONUS_REWARDS;
const STORAGE_KEY = "couple-quizzes-miniapp-v6";
const WHEEL_SPIN_COST = 2000;


const SCALE_OPTIONS_RU = ["Никогда", "Редко", "Иногда", "Часто", "Всегда"];
const SCALE_OPTIONS_EN = ["Never", "Rarely", "Sometimes", "Often", "Always"];

const TEST_IMAGES: Record<string, string> = {
  "trust-level": "/images/tests/trust-level.png",
  "love-language": "/images/tests/love-language.png",
  "personality-strengths": "/images/tests/personality-strengths.png",
};

const TESTS: TestDefinition[] = [
  {
    id: "trust-level",
    image: TEST_IMAGES["trust-level"],
    title:
      market !== "ru"
        ? "Trust Level in a Relationship"
        : "Уровень доверия к партнёру",
    titleRu: "Уровень доверия к партнёру",
    titleEn: "Trust Level in a Relationship",
    description:
      market !== "ru"
        ? "Shows how calm, secure, and confident you feel in your relationship."
        : "Покажет, насколько спокойно и уверенно ты чувствуешь себя в отношениях.",
    descriptionRu:
      "Покажет, насколько спокойно и уверенно ты чувствуешь себя в отношениях.",
    descriptionEn:
      "Shows how calm, secure, and confident you feel in your relationship.",
    reward: TEST_REWARD,
    kind: "scale",
    questions: [
      {
        id: "t1",
        text:
          market !== "ru"
            ? "I feel comfortable sharing my worries with my partner."
            : "Мне комфортно делиться с партнёром своими переживаниями.",
        textRu: "Мне комфортно делиться с партнёром своими переживаниями.",
        textEn: "I feel comfortable sharing my worries with my partner.",
        options: market !== "ru" ? SCALE_OPTIONS_EN : SCALE_OPTIONS_RU,
        optionsRu: SCALE_OPTIONS_RU,
        optionsEn: SCALE_OPTIONS_EN,
      },
      {
        id: "t2",
        text:
          market !== "ru"
            ? "I am not afraid that my partner will judge my feelings."
            : "Я не боюсь, что партнёр осудит мои чувства.",
        textRu: "Я не боюсь, что партнёр осудит мои чувства.",
        textEn: "I am not afraid that my partner will judge my feelings.",
        options: market !== "ru" ? SCALE_OPTIONS_EN : SCALE_OPTIONS_RU,
        optionsRu: SCALE_OPTIONS_RU,
        optionsEn: SCALE_OPTIONS_EN,
      },
      {
        id: "t3",
        text:
          market !== "ru"
            ? "I trust my partner's words without unnecessary doubt."
            : "Я верю словам партнёра без лишних сомнений.",
        textRu: "Я верю словам партнёра без лишних сомнений.",
        textEn: "I trust my partner's words without unnecessary doubt.",
        options: market !== "ru" ? SCALE_OPTIONS_EN : SCALE_OPTIONS_RU,
        optionsRu: SCALE_OPTIONS_RU,
        optionsEn: SCALE_OPTIONS_EN,
      },
      {
        id: "t4",
        text:
          market !== "ru"
            ? "I feel calm when my partner spends time without me."
            : "Мне спокойно, когда партнёр проводит время без меня.",
        textRu: "Мне спокойно, когда партнёр проводит время без меня.",
        textEn: "I feel calm when my partner spends time without me.",
        options: market !== "ru" ? SCALE_OPTIONS_EN : SCALE_OPTIONS_RU,
        optionsRu: SCALE_OPTIONS_RU,
        optionsEn: SCALE_OPTIONS_EN,
      },
      {
        id: "t5",
        text:
          market !== "ru"
            ? "I feel safe when I am with my partner."
            : "Я чувствую себя в безопасности рядом с партнёром.",
        textRu: "Я чувствую себя в безопасности рядом с партнёром.",
        textEn: "I feel safe when I am with my partner.",
        options: market !== "ru" ? SCALE_OPTIONS_EN : SCALE_OPTIONS_RU,
        optionsRu: SCALE_OPTIONS_RU,
        optionsEn: SCALE_OPTIONS_EN,
      },
      {
        id: "t6",
        text:
          market !== "ru"
            ? "If a problem comes up, I believe we can talk it through."
            : "Если возникает проблема, я верю, что мы сможем её обсудить.",
        textRu: "Если возникает проблема, я верю, что мы сможем её обсудить.",
        textEn: "If a problem comes up, I believe we can talk it through.",
        options: market !== "ru" ? SCALE_OPTIONS_EN : SCALE_OPTIONS_RU,
        optionsRu: SCALE_OPTIONS_RU,
        optionsEn: SCALE_OPTIONS_EN,
      },
      {
        id: "t7",
        text:
          market !== "ru"
            ? "I do not expect tricks or betrayal from my partner."
            : "Я не жду подвоха от партнёра.",
        textRu: "Я не жду подвоха от партнёра.",
        textEn: "I do not expect tricks or betrayal from my partner.",
        options: market !== "ru" ? SCALE_OPTIONS_EN : SCALE_OPTIONS_RU,
        optionsRu: SCALE_OPTIONS_RU,
        optionsEn: SCALE_OPTIONS_EN,
      },
      {
        id: "t8",
        text:
          market !== "ru"
            ? "It is easy for me to be myself in this relationship."
            : "Мне легко быть собой в этих отношениях.",
        textRu: "Мне легко быть собой в этих отношениях.",
        textEn: "It is easy for me to be myself in this relationship.",
        options: market !== "ru" ? SCALE_OPTIONS_EN : SCALE_OPTIONS_RU,
        optionsRu: SCALE_OPTIONS_RU,
        optionsEn: SCALE_OPTIONS_EN,
      },
    ],
  },

  {
    id: "love-language",
     image: TEST_IMAGES["love-language"],
    title: market !== "ru" ? "Love Language" : "Язык любви",
    titleRu: "Язык любви",
    titleEn: "Love Language",
    description:
      market !== "ru"
        ? "Helps determine how you most naturally feel love and care."
        : "Определит, как тебе приятнее всего чувствовать любовь и заботу.",
    descriptionRu:
      "Определит, как тебе приятнее всего чувствовать любовь и заботу.",
    descriptionEn:
      "Helps determine how you most naturally feel love and care.",
    reward: TEST_REWARD,
    kind: "love-language",
    questions: [
      {
        id: "l1",
        text:
          market !== "ru"
            ? "What would feel nicest to receive from your partner?"
            : "Что приятнее получить от партнёра?",
        textRu: "Что приятнее получить от партнёра?",
        textEn: "What would feel nicest to receive from your partner?",
        options:
          market !== "ru"
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
          market !== "ru"
            ? "When do you feel especially happy in a relationship?"
            : "Когда тебе особенно хорошо в отношениях?",
        textRu: "Когда тебе особенно хорошо в отношениях?",
        textEn: "When do you feel especially happy in a relationship?",
        options:
          market !== "ru"
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
          market !== "ru"
            ? "What do you remember the most?"
            : "Что ты запоминаешь сильнее всего?",
        textRu: "Что ты запоминаешь сильнее всего?",
        textEn: "What do you remember the most?",
        options:
          market !== "ru"
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
          market !== "ru"
            ? "What makes it easiest for you to feel loved?"
            : "Как тебе легче почувствовать любовь?",
        textRu: "Как тебе легче почувствовать любовь?",
        textEn: "What makes it easiest for you to feel loved?",
        options:
          market !== "ru"
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
          market !== "ru"
            ? "What upsets you the most when it is missing?"
            : "Что тебя расстраивает сильнее всего, когда этого не хватает?",
        textRu: "Что тебя расстраивает сильнее всего, когда этого не хватает?",
        textEn: "What upsets you the most when it is missing?",
        options:
          market !== "ru"
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
          market !== "ru"
            ? "What feels more romantic to you?"
            : "Что для тебя романтичнее?",
        textRu: "Что для тебя романтичнее?",
        textEn: "What feels more romantic to you?",
        options:
          market !== "ru"
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
      image: TEST_IMAGES["personality-strengths"],
    title:
      market !== "ru"
        ? "Personal Strengths"
        : "Сильные стороны личности",
    titleRu: "Сильные стороны личности",
    titleEn: "Personal Strengths",
    description:
      market !== "ru"
        ? "Shows which of your inner strengths stands out the most in life and relationships."
        : "Покажет, какая твоя энергия сильнее всего проявляется в жизни и отношениях.",
    descriptionRu:
      "Покажет, какая твоя энергия сильнее всего проявляется в жизни и отношениях.",
    descriptionEn:
      "Shows which of your inner strengths stands out the most in life and relationships.",
    reward: TEST_REWARD,
    kind: "personality",
    questions: [
      {
        id: "p1",
        text:
          market !== "ru"
            ? "In a difficult situation, you are more likely to..."
            : "В сложной ситуации ты чаще...",
        textRu: "В сложной ситуации ты чаще...",
        textEn: "In a difficult situation, you are more likely to...",
        options:
          market !== "ru"
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
          market !== "ru"
            ? "People most often value in you..."
            : "Люди чаще ценят в тебе...",
        textRu: "Люди чаще ценят в тебе...",
        textEn: "People most often value in you...",
        options:
          market !== "ru"
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
          market !== "ru"
            ? "In relationships, you are mostly about..."
            : "В отношениях ты больше про...",
        textRu: "В отношениях ты больше про...",
        textEn: "In relationships, you are mostly about...",
        options:
          market !== "ru"
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
          market !== "ru"
            ? "What is your biggest strength?"
            : "Какой твой главный плюс?",
        textRu: "Какой твой главный плюс?",
        textEn: "What is your biggest strength?",
        options:
          market !== "ru"
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
          market !== "ru"
            ? "When someone close is nearby, you more often..."
            : "Когда рядом близкий человек, ты чаще...",
        textRu: "Когда рядом близкий человек, ты чаще...",
        textEn: "When someone close is nearby, you more often...",
        options:
          market !== "ru"
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
          market !== "ru"
            ? "Your ideal self-image is..."
            : "Твой идеальный образ себя — это...",
        textRu: "Твой идеальный образ себя — это...",
        textEn: "Your ideal self-image is...",
        options:
          market !== "ru"
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
    case "roles":
      return "Роль в отношениях";
    case "fidelity":
      return "Верность и измена";
    case "family":
      return "Семья и друзья";
    case "quality-time":
      return "Совместное время";
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
    "roles",
    "fidelity",
    "family",
    "quality-time",
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

// loadPremiumStatus() (прямой supabase.from("subscriptions").select(...))
// удалена — последняя точка вызова была после успешной оплаты Stars,
// теперь это /api/profile/state (см. checkIsPremium в
// lib/server/pair-state.ts, та же логика).



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

 const make = (
  id: string,
  textRu: string,
  textEn: string,
  customOptionsRu: string[] = optionsRu,
  customOptionsEn: string[] = optionsEn,
  image?: string
): PollQuestion => ({
  id,
  text: market !== "ru" ? textEn : textRu,
  textRu,
  textEn,
  image,
  options: market !== "ru" ? customOptionsEn : customOptionsRu,
  optionsRu: customOptionsRu,
  optionsEn: customOptionsEn,
});

  switch (theme) {
    case "communication":
      return gender === "boy"
        ? [
    make(
      "q1",
      "Можно ли твоей девушке ходить с подругами на вечеринки без тебя?",
      "Can your girlfriend go to parties with her friends without you?",
      ["Да", "Нет", "Зависит от..."],
      ["Yes", "No", "It depends..."]
    ),

    make(
      "q2",
      "Можно ли твоей девушке не делиться с тобой своими планами?",
      "Can your girlfriend keep her plans to herself?",
      ["Да", "Нет", "Зависит от..."],
      ["Yes", "No", "It depends..."]
    ),

    make(
      "q3",
      "Можно ли твоей девушке носить одежду, которая тебе не очень нравится?",
      "Can your girlfriend wear clothes you do not really like?",
      ["Да", "Нет", "Нет, но боюсь так ответить"],
      ["Yes", "No", "No, but I am afraid to say that"]
    ),

    make(
      "q4",
      "Можно ли твоей девушке самостоятельно принимать важные решения без твоего согласия?",
      "Can your girlfriend make important decisions without your approval?",
      ["Да", "Нет", "Зависит от ситуации"],
      ["Yes", "No", "It depends on the situation"]
    ),

    make(
      "q5",
      "Можно ли твоей девушке просматривать твои сообщения или телефон?",
      "Can your girlfriend check your messages or phone?",
      ["Да", "Нет", "Только после предварительной зачистки"],
      ["Yes", "No", "Only after I clean everything up first"]
    ),

    make(
      "q6",
      "Можно ли твоей девушке рассказывать подругам о ваших интимных моментах?",
      "Can your girlfriend tell her friends about your intimate moments?",
      ["Да", "Нет", "Желательно"],
      ["Yes", "No", "Preferably"]
    ),

    make(
      "q7",
      "Можно ли твоей девушке вести социальные сети так, как ей нравится, без оглядки на тебя?",
      "Can your girlfriend use social media however she likes without considering your opinion?",
      ["Да", "Якобы да", "Нет"],
      ["Yes", "Supposedly yes", "No"]
    ),
  ]
       : [
    make(
      "q1",
      "Можно ли ему иметь близких подруг?",
      "Can he have close female friends?",
      ["Да", "Нет", "Пропускаю"],
      ["Yes", "No", "Skip"]
    ),

    make(
      "q2",
      "Можно ли ему носить пирсинг?",
      "Can he wear piercings?",
      ["Да", "Нет", "Никогда!!"],
      ["Yes", "No", "Never!!"]
    ),

    make(
      "q3",
      "Можно ли ему жить с родителями и не снимать квартиру?",
      "Can he live with his parents instead of renting his own apartment?",
      ["Да", "Нет", "Сам решит"],
      ["Yes", "No", "It is his choice"]
    ),

    make(
      "q4",
      "Можно ли ему делить с тобой счёт 50/50?",
      "Can he split the bill with you 50/50?",
      ["Да", "Нет", "Зависит от ситуации"],
      ["Yes", "No", "It depends"]
    ),

    make(
      "q5",
      "Можно ли ему активно вести Instagram и устраивать откровенные фотосессии?",
      "Can he actively use Instagram and take revealing photos?",
      ["Да", "Нет", "Я подумаю..."],
      ["Yes", "No", "I will think about it..."]
    ),

    make(
      "q6",
      "Можно ли ему ревновать тебя к друзьям?",
      "Can he be jealous of your friends?",
      ["Да", "Нет", "Пропускаю точно!!"],
      ["Yes", "No", "Definitely skipping!!"]
    ),

    make(
      "q7",
      "Можно ли ему сравнивать тебя с другими девушками?",
      "Can he compare you to other girls?",
      ["Да", "Нет", "А по яйцам??"],
      ["Yes", "No", "How about a kick in the balls?"]
    ),
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
    make(
      "q1",
      "Будешь ли ты ревновать, если увидишь, что она лайкает фотографии другого парня в соцсетях?",
      "Will you be jealous if she likes another guy's photos on social media?",
      ["Да", "Нет", "Посмотрим"],
      ["Yes", "No", "We'll see"]
    ),

    make(
      "q2",
      "Будешь ли ты ревновать, если партнёрша будет общаться с бывшим?",
      "Will you be jealous if your girlfriend keeps talking to her ex?",
      ["Да", "Нет", "Поглядим"],
      ["Yes", "No", "We'll see"]
    ),

    make(
      "q3",
      "Будешь ли ты ревновать, если она получит комплимент от другого мужчины?",
      "Will you be jealous if another man compliments her?",
      ["Да", "Нет", "Там будет видно)"],
      ["Yes", "No", "We'll see)"]
    ),

    make(
      "q4",
      "Будешь ли ты ревновать, если она будет проводить много времени без тебя с другом-мужчиной?",
      "Will you be jealous if she spends a lot of time alone with a male friend?",
      ["Да", "Нет", "По ситуации)"],
      ["Yes", "No", "Depends)"]
    ),

    make(
      "q5",
      "Будешь ли ты ревновать, если она поедет в отпуск с подругами без тебя?",
      "Will you be jealous if she goes on vacation with her friends without you?",
      ["Да", "Нет", "Будем смотреть"],
      ["Yes", "No", "We'll see"]
    ),

    make(
      "q6",
      "Будешь ли ты ревновать, если она скажет, что у неё появились чувства к кому-то новому?",
      "Will you be jealous if she says she has feelings for someone else?",
      ["Да", "Нет", "..."],
      ["Yes", "No", "..."]
    ),

       make(
      "q7",
      "Будешь ли ты ревновать, если она расскажет тебе, что кто-то в неё влюблён?",
      "Will you be jealous if she tells you someone is in love with her?",
      ["Да", "Нет", "Всё, хватит"],
      ["Yes", "No", "Enough already"]
    ),
  ]
  : [
    make(
      "q1",
      "Будешь ли ты ревновать, если он сохранит старые совместные фото с бывшей?",
      "Will you be jealous if he keeps old photos with his ex?",
      ["Да", "Нет", "Посмотрим!)"],
      ["Yes", "No", "We'll see!)"]
    ),

    make(
      "q2",
      "Будешь ли ты ревновать, если он назовёт другую девушку красивее тебя?",
      "Will you be jealous if he says another girl is prettier than you?",
      ["Да", "Нет", "Пропускаю"],
      ["Yes", "No", "Skip"]
    ),

    make(
      "q3",
      "Будешь ли ты ревновать, если бывшая сама ему напишет, а он ответит?",
      "Will you be jealous if his ex texts him and he replies?",
      ["Да", "Нет", "Он охерел??"],
      ["Yes", "No", "Has he lost his mind??"]
    ),

    make(
      "q4",
      "Будешь ли ты ревновать, если он начнёт прятать от тебя переписки в телефоне?",
      "Will you be jealous if he starts hiding chats from you?",
      ["Да, конечно", "Нет, имеет право!!", "Пропускаю"],
      ["Of course", "No, it's his right!", "Skip"]
    ),

    make(
      "q5",
      "Будешь ли ты ревновать, если он начнёт флиртовать с официанткой при тебе?",
      "Will you be jealous if he flirts with a waitress in front of you?",
      ["Да, ясен красен!!", "Нет", "Пропуск-попуск"],
      ["Absolutely!", "No", "Skip"]
    ),

    make(
      "q6",
      "Будешь ли ты ревновать, если он начнёт заниматься в зале с тренером-девушкой?",
      "Will you be jealous if he starts training with a female coach?",
      ["Да", "Нет", "Типа нет (да)"],
      ["Yes", "No", "Pretending no (actually yes)"]
    ),

    make(
      "q7",
      "Будешь ли ты ревновать, если он будет много переписываться с подругой?",
      "Will you be jealous if he chats a lot with his female friend?",
      ["Да", "Нет", "Пропускаю (боюсь)"],
      ["Yes", "No", "Skip (I'm scared)"]
    ),
  ];

    case "roles":
      return gender === "boy"
        ? [
    make(
      "q1",
      "Ты считаешь, что мужчина должен быть главным в паре?",
      "Do you think the man should be the leader in the relationship?",
      ["Да", "Нет", "Пропускаю"],
      ["Yes", "No", "Skip"]
    ),
    make(
      "q2",
      "Должен ли парень всегда платить на свиданиях?",
      "Should the guy always pay on dates?",
      ["Да", "Нет", "50 на 50"],
      ["Yes", "No", "Split 50/50"]
    ),
    make(
      "q3",
      "Важно ли тебе, чтобы партнёрша поддерживала твои решения без споров?",
      "Is it important that your partner supports your decisions without arguing?",
      ["Да", "Нет", "Смотря какие"],
      ["Yes", "No", "Depends which ones"]
    ),
    make(
      "q4",
      "Должен ли мужчина быть инициатором в отношениях?",
      "Should the man be the one to make the first move?",
      ["Да", "Нет"],
      ["Yes", "No"]
    ),
    make(
      "q5",
      "Считаешь ли ты, что забота о технике и ремонте — обязанность парня?",
      "Do you think fixing things and dealing with tech is the guy's job?",
      ["Да", "Нет", "Не обязательно"],
      ["Yes", "No", "Not necessarily"]
    ),
    make(
      "q6",
      "Важно ли тебе быть для партнёрши «сильным плечом» в трудную минуту?",
      "Is it important to be your partner's rock in hard times?",
      ["Да", "Нет"],
      ["Yes", "No"]
    ),
    make(
      "q7",
      "Должен ли парень уметь готовить не хуже девушки?",
      "Should a guy be able to cook as well as a girl?",
      ["Да", "Нет", "Не принципиально"],
      ["Yes", "No", "Doesn't matter"]
    ),
  ]
       : [
    make(
      "q1",
      "Ты считаешь, что девушка должна проявлять инициативу в отношениях?",
      "Do you think a girl should take initiative in a relationship?",
      ["Да", "Нет", "Хотелось бы"],
      ["Yes", "No", "I wish"]
    ),
    make(
      "q2",
      "Важно ли тебе, чтобы партнёр умел готовить?",
      "Is it important that your partner can cook?",
      ["Да", "Нет", "Не принципиально"],
      ["Yes", "No", "Doesn't matter"]
    ),
    make(
      "q3",
      "Должен ли партнёр первым писать после ссоры?",
      "Should your partner be the one to text first after a fight?",
      ["Да", "Нет"],
      ["Yes", "No"]
    ),
    make(
      "q4",
      "Считаешь ли ты уборку дома скорее женской обязанностью?",
      "Do you think cleaning the house is more of a woman's job?",
      ["Да", "Нет", "Пополам"],
      ["Yes", "No", "Split evenly"]
    ),
    make(
      "q5",
      "Важно ли тебе, чтобы партнёр поддерживал твои решения без споров?",
      "Is it important that your partner supports your decisions without arguing?",
      ["Да", "Нет", "Смотря какие"],
      ["Yes", "No", "Depends which ones"]
    ),
    make(
      "q6",
      "Должен ли партнёр следить за собой ради тебя так же, как ты?",
      "Should your partner take care of their appearance for you as much as you do?",
      ["Да", "Нет"],
      ["Yes", "No"]
    ),
    make(
      "q7",
      "Важно ли тебе видеть в партнёре надёжного «хозяина дома»?",
      "Is it important to see your partner as a reliable head of the household?",
      ["Да", "Нет", "Не обязательно"],
      ["Yes", "No", "Not necessarily"]
    ),
  ];

    case "fidelity":
      return gender === "boy"
        ? [
    make(
      "q1",
      "Это измена для тебя, если она смотрит откровенные фото других парней?",
      "Is it cheating if she looks at explicit photos of other guys?",
      ["Да", "Нет", "Пропускаю"],
      ["Yes", "No", "Skip"]
    ),
    make(
      "q2",
      "Считаешь ли ты изменой активную переписку с бывшим?",
      "Do you consider actively texting an ex to be cheating?",
      ["Да", "Нет"],
      ["Yes", "No"]
    ),
    make(
      "q3",
      "Это измена, если она скрывает от тебя переписки?",
      "Is it cheating if she hides her chats from you?",
      ["Да", "Нет", "Смотря что скрывает"],
      ["Yes", "No", "Depends what's hidden"]
    ),
    make(
      "q4",
      "Будет ли изменой поцелуй на вечеринке «по пьяни»?",
      "Would a drunk kiss at a party count as cheating?",
      ["Да", "Нет"],
      ["Yes", "No"]
    ),
    make(
      "q5",
      "Считаешь ли ты изменой близкую дружбу с «тем самым» бывшим?",
      "Do you consider staying close with 'that one' ex to be cheating?",
      ["Да", "Нет", "Зависит от обстоятельств"],
      ["Yes", "No", "Depends on the circumstances"]
    ),
    make(
      "q6",
      "Это измена, если она ставит лайки красивым парням в соцсетях?",
      "Is it cheating if she likes attractive guys' photos on social media?",
      ["Да", "Нет", "Раздражает, но не измена"],
      ["Yes", "No", "Annoying, but not cheating"]
    ),
    make(
      "q7",
      "Будет ли изменой эмоциональная близость с другим человеком без физического контакта?",
      "Would emotional closeness with someone else count as cheating, even without physical contact?",
      ["Да", "Нет"],
      ["Yes", "No"]
    ),
  ]
       : [
    make(
      "q1",
      "Это измена для тебя, если он смотрит откровенные фото других людей?",
      "Is it cheating if he looks at explicit photos of other people?",
      ["Пропускаю", "Да", "Нет"],
      ["Skip", "Yes", "No"]
    ),
    make(
      "q2",
      "Считаешь ли ты изменой активную переписку с бывшей?",
      "Do you consider actively texting an ex to be cheating?",
      ["Да", "Нет"],
      ["Yes", "No"]
    ),
    make(
      "q3",
      "Это измена, если он скрывает от тебя переписки?",
      "Is it cheating if he hides his chats from you?",
      ["Да", "Нет", "Смотря что скрывает"],
      ["Yes", "No", "Depends what's hidden"]
    ),
    make(
      "q4",
      "Будет ли изменой поцелуй на вечеринке «по пьяни»?",
      "Would a drunk kiss at a party count as cheating?",
      ["Да", "Нет"],
      ["Yes", "No"]
    ),
    make(
      "q5",
      "Считаешь ли ты изменой близкую дружбу с «той самой» бывшей?",
      "Do you consider staying close with 'that one' ex to be cheating?",
      ["Да", "Нет", "Зависит от обстоятельств"],
      ["Yes", "No", "Depends on the circumstances"]
    ),
    make(
      "q6",
      "Это измена, если он ставит лайки красивым девушкам в соцсетях?",
      "Is it cheating if he likes attractive girls' photos on social media?",
      ["Да", "Нет", "Раздражает, но не измена"],
      ["Yes", "No", "Annoying, but not cheating"]
    ),
    make(
      "q7",
      "Будет ли изменой эмоциональная близость с другим человеком без физического контакта?",
      "Would emotional closeness with someone else count as cheating, even without physical contact?",
      ["Да", "Нет"],
      ["Yes", "No"]
    ),
  ];

    case "family":
      return gender === "boy"
        ? [
    make(
      "q1",
      "Ты ценишь дружескую поддержку?",
      "Do you value support from friends?",
      ["Для меня это не очень важно", "Да, конечно", "Иногда это помогает"],
      ["Not very important to me", "Yes, of course", "Sometimes it helps"]
    ),
    make(
      "q2",
      "Важно ли тебе, чтобы партнёрша нравилась твоим родителям?",
      "Is it important that your parents like your partner?",
      ["Да", "Нет", "Не принципиально"],
      ["Yes", "No", "Doesn't really matter"]
    ),
    make(
      "q3",
      "Стоит ли обсуждать ваши ссоры с друзьями?",
      "Is it okay to discuss your fights with friends?",
      ["Да", "Нет"],
      ["Yes", "No"]
    ),
    make(
      "q4",
      "Готов ли ты проводить больше времени с её семьёй, чем со своей?",
      "Are you willing to spend more time with her family than your own?",
      ["Да", "Нет", "Смотря когда"],
      ["Yes", "No", "Depends on when"]
    ),
    make(
      "q5",
      "Важно ли тебе сохранять близких друзей после начала серьёзных отношений?",
      "Is it important to keep your close friends after starting a serious relationship?",
      ["Да", "Нет"],
      ["Yes", "No"]
    ),
    make(
      "q6",
      "Нормально ли для тебя, если партнёрша не ладит с твоими друзьями?",
      "Is it okay if your partner doesn't get along with your friends?",
      ["Да", "Нет", "Могу с этим смириться"],
      ["Yes", "No", "I could live with it"]
    ),
    make(
      "q7",
      "Важно ли тебе, чтобы партнёрша участвовала в семейных праздниках?",
      "Is it important that your partner joins family celebrations?",
      ["Да", "Нет", "Не обязательно каждый раз"],
      ["Yes", "No", "Not every single time"]
    ),
  ]
       : [
    make(
      "q1",
      "Ты ценишь дружескую поддержку?",
      "Do you value support from friends?",
      ["Для меня это не очень важно", "Да, конечно", "Иногда это помогает"],
      ["Not very important to me", "Yes, of course", "Sometimes it helps"]
    ),
    make(
      "q2",
      "Важно ли тебе, чтобы партнёр нравился твоим родителям?",
      "Is it important that your parents like your partner?",
      ["Да", "Нет", "Не принципиально"],
      ["Yes", "No", "Doesn't really matter"]
    ),
    make(
      "q3",
      "Стоит ли обсуждать ваши ссоры с подругами?",
      "Is it okay to discuss your fights with friends?",
      ["Да", "Нет"],
      ["Yes", "No"]
    ),
    make(
      "q4",
      "Готова ли ты проводить больше времени с его семьёй, чем со своей?",
      "Are you willing to spend more time with his family than your own?",
      ["Да", "Нет", "Смотря когда"],
      ["Yes", "No", "Depends on when"]
    ),
    make(
      "q5",
      "Важно ли тебе сохранять близких подруг после начала серьёзных отношений?",
      "Is it important to keep your close friends after starting a serious relationship?",
      ["Да", "Нет"],
      ["Yes", "No"]
    ),
    make(
      "q6",
      "Нормально ли для тебя, если партнёр не ладит с твоими друзьями?",
      "Is it okay if your partner doesn't get along with your friends?",
      ["Да", "Нет", "Могу с этим смириться"],
      ["Yes", "No", "I could live with it"]
    ),
    make(
      "q7",
      "Важно ли тебе, чтобы партнёр участвовал в семейных праздниках?",
      "Is it important that your partner joins family celebrations?",
      ["Да", "Нет", "Не обязательно каждый раз"],
      ["Yes", "No", "Not every single time"]
    ),
  ];

    case "quality-time":
      return gender === "boy"
        ? [
    make(
      "q1",
      "Ты заинтересован в поиске общих хобби или увлечений с партнёршей?",
      "Are you interested in finding shared hobbies with your partner?",
      ["Да", "Нет", "Иногда выдаю)"],
      ["Yes", "No", "Sometimes I fake it)"]
    ),
    make(
      "q2",
      "Важно ли тебе проводить хотя бы один вечер в неделю только вдвоём?",
      "Is it important to spend at least one evening a week just the two of you?",
      ["Да", "Нет"],
      ["Yes", "No"]
    ),
    make(
      "q3",
      "Готов ли ты отказаться от встречи с друзьями ради вечера с партнёршей?",
      "Would you skip hanging out with friends for an evening with your partner?",
      ["Да", "Нет", "Смотря по ситуации"],
      ["Yes", "No", "Depends on the situation"]
    ),
    make(
      "q4",
      "Важно ли тебе, чтобы у вас были общие традиции или ритуалы?",
      "Is it important to have shared traditions or rituals?",
      ["Да", "Нет"],
      ["Yes", "No"]
    ),
    make(
      "q5",
      "Считаешь ли ты нормальным проводить выходные порознь?",
      "Do you think it's normal to spend weekends apart?",
      ["Да", "Нет", "Иногда это даже полезно"],
      ["Yes", "No", "Sometimes it's even good for you"]
    ),
    make(
      "q6",
      "Важно ли тебе путешествовать вместе хотя бы раз в год?",
      "Is it important to travel together at least once a year?",
      ["Да", "Нет", "Не принципиально"],
      ["Yes", "No", "Doesn't really matter"]
    ),
    make(
      "q7",
      "Готов ли ты откладывать личные дела ради совместных планов?",
      "Would you put off your own plans for shared ones?",
      ["Да", "Нет"],
      ["Yes", "No"]
    ),
  ]
       : [
    make(
      "q1",
      "Ты заинтересована в поиске общих хобби или увлечений с партнёром?",
      "Are you interested in finding shared hobbies with your partner?",
      ["Да", "Нет", "Иногда выдаю)"],
      ["Yes", "No", "Sometimes I fake it)"]
    ),
    make(
      "q2",
      "Важно ли тебе проводить хотя бы один вечер в неделю только вдвоём?",
      "Is it important to spend at least one evening a week just the two of you?",
      ["Да", "Нет"],
      ["Yes", "No"]
    ),
    make(
      "q3",
      "Готова ли ты отказаться от встречи с подругами ради вечера с партнёром?",
      "Would you skip hanging out with friends for an evening with your partner?",
      ["Да", "Нет", "Смотря по ситуации"],
      ["Yes", "No", "Depends on the situation"]
    ),
    make(
      "q4",
      "Важно ли тебе, чтобы у вас были общие традиции или ритуалы?",
      "Is it important to have shared traditions or rituals?",
      ["Да", "Нет"],
      ["Yes", "No"]
    ),
    make(
      "q5",
      "Считаешь ли ты нормальным проводить выходные порознь?",
      "Do you think it's normal to spend weekends apart?",
      ["Да", "Нет", "Иногда это даже полезно"],
      ["Yes", "No", "Sometimes it's even good for you"]
    ),
    make(
      "q6",
      "Важно ли тебе путешествовать вместе хотя бы раз в год?",
      "Is it important to travel together at least once a year?",
      ["Да", "Нет", "Не принципиально"],
      ["Yes", "No", "Doesn't really matter"]
    ),
    make(
      "q7",
      "Готова ли ты откладывать личные дела ради совместных планов?",
      "Would you put off your own plans for shared ones?",
      ["Да", "Нет"],
      ["Yes", "No"]
    ),
  ];

    default:
      return [];
  }
}

const POLL_THEME_IMAGES: Record<string, string> = {
  communication: "/images/poll-themes/communication.png",
  love: "/images/poll-themes/love.png",
  conflicts: "/images/poll-themes/conflicts.png",
  trust: "/images/poll-themes/trust.png",
  understanding: "/images/poll-themes/understanding.png",
  romance: "/images/poll-themes/romance.png",
  space: "/images/poll-themes/space.png",
  future: "/images/poll-themes/future.png",
  life: "/images/poll-themes/life.png",
  jealousy: "/images/poll-themes/jealousy.png",
  roles: "/images/poll-themes/life.png",
  fidelity: "/images/poll-themes/trust.png",
  family: "/images/poll-themes/understanding.png",
  "quality-time": "/images/poll-themes/romance.png",
};


  const POLL_THEMES = [
    
  {
  key: "communication",
  titleRu: "Можно ли твоему партнёру делать это?",
  descriptionRu: "Установи границы дозволенного в отношениях",

  titleEn: "Can your partner do this?",
  descriptionEn: "Set the boundaries of what your partner can and cannot do",

  theme: "communication",
  matchGroup: "communication",
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
    key: "roles",
    titleRu: "Роль в отношениях",
    titleEn: "Roles in the relationship",
    descriptionRu:
      "Кто и за что отвечает в паре — взгляды на роли партнёров.",
    descriptionEn:
      "Who's responsible for what — your views on partner roles.",
    theme: "roles",
    matchGroup: "roles",
  },
  {
    key: "fidelity",
    titleRu: "Верность и измена",
    titleEn: "Fidelity and cheating",
    descriptionRu:
      "Где для тебя проходит граница между нормой и изменой.",
    descriptionEn:
      "Where you draw the line between normal and cheating.",
    theme: "fidelity",
    matchGroup: "fidelity",
  },
  {
    key: "family",
    titleRu: "Семья и друзья",
    titleEn: "Family and friends",
    descriptionRu:
      "Как ты относишься к семье, друзьям партнёра и их месту в отношениях.",
    descriptionEn:
      "How you feel about family, your partner's friends, and their place in the relationship.",
    theme: "family",
    matchGroup: "family",
  },
  {
    key: "quality-time",
    titleRu: "Совместное время",
    titleEn: "Quality time",
    descriptionRu:
      "Сколько времени и внимания вам важно проводить вместе.",
    descriptionEn:
      "How much time and attention you need to spend together.",
    theme: "quality-time",
    matchGroup: "quality-time",
  },

] as const;

const POLLS: Poll[] = POLL_THEMES.flatMap((item, index) => {
  const page = Math.floor(index / 2) + 1;

  return [
    {
      id: `boy-${item.key}`,
      theme: item.theme,
      image: POLL_THEME_IMAGES[item.theme],

      title: item.titleRu,
      description: item.descriptionRu,

      titleRu: item.titleRu,
      titleEn: item.titleEn,
      descriptionRu: item.descriptionRu,
      descriptionEn: item.descriptionEn,

      reward: POLL_REWARD,
      gender: "boy" as const,
      page,

      matchGroup: item.matchGroup,
      questions: createPollQuestions(item.theme, "boy"),
    },
    {
      id: `girl-${item.key}`,
      theme: item.theme,
      image: POLL_THEME_IMAGES[item.theme],

      title: item.titleRu,
      description: item.descriptionRu,

      titleRu: item.titleRu,
      titleEn: item.titleEn,
      descriptionRu: item.descriptionRu,
      descriptionEn: item.descriptionEn,

      reward: POLL_REWARD,
      gender: "girl" as const,
      page,

      matchGroup: item.matchGroup,
      questions: createPollQuestions(item.theme, "girl"),
    },
  ];
});

const GAMES: Game[] = [

{
  id: "never-have-i-ever",
  title: market !== "ru" ? "Never Have I Ever..." : "Я никогда не...",
  description:
    market !== "ru"
      ? "Say something you've never done in your life — if your partner has done it, they complete the task on the card."
      : "Скажите что-то, чего вы никогда в жизни не делали, и если ваш партнёр делал это, он выполняет задание с карточки.",
  reward: 0,
  questions: [],
},

  {
    id: "bottle",
    title: market !== "ru" ? "Spin the Bottle" : "Бутылочка",
    description:
      market !== "ru"
        ? "Spin the bottle and get romantic or bold tasks for couples."
        : "Крути бутылку и получай романтичные и дерзкие задания для пары.",
    reward: 0,
    questions: [],
  },

    {
    id: "90-questions",
    title: market !== "ru" ? "90 Questions" : "90 вопросов",
    description:
      market !== "ru"
        ? "Random deep questions about love, feelings, and relationships."
        : "Случайные глубокие вопросы про любовь, чувства и отношения.",
    reward: 0,
    questions: [],
  },
];

const RARELY_SOMETIMES_OFTEN =
  market !== "ru" ? ["Rarely", "Sometimes", "Often"] : ["Редко", "Иногда", "Часто"];
const NO_SOMETIMES_YES =
  market !== "ru" ? ["No", "Sometimes", "Yes"] : ["Нет", "Иногда", "Да"];
const YES_SOMETIMES_NO =
  market !== "ru" ? ["Yes", "Sometimes", "No"] : ["Да", "Иногда", "Нет"];

const relationshipCheckQuestion = (
  id: string,
  category: string,
  textRu: string,
  textEn: string,
  options: string[]
) => ({
  id,
  category,
  text: market !== "ru" ? textEn : textRu,
  options,
});

const RELATIONSHIP_CHECK_QUESTIONS = [
  relationshipCheckQuestion(
    "communication-1",
    "communication",
    "Как часто вам трудно спокойно поговорить друг с другом?",
    "How often is it hard for you to calmly talk to each other?",
    RARELY_SOMETIMES_OFTEN
  ),
  relationshipCheckQuestion(
    "communication-2",
    "communication",
    "Как часто один из вас чувствует, что его не слышат?",
    "How often does one of you feel unheard?",
    RARELY_SOMETIMES_OFTEN
  ),

  relationshipCheckQuestion(
    "trust-1",
    "trust",
    "Бывает ли в ваших отношениях недоверие?",
    "Does distrust ever show up in your relationship?",
    NO_SOMETIMES_YES
  ),
  relationshipCheckQuestion(
    "trust-2",
    "trust",
    "Как часто вам хочется что-то скрыть друг от друга, чтобы избежать конфликта?",
    "How often do you want to hide something from each other to avoid conflict?",
    RARELY_SOMETIMES_OFTEN
  ),

  relationshipCheckQuestion(
    "conflicts-1",
    "conflicts",
    "Как часто мелочи перерастают в ссору?",
    "How often do small things turn into a fight?",
    RARELY_SOMETIMES_OFTEN
  ),
  relationshipCheckQuestion(
    "conflicts-2",
    "conflicts",
    "После конфликта вам легко восстановить близость?",
    "Is it easy for you to reconnect after a conflict?",
    YES_SOMETIMES_NO
  ),

  relationshipCheckQuestion(
    "closeness-1",
    "closeness",
    "Чувствуете ли вы эмоциональную близость друг к другу?",
    "Do you feel emotionally close to each other?",
    YES_SOMETIMES_NO
  ),
  relationshipCheckQuestion(
    "closeness-2",
    "closeness",
    "Как часто вам не хватает тепла, внимания или нежности в отношениях?",
    "How often do you feel a lack of warmth, attention, or tenderness in the relationship?",
    RARELY_SOMETIMES_OFTEN
  ),

  relationshipCheckQuestion(
    "support-1",
    "support",
    "Чувствуете ли вы поддержку от партнёра?",
    "Do you feel supported by your partner?",
    YES_SOMETIMES_NO
  ),
  relationshipCheckQuestion(
    "support-2",
    "support",
    "Как часто вы чувствуете, что тянете отношения на себе?",
    "How often do you feel like you're carrying the relationship alone?",
    RARELY_SOMETIMES_OFTEN
  ),

  relationshipCheckQuestion(
    "resentment-1",
    "resentment",
    "Как часто вы копите обиды и не проговариваете их?",
    "How often do you bottle up resentment instead of talking it through?",
    RARELY_SOMETIMES_OFTEN
  ),
  relationshipCheckQuestion(
    "resentment-2",
    "resentment",
    "Есть ли у вас темы, к которым неприятно возвращаться, но они до сих пор болят?",
    "Are there topics that are unpleasant to revisit but still hurt?",
    NO_SOMETIMES_YES
  ),
];

const AI_PSYCHOLOGIST_AVATARS = {
  neutral: "/psychologist/neutral.png",
  thinking: "/psychologist/thinking.png",
  worried: "/psychologist/worried.png",
  happy: "/psychologist/happy.png",
};

function getRelationshipCheckEmotion(params: {
  aiTyping: boolean;
  isFinished: boolean;
  aiStep: number;
}) {
  const { aiTyping, isFinished, aiStep } = params;

  if (aiTyping) return "thinking";
  if (isFinished) return "happy";

  const current = RELATIONSHIP_CHECK_QUESTIONS[aiStep];

  if (!current) return "neutral";

  if (
    current.category === "trust" ||
    current.category === "conflicts" ||
    current.category === "resentment"
  ) {
    return "worried";
  }

  return "neutral";
}



const bottleTask = (
  id: string,
  target: "boy" | "girl",
  textRu: string,
  textEn: string
): BottleTask => ({
  id,
  target,
  text: market !== "ru" ? textEn : textRu,
  textRu,
  textEn,
});

const BOTTLE_TASKS: BottleTask[] = [
  bottleTask("b1", "girl", "Скажи партнёру самый милый комплимент.", "Give your partner the sweetest compliment."),
  bottleTask("b2", "girl", "Обними партнёра на 15 секунд.", "Hug your partner for 15 seconds."),
  bottleTask("b3", "girl", "Поцелуй партнёра в щёку.", "Kiss your partner on the cheek."),
  bottleTask("b4", "girl", "Расскажи, что тебе в нём нравится больше всего.", "Tell him what you like most about him."),
  bottleTask("b5", "girl", "Скажи, какое свидание с ним было бы идеальным.", "Describe what your perfect date with him would be like."),
  bottleTask("b6", "girl", "Проведи рукой по его волосам и улыбнись.", "Run your hand through his hair and smile."),
  bottleTask("b7", "girl", "Прошепчи ему что-нибудь приятное на ухо.", "Whisper something sweet in his ear."),
  bottleTask("b8", "girl", "Назови одну его привычку, которая тебя заводит.", "Name one habit of his that turns you on."),

  bottleTask("b9", "boy", "Скажи партнёрше самый красивый комплимент.", "Give your partner the most beautiful compliment."),
  bottleTask("b10", "boy", "Обними её на 15 секунд.", "Hug her for 15 seconds."),
  bottleTask("b11", "boy", "Поцелуй её в щёку.", "Kiss her on the cheek."),
  bottleTask("b12", "boy", "Скажи три причины, почему она тебе нравится.", "Name three reasons why you like her."),
  bottleTask("b13", "boy", "Назови её самую привлекательную черту.", "Name her most attractive trait."),
  bottleTask("b14", "boy", "Возьми её за руку и не отпускай 20 секунд.", "Hold her hand and don't let go for 20 seconds."),
  bottleTask("b15", "boy", "Скажи, что бы ты хотел повторить с вашим лучшим свиданием.", "Say what you'd like to repeat from your best date together."),
  bottleTask("b16", "boy", "Сделай ей короткое романтичное признание.", "Give her a short romantic confession."),
];


const LOVE_QUESTIONS: LoveQuestion[] = [
  { id: "lq1", text: market !== "ru" ? "When was the last time you felt truly loved?" : "Когда ты в последний раз чувствовал(а) себя по-настоящему любимым(ой)?", textRu: "Когда ты в последний раз чувствовал(а) себя по-настоящему любимым(ой)?", textEn: "When was the last time you felt truly loved?" },
  { id: "lq2", text: market !== "ru" ? "What does real closeness in a relationship mean to you?" : "Что для тебя значит настоящая близость в отношениях?", textRu: "Что для тебя значит настоящая близость в отношениях?", textEn: "What does real closeness in a relationship mean to you?" },
  { id: "lq3", text: market !== "ru" ? "What do you sometimes feel is missing in love?" : "Чего тебе иногда не хватает в любви?", textRu: "Чего тебе иногда не хватает в любви?", textEn: "What do you sometimes feel is missing in love?" },
  { id: "lq4", text: market !== "ru" ? "What are you most afraid of losing in a relationship?" : "Что ты боишься потерять в отношениях сильнее всего?", textRu: "Что ты боишься потерять в отношениях сильнее всего?", textEn: "What are you most afraid of losing in a relationship?" },
  { id: "lq5", text: market !== "ru" ? "How do you usually show someone they matter to you?" : "Как ты обычно показываешь, что человек тебе дорог?", textRu: "Как ты обычно показываешь, что человек тебе дорог?", textEn: "How do you usually show someone they matter to you?" },
  { id: "lq6", text: market !== "ru" ? "What words would you like to hear from your partner more often?" : "Какие слова ты хотел(а) бы чаще слышать от партнёра?", textRu: "Какие слова ты хотел(а) бы чаще слышать от партнёра?", textEn: "What words would you like to hear from your partner more often?" },
  { id: "lq7", text: market !== "ru" ? "What moment in a relationship do you consider the warmest?" : "Какой момент в отношениях ты считаешь самым тёплым?", textRu: "Какой момент в отношениях ты считаешь самым тёплым?", textEn: "What moment in a relationship do you consider the warmest?" },
  { id: "lq8", text: market !== "ru" ? "What makes someone truly reliable to you?" : "Что делает человека по-настоящему надёжным для тебя?", textRu: "Что делает человека по-настоящему надёжным для тебя?", textEn: "What makes someone truly reliable to you?" },
  { id: "lq9", text: market !== "ru" ? "How do you know you can trust someone?" : "Как ты понимаешь, что можешь доверять человеку?", textRu: "Как ты понимаешь, что можешь доверять человеку?", textEn: "How do you know you can trust someone?" },
  { id: "lq10", text: market !== "ru" ? "What gives you a sense of safety in a relationship?" : "Что в отношениях даёт тебе чувство безопасности?", textRu: "Что в отношениях даёт тебе чувство безопасности?", textEn: "What gives you a sense of safety in a relationship?" },
  { id: "lq11", text: market !== "ru" ? "What's hard for you to talk about even with someone close?" : "О чём тебе бывает сложно говорить даже с близким человеком?", textRu: "О чём тебе бывает сложно говорить даже с близким человеком?", textEn: "What's hard for you to talk about even with someone close?" },
  { id: "lq12", text: market !== "ru" ? "How do you act when you're hurt?" : "Как ты ведёшь себя, когда обижаешься?", textRu: "Как ты ведёшь себя, когда обижаешься?", textEn: "How do you act when you're hurt?" },
  { id: "lq13", text: market !== "ru" ? "What helps you make up after a fight?" : "Что тебе помогает мириться после ссоры?", textRu: "Что тебе помогает мириться после ссоры?", textEn: "What helps you make up after a fight?" },
  { id: "lq14", text: market !== "ru" ? "What can make you stay angry for a long time?" : "За что ты можешь долго злиться?", textRu: "За что ты можешь долго злиться?", textEn: "What can make you stay angry for a long time?" },
  { id: "lq15", text: market !== "ru" ? "What would you never want to go through again in a relationship?" : "Что бы ты никогда не хотел(а) пережить в отношениях снова?", textRu: "Что бы ты никогда не хотел(а) пережить в отношениях снова?", textEn: "What would you never want to go through again in a relationship?" },
  { id: "lq16", text: market !== "ru" ? "What's your strongest need in love?" : "Какая твоя самая сильная потребность в любви?", textRu: "Какая твоя самая сильная потребность в любви?", textEn: "What's your strongest need in love?" },
  { id: "lq17", text: market !== "ru" ? "What actions hurt you more than words?" : "Какие поступки ранят тебя сильнее слов?", textRu: "Какие поступки ранят тебя сильнее слов?", textEn: "What actions hurt you more than words?" },
  { id: "lq18", text: market !== "ru" ? "How do you know someone is really listening to you?" : "Как ты понимаешь, что человек тебя слышит?", textRu: "Как ты понимаешь, что человек тебя слышит?", textEn: "How do you know someone is really listening to you?" },
  { id: "lq19", text: market !== "ru" ? "What do you need from a loved one on a hard day?" : "Что тебе нужно в трудный день от любимого человека?", textRu: "Что тебе нужно в трудный день от любимого человека?", textEn: "What do you need from a loved one on a hard day?" },
  { id: "lq20", text: market !== "ru" ? "What does ideal emotional support look like to you?" : "Как выглядит идеальная эмоциональная поддержка для тебя?", textRu: "Как выглядит идеальная эмоциональная поддержка для тебя?", textEn: "What does ideal emotional support look like to you?" },
  { id: "lq21", text: market !== "ru" ? "What matters more to you: passion, friendship, or calm in a relationship?" : "Что для тебя важнее: страсть, дружба или спокойствие в отношениях?", textRu: "Что для тебя важнее: страсть, дружба или спокойствие в отношениях?", textEn: "What matters more to you: passion, friendship, or calm in a relationship?" },
  { id: "lq22", text: market !== "ru" ? "What do you consider a red flag in a relationship?" : "Что ты считаешь красным флагом в отношениях?", textRu: "Что ты считаешь красным флагом в отношениях?", textEn: "What do you consider a red flag in a relationship?" },
  { id: "lq23", text: market !== "ru" ? "What helps you open up to someone?" : "Что помогает тебе открываться человеку?", textRu: "Что помогает тебе открываться человеку?", textEn: "What helps you open up to someone?" },
  { id: "lq24", text: market !== "ru" ? "When do you feel especially vulnerable?" : "В какой момент ты чувствуешь себя особенно уязвимым(ой)?", textRu: "В какой момент ты чувствуешь себя особенно уязвимым(ой)?", textEn: "When do you feel especially vulnerable?" },
  { id: "lq25", text: market !== "ru" ? "How do you react when you're jealous?" : "Как ты реагируешь, когда ревнуешь?", textRu: "Как ты реагируешь, когда ревнуешь?", textEn: "How do you react when you're jealous?" },
  { id: "lq26", text: market !== "ru" ? "What already counts as cheating for you?" : "Что для тебя уже считается изменой?", textRu: "Что для тебя уже считается изменой?", textEn: "What already counts as cheating for you?" },
  { id: "lq27", text: market !== "ru" ? "How do you understand the word \\u2018faithfulness\\u2019?" : "Как ты понимаешь слово «верность»?", textRu: "Как ты понимаешь слово «верность»?", textEn: "How do you understand the word \\u2018faithfulness\\u2019?" },
  { id: "lq28", text: market !== "ru" ? "What's important for you to keep private even in a relationship?" : "Что тебе важно сохранять личным даже в отношениях?", textRu: "Что тебе важно сохранять личным даже в отношениях?", textEn: "What's important for you to keep private even in a relationship?" },
  { id: "lq29", text: market !== "ru" ? "What kind of freedom in a couple feels healthy to you?" : "Какой формат свободы в паре тебе кажется здоровым?", textRu: "Какой формат свободы в паре тебе кажется здоровым?", textEn: "What kind of freedom in a couple feels healthy to you?" },
  { id: "lq30", text: market !== "ru" ? "What calms you down when anxiety shows up in a relationship?" : "Что тебя успокаивает, когда в отношениях появляется тревога?", textRu: "Что тебя успокаивает, когда в отношениях появляется тревога?", textEn: "What calms you down when anxiety shows up in a relationship?" },
  { id: "lq31", text: market !== "ru" ? "What kind of future do you dream of with someone you love?" : "О каком будущем с любимым человеком ты мечтаешь?", textRu: "О каком будущем с любимым человеком ты мечтаешь?", textEn: "What kind of future do you dream of with someone you love?" },
  { id: "lq32", text: market !== "ru" ? "Are you more about stability or intense emotions?" : "Ты больше про стабильность или про яркие эмоции?", textRu: "Ты больше про стабильность или про яркие эмоции?", textEn: "Are you more about stability or intense emotions?" },
  { id: "lq33", text: market !== "ru" ? "What does \\u2018being a team\\u2019 mean to you?" : "Что для тебя значит «быть командой»?", textRu: "Что для тебя значит «быть командой»?", textEn: "What does \\u2018being a team\\u2019 mean to you?" },
  { id: "lq34", text: market !== "ru" ? "What family values matter most to you?" : "Какие семейные ценности тебе особенно близки?", textRu: "Какие семейные ценности тебе особенно близки?", textEn: "What family values matter most to you?" },
  { id: "lq35", text: market !== "ru" ? "What does your ideal evening together look like?" : "Как ты представляешь идеальный совместный вечер?", textRu: "Как ты представляешь идеальный совместный вечер?", textEn: "What does your ideal evening together look like?" },
  { id: "lq36", text: market !== "ru" ? "What kind of vacation with a loved one appeals to you most?" : "Какой отдых с любимым человеком тебе ближе всего?", textRu: "Какой отдых с любимым человеком тебе ближе всего?", textEn: "What kind of vacation with a loved one appeals to you most?" },
  { id: "lq37", text: market !== "ru" ? "What small thing in a relationship makes you happy?" : "Какая мелочь в отношениях делает тебя счастливым(ой)?", textRu: "Какая мелочь в отношениях делает тебя счастливым(ой)?", textEn: "What small thing in a relationship makes you happy?" },
  { id: "lq38", text: market !== "ru" ? "What do you value most in being cared for?" : "Что ты особенно ценишь в заботе?", textRu: "Что ты особенно ценишь в заботе?", textEn: "What do you value most in being cared for?" },
  { id: "lq39", text: market !== "ru" ? "What couple rituals do you enjoy?" : "Какие ритуалы в паре тебе нравятся?", textRu: "Какие ритуалы в паре тебе нравятся?", textEn: "What couple rituals do you enjoy?" },
  { id: "lq40", text: market !== "ru" ? "How do you feel about surprises in a relationship?" : "Как ты относишься к сюрпризам в отношениях?", textRu: "Как ты относишься к сюрпризам в отношениях?", textEn: "How do you feel about surprises in a relationship?" },
  { id: "lq41", text: market !== "ru" ? "When do you feel romance most strongly?" : "Когда ты чувствуешь романтику сильнее всего?", textRu: "Когда ты чувствуешь романтику сильнее всего?", textEn: "When do you feel romance most strongly?" },
  { id: "lq42", text: market !== "ru" ? "Which dates do you prefer: quiet or exciting ones?" : "Какие свидания тебе нравятся больше: тихие или яркие?", textRu: "Какие свидания тебе нравятся больше: тихие или яркие?", textEn: "Which dates do you prefer: quiet or exciting ones?" },
  { id: "lq43", text: market !== "ru" ? "What does it mean to you to feel desired?" : "Что для тебя значит быть желанным(ой)?", textRu: "Что для тебя значит быть желанным(ой)?", textEn: "What does it mean to you to feel desired?" },
  { id: "lq44", text: market !== "ru" ? "What's your favorite form of tenderness?" : "Какая твоя любимая форма нежности?", textRu: "Какая твоя любимая форма нежности?", textEn: "What's your favorite form of tenderness?" },
  { id: "lq45", text: market !== "ru" ? "How do you know someone truly accepts you?" : "Как ты понимаешь, что тебя по-настоящему принимают?", textRu: "Как ты понимаешь, что тебя по-настоящему принимают?", textEn: "How do you know someone truly accepts you?" },
  { id: "lq46", text: market !== "ru" ? "What would you like to do more often with your partner?" : "Что тебе хотелось бы чаще делать вместе с партнёром?", textRu: "Что тебе хотелось бы чаще делать вместе с партнёром?", textEn: "What would you like to do more often with your partner?" },
  { id: "lq47", text: market !== "ru" ? "What would you like to try for the first time in a relationship?" : "Что бы ты хотел(а) попробовать в отношениях впервые?", textRu: "Что бы ты хотел(а) попробовать в отношениях впервые?", textEn: "What would you like to try for the first time in a relationship?" },
  { id: "lq48", text: market !== "ru" ? "What dream would you like to share with someone you love?" : "Какую мечту ты бы хотел(а) разделить с любимым человеком?", textRu: "Какую мечту ты бы хотел(а) разделить с любимым человеком?", textEn: "What dream would you like to share with someone you love?" },
  { id: "lq49", text: market !== "ru" ? "What conversation between you two do you consider the most important?" : "Какой разговор между вами ты считаешь самым важным?", textRu: "Какой разговор между вами ты считаешь самым важным?", textEn: "What conversation between you two do you consider the most important?" },
  { id: "lq50", text: market !== "ru" ? "What's the hardest thing for you to apologize for?" : "За что тебе сложнее всего просить прощения?", textRu: "За что тебе сложнее всего просить прощения?", textEn: "What's the hardest thing for you to apologize for?" },
  { id: "lq51", text: market !== "ru" ? "What do you expect from a partner during hard times?" : "Чего ты ждёшь от партнёра в трудные периоды жизни?", textRu: "Чего ты ждёшь от партнёра в трудные периоды жизни?", textEn: "What do you expect from a partner during hard times?" },
  { id: "lq52", text: market !== "ru" ? "What helps you feel connected again after some distance?" : "Что тебе помогает чувствовать связь после дистанции?", textRu: "Что тебе помогает чувствовать связь после дистанции?", textEn: "What helps you feel connected again after some distance?" },
  { id: "lq53", text: market !== "ru" ? "What matters more to you: attention or actions?" : "Что для тебя важнее: внимание или действия?", textRu: "Что для тебя важнее: внимание или действия?", textEn: "What matters more to you: attention or actions?" },
  { id: "lq54", text: market !== "ru" ? "What compliment stays with you for a long time?" : "Какой комплимент запоминается тебе надолго?", textRu: "Какой комплимент запоминается тебе надолго?", textEn: "What compliment stays with you for a long time?" },
  { id: "lq55", text: market !== "ru" ? "What would you like to change about your own behavior in relationships?" : "Что бы ты хотел(а) изменить в своём поведении в отношениях?", textRu: "Что бы ты хотел(а) изменить в своём поведении в отношениях?", textEn: "What would you like to change about your own behavior in relationships?" },
  { id: "lq56", text: market !== "ru" ? "What lesson did a past relationship teach you?" : "Какой урок тебе дали прошлые отношения?", textRu: "Какой урок тебе дали прошлые отношения?", textEn: "What lesson did a past relationship teach you?" },
  { id: "lq57", text: market !== "ru" ? "What do you protect most carefully in love?" : "Что ты особенно бережёшь в любви?", textRu: "Что ты особенно бережёшь в любви?", textEn: "What do you protect most carefully in love?" },
  { id: "lq58", text: market !== "ru" ? "What promises in a relationship are sacred to you?" : "Какие обещания в отношениях для тебя священны?", textRu: "Какие обещания в отношениях для тебя священны?", textEn: "What promises in a relationship are sacred to you?" },
  { id: "lq59", text: market !== "ru" ? "How do you know the two of you are truly drawn to each other?" : "Как ты понимаешь, что вас двоих тянет друг к другу по-настоящему?", textRu: "Как ты понимаешь, что вас двоих тянет друг к другу по-настоящему?", textEn: "How do you know the two of you are truly drawn to each other?" },
  { id: "lq60", text: market !== "ru" ? "When is it especially important for you to just be close in silence?" : "Когда тебе бывает особенно важно побыть рядом молча?", textRu: "Когда тебе бывает особенно важно побыть рядом молча?", textEn: "When is it especially important for you to just be close in silence?" },
  { id: "lq61", text: market !== "ru" ? "What do you wish your partner understood better about you?" : "Что бы ты хотел(а), чтобы партнёр лучше понимал о тебе?", textRu: "Что бы ты хотел(а), чтобы партнёр лучше понимал о тебе?", textEn: "What do you wish your partner understood better about you?" },
  { id: "lq62", text: market !== "ru" ? "How do you cope with distance growing in a relationship?" : "Как ты переживаешь отдаление в отношениях?", textRu: "Как ты переживаешь отдаление в отношениях?", textEn: "How do you cope with distance growing in a relationship?" },
  { id: "lq63", text: market !== "ru" ? "What helps you grow close again after tension?" : "Что помогает тебе снова сближаться после напряжения?", textRu: "Что помогает тебе снова сближаться после напряжения?", textEn: "What helps you grow close again after tension?" },
  { id: "lq64", text: market !== "ru" ? "What weakness of yours shows up most often in love?" : "Какая твоя слабая сторона чаще всего проявляется в любви?", textRu: "Какая твоя слабая сторона чаще всего проявляется в любви?", textEn: "What weakness of yours shows up most often in love?" },
  { id: "lq65", text: market !== "ru" ? "What do you especially need but rarely talk about?" : "В чём ты особенно нуждаешься, но редко об этом говоришь?", textRu: "В чём ты особенно нуждаешься, но редко об этом говоришь?", textEn: "What do you especially need but rarely talk about?" },
  { id: "lq66", text: market !== "ru" ? "What's harder for you: trusting someone or keeping your feelings intact?" : "Что тебе сложнее: довериться или сохранить чувства?", textRu: "Что тебе сложнее: довериться или сохранить чувства?", textEn: "What's harder for you: trusting someone or keeping your feelings intact?" },
  { id: "lq67", text: market !== "ru" ? "What act could restore your faith in relationships?" : "Какой поступок может вернуть тебе веру в отношения?", textRu: "Какой поступок может вернуть тебе веру в отношения?", textEn: "What act could restore your faith in relationships?" },
  { id: "lq68", text: market !== "ru" ? "What's important for you to hear after a fight?" : "Что тебе важно слышать после ссоры?", textRu: "Что тебе важно слышать после ссоры?", textEn: "What's important for you to hear after a fight?" },
  { id: "lq69", text: market !== "ru" ? "How do you know a relationship is becoming serious?" : "Как ты понимаешь, что отношения становятся серьёзными?", textRu: "Как ты понимаешь, что отношения становятся серьёзными?", textEn: "How do you know a relationship is becoming serious?" },
  { id: "lq70", text: market !== "ru" ? "What boundaries are non-negotiable for you in love?" : "Какие границы для тебя обязательны в любви?", textRu: "Какие границы для тебя обязательны в любви?", textEn: "What boundaries are non-negotiable for you in love?" },
  { id: "lq71", text: market !== "ru" ? "What do you value in a person more than looks?" : "Что ты ценишь в человеке сильнее внешности?", textRu: "Что ты ценишь в человеке сильнее внешности?", textEn: "What do you value in a person more than looks?" },
  { id: "lq72", text: market !== "ru" ? "What trait makes a person especially attractive?" : "Какая черта делает человека особенно привлекательным?", textRu: "Какая черта делает человека особенно привлекательным?", textEn: "What trait makes a person especially attractive?" },
  { id: "lq73", text: market !== "ru" ? "What inspires you to love more deeply?" : "Что тебя вдохновляет любить сильнее?", textRu: "Что тебя вдохновляет любить сильнее?", textEn: "What inspires you to love more deeply?" },
  { id: "lq74", text: market !== "ru" ? "How do you feel about showing vulnerability to someone you love?" : "Как ты относишься к проявлению слабости перед любимым человеком?", textRu: "Как ты относишься к проявлению слабости перед любимым человеком?", textEn: "How do you feel about showing vulnerability to someone you love?" },
  { id: "lq75", text: market !== "ru" ? "What gives you a sense of \\u2018us\\u2019?" : "Что даёт тебе чувство «мы»?", textRu: "Что даёт тебе чувство «мы»?", textEn: "What gives you a sense of \\u2018us\\u2019?" },
  { id: "lq76", text: market !== "ru" ? "In what moments do you especially need support?" : "В каких моментах тебе особенно нужна поддержка?", textRu: "В каких моментах тебе особенно нужна поддержка?", textEn: "In what moments do you especially need support?" },
  { id: "lq77", text: market !== "ru" ? "What does a happy life together look like to you?" : "Как ты представляешь счастливую совместную жизнь?", textRu: "Как ты представляешь счастливую совместную жизнь?", textEn: "What does a happy life together look like to you?" },
  { id: "lq78", text: market !== "ru" ? "What matters more to you: matching personalities or effort for each other?" : "Что для тебя важнее: совпадение характеров или усилия друг ради друга?", textRu: "Что для тебя важнее: совпадение характеров или усилия друг ради друга?", textEn: "What matters more to you: matching personalities or effort for each other?" },
  { id: "lq79", text: market !== "ru" ? "What words of love sound the most sincere to you?" : "Какие слова любви для тебя звучат наиболее искренне?", textRu: "Какие слова любви для тебя звучат наиболее искренне?", textEn: "What words of love sound the most sincere to you?" },
  { id: "lq80", text: market !== "ru" ? "What would you like to do more often for someone you love?" : "Что ты хотел(а) бы чаще делать для любимого человека?", textRu: "Что ты хотел(а) бы чаще делать для любимого человека?", textEn: "What would you like to do more often for someone you love?" },
  { id: "lq81", text: market !== "ru" ? "What do you dream of telling your partner but keep putting off?" : "О чём ты мечтаешь рассказать партнёру, но всё откладываешь?", textRu: "О чём ты мечтаешь рассказать партнёру, но всё откладываешь?", textEn: "What do you dream of telling your partner but keep putting off?" },
  { id: "lq82", text: market !== "ru" ? "What shared goal could make your relationship stronger?" : "Какая общая цель могла бы сделать вашу пару сильнее?", textRu: "Какая общая цель могла бы сделать вашу пару сильнее?", textEn: "What shared goal could make your relationship stronger?" },
  { id: "lq83", text: market !== "ru" ? "What fear about love would you like to let go of?" : "Какой страх в любви тебе хотелось бы отпустить?", textRu: "Какой страх в любви тебе хотелось бы отпустить?", textEn: "What fear about love would you like to let go of?" },
  { id: "lq84", text: market !== "ru" ? "What makes a relationship feel mature to you?" : "Что делает отношения для тебя зрелыми?", textRu: "Что делает отношения для тебя зрелыми?", textEn: "What makes a relationship feel mature to you?" },
  { id: "lq85", text: market !== "ru" ? "How do you know someone can be called \\u2018yours\\u2019?" : "Как ты понимаешь, что человека можно назвать «своим»?", textRu: "Как ты понимаешь, что человека можно назвать «своим»?", textEn: "How do you know someone can be called \\u2018yours\\u2019?" },
  { id: "lq86", text: market !== "ru" ? "What would you like to keep in a relationship for years to come?" : "Что бы ты хотел(а) сохранить в отношениях на долгие годы?", textRu: "Что бы ты хотел(а) сохранить в отношениях на долгие годы?", textEn: "What would you like to keep in a relationship for years to come?" },
  { id: "lq87", text: market !== "ru" ? "How do you feel about complete honesty in love?" : "Как ты относишься к полной честности в любви?", textRu: "Как ты относишься к полной честности в любви?", textEn: "How do you feel about complete honesty in love?" },
  { id: "lq88", text: market !== "ru" ? "What would you like to hear from your partner right now?" : "Что бы ты хотел(а) услышать от партнёра прямо сейчас?", textRu: "Что бы ты хотел(а) услышать от партнёра прямо сейчас?", textEn: "What would you like to hear from your partner right now?" },
  { id: "lq89", text: market !== "ru" ? "What dream about love have you had since childhood?" : "Какая мечта о любви у тебя была с детства?", textRu: "Какая мечта о любви у тебя была с детства?", textEn: "What dream about love have you had since childhood?" },
  { id: "lq90", text: market !== "ru" ? "What does it mean to you to truly love someone?" : "Что для тебя значит любить по-настоящему?", textRu: "Что для тебя значит любить по-настоящему?", textEn: "What does it mean to you to truly love someone?" },
];

const PAIR_LEVELS_RU = [
  { level: 1, title: "Новички", points: 0 },
  { level: 2, title: "Искра", points: 300 },
  { level: 3, title: "Сближение", points: 700 },
  { level: 4, title: "Тёплая связь", points: 1200 },
  { level: 5, title: "На одной волне", points: 1800 },
  { level: 6, title: "Сильная пара", points: 2500 },
  { level: 7, title: "Идеальный союз", points: 3500 },
  { level: 8, title: "Легенды любви", points: 5000 },
] as const;

const PAIR_LEVELS_EN = [
  { level: 1, title: "Newcomers", points: 0 },
  { level: 2, title: "Spark", points: 300 },
  { level: 3, title: "Growing Closer", points: 700 },
  { level: 4, title: "Warm Bond", points: 1200 },
  { level: 5, title: "In Sync", points: 1800 },
  { level: 6, title: "Strong Couple", points: 2500 },
  { level: 7, title: "Perfect Match", points: 3500 },
  { level: 8, title: "Legends of Love", points: 5000 },
] as const;

const PAIR_LEVELS_FI = [
  { level: 1, title: "Aloittelijat", points: 0 },
  { level: 2, title: "Kipinä", points: 300 },
  { level: 3, title: "Lähentyminen", points: 700 },
  { level: 4, title: "Lämmin side", points: 1200 },
  { level: 5, title: "Samalla aaltopituudella", points: 1800 },
  { level: 6, title: "Vahva pari", points: 2500 },
  { level: 7, title: "Täydellinen liitto", points: 3500 },
  { level: 8, title: "Rakkauden legendat", points: 5000 },
] as const;

const PAIR_LEVELS =
  market === "fi"
    ? PAIR_LEVELS_FI
    : market === "en"
    ? PAIR_LEVELS_EN
    : PAIR_LEVELS_RU;

function getRelationshipCheckResult(answers: number[]) {
  const positiveCategories = new Set(["closeness", "support"]);

  const categoryScores: Record<string, number> = {
    communication: 0,
    trust: 0,
    conflicts: 0,
    closeness: 0,
    support: 0,
    resentment: 0,
  };

  const categoryCounts: Record<string, number> = {
    communication: 0,
    trust: 0,
    conflicts: 0,
    closeness: 0,
    support: 0,
    resentment: 0,
  };

  answers.forEach((value, index) => {
    const q = RELATIONSHIP_CHECK_QUESTIONS[index];
    if (!q) return;

    let normalized = value;

    if (positiveCategories.has(q.category)) {
      normalized = 2 - value;
    }

    categoryScores[q.category] += normalized;
    categoryCounts[q.category] += 1;
  });

  const averages = Object.fromEntries(
    Object.keys(categoryScores).map((key) => [
      key,
      categoryCounts[key] ? categoryScores[key] / categoryCounts[key] : 0,
    ])
  ) as Record<string, number>;

  const sortedProblemZones = Object.entries(averages)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);

  const mainZone = sortedProblemZones[0];
  const secondZone = sortedProblemZones[1];

  const categoryTitles: Record<string, string> =
    market !== "ru"
      ? {
          communication: "communication",
          trust: "trust",
          conflicts: "conflicts",
          closeness: "closeness",
          support: "support",
          resentment: "resentment",
        }
      : {
          communication: "общение",
          trust: "доверие",
          conflicts: "конфликты",
          closeness: "близость",
          support: "поддержка",
          resentment: "обиды",
        };

  const overallScore =
    Object.values(averages).reduce((sum, value) => sum + value, 0) /
    Object.values(averages).length;

  let title = "";
  let subtitle = "";
  let description = "";
  let advice: string[] = [];

  if (overallScore >= 1.35) {
    if (market !== "ru") {
      title = "There's noticeable tension in the relationship right now";
      subtitle = `Main risk zones: ${categoryTitles[mainZone]} and ${categoryTitles[secondZone]}`;
      description =
        "Your answers suggest you might currently be missing a sense of safety, clarity, and easy contact. That doesn't mean the relationship is bad, but it does point to built-up tension that's better not to ignore.";
      advice = [
        "Pick one specific problem and discuss only that, without mixing everything together",
        "Ask each other: what hurts me the most right now?",
        "Give each other understanding and validation first, before defensiveness",
      ];
    } else {
      title = "Сейчас в отношениях есть заметное напряжение";
      subtitle = `Главные зоны риска: ${categoryTitles[mainZone]} и ${categoryTitles[secondZone]}`;
      description =
        "По ответам видно, что вам сейчас может не хватать ощущения безопасности, ясности и лёгкого контакта. Это не означает, что отношения плохие, но говорит о накопившемся напряжении, которое лучше не игнорировать.";
      advice = [
        "Выберите одну конкретную проблему и обсудите только её, не смешивая всё сразу",
        "Спросите друг друга: что сейчас ранит меня сильнее всего?",
        "Дайте друг другу не защиту, а сначала понимание и подтверждение чувств",
      ];
    }
  } else if (overallScore >= 0.8) {
    if (market !== "ru") {
      title = "The couple has good potential, but there are vulnerable spots";
      subtitle = `Worth paying more attention to: ${categoryTitles[mainZone]}`;
      description =
        "Your relationship doesn't look like it's in crisis, but there are recurring moments that gradually create distance. With some effort, this can improve fairly quickly through more honest dialogue and mutual support.";
      advice = [
        "Once a week, have a calm conversation without phones and without rushing",
        "Talk about what helps each of you feel close",
        "Notice not just the problems, but what's already working well between you",
      ];
    } else {
      title = "У пары хороший потенциал, но есть уязвимые места";
      subtitle = `Больше внимания стоит дать теме: ${categoryTitles[mainZone]}`;
      description =
        "Ваши отношения не выглядят кризисными, но в них есть повторяющиеся моменты, которые постепенно создают дистанцию. При желании это можно довольно быстро улучшить через более честный диалог и взаимную поддержку.";
      advice = [
        "Раз в неделю устраивайте спокойный разговор без телефонов и спешки",
        "Проговорите, что помогает каждому из вас чувствовать близость",
        "Замечайте не только проблемы, но и то, что у вас уже получается хорошо",
      ];
    }
  } else {
    if (market !== "ru") {
      title = "Your couple has a fairly healthy emotional foundation";
      subtitle = "There's already a solid base between you that's worth protecting";
      description =
        "Your answers show enough contact, support, and ability to work things out together. This is a good foundation, and right now what matters more isn't 'saving' the relationship, but carefully strengthening what's already working.";
      advice = [
        "Keep the habit of talking to each other openly",
        "Keep up warm rituals: dates, conversations, small acts of care",
        "Every so often, talk not just about problems but about wishes in the relationship",
      ];
    } else {
      title = "У вашей пары довольно здоровая эмоциональная база";
      subtitle = "Между вами уже есть опора, которую важно сохранять";
      description =
        "По ответам видно, что в отношениях достаточно контакта, поддержки и способности договариваться. Это хорошая основа, и сейчас для вас важнее не 'спасать' отношения, а продолжать бережно укреплять то, что уже работает.";
      advice = [
        "Сохраняйте привычку говорить друг с другом открыто",
        "Поддерживайте тёплые ритуалы: свидания, разговоры, маленькую заботу",
        "Периодически обсуждайте не только проблемы, но и желания в отношениях",
      ];
    }
  }

  const zones = Object.entries(averages)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => ({
      key,
      title: categoryTitles[key],
      score: value,
      label:
        market !== "ru"
          ? value >= 1.35
            ? "Needs attention"
            : value >= 0.8
            ? "Room to grow"
            : "Strong zone"
          : value >= 1.35
          ? "Нужно внимание"
          : value >= 0.8
          ? "Есть над чем работать"
          : "Сильная зона",
    }));

  return {
    title,
    subtitle,
    description,
    advice,
    zones,
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
  soloPoints: 0,
  soloWeeklyPoints: 0,
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
  weeklyPoints: 0,

  dailyTestsUsed: 0,
  dailyPollsUsed: 0,
  dailyGamesUsed: 0,
  dailyLimitDate: null,
  isPremium: false,
  weeklyTopRewardClaimedWeek: null,
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
  onLeavePair,
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
  onLeavePair: () => void;
  t: any;
}) {
  const hasPairCreated = !!pair.pairId;
  const hasPartnerConnected = !!pair.partner;
  const hasFullPair = hasPairCreated && hasPartnerConnected;

  const [confirmingLeavePair, setConfirmingLeavePair] = useState(false);

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
  {t.pair.dailyQuestionHint}
</div>
<div
  style={{
    marginTop: 6,
    fontSize: 12,
    color: "#6b5cff",
    fontWeight: 700,
  }}
>
  🔥 {t.pair.streakDaysLabel}: {dailyPairStreak?.current || 0} {t.pair.streakDaysWord}
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
  {hasFullPair ? t.pair.youAreInPair : t.pair.youCreatedPair}
</div>

<div
  style={{
    marginTop: 6,
    fontSize: 13,
    color: "#4b446a",
  }}
>
  {t.pair.keepGettingToKnow}
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
                  {t.pair.sendCodeOrLink}
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
                    <div style={{ color: "#2c2647", fontWeight: 700 }}>{t.pair.you}</div>
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
                        .join(" ") || t.pair.defaultUserName}
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
                      {t.pair.partner}
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
                        ? `${pair.partner?.firstName || t.pair.connectedFallback}${
                            pair.partner?.lastName
                              ? ` ${pair.partner.lastName}`
                              : ""
                          }`
                        : t.pair.partnerNotConnectedYet}
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
  : t.pair.partnerNotJoinedYet}
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
                      {t.pair.currentLevel}
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
                        ? // Берём из pairLevel (посчитан от очков ПАРЫ), а
                          // не из points — тот был солo-балансом
                          // пользователя и не совпадал с самим прогресс-баром.
                          `${
                            pairLevel.currentLevelPoints +
                            pairLevel.progressInLevel
                          } / ${pairLevel.nextLevelPoints}`
                        : t.pair.maxLevel}
                    </span>

                    <span>
                      {pairLevel.nextLevelPoints
                        ? `${t.pair.untilNext}: ${
                            pairLevel.progressMax - pairLevel.progressInLevel
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
                <div style={{ flex: 1, minWidth: 0 }}>
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
  ? `${t.pair.compatibilityCalculatedPrefix}${compatibilityProfile.completedThemes}${t.pair.compatibilityCalculatedMid}${compatibilityProfile.totalThemes}${t.pair.compatibilityCalculatedSuffix}`
  : t.pair.takePollsPrompt}
                  </div>

                  {compatibilityProfile.completedThemes === 0 && (
                    <button
                      type="button"
                      onClick={onOpenPolls}
                      style={{
                        ...primaryButtonStyle,
                        width: "100%",
                        marginTop: 14,
                      }}
                    >
                      {t.pair.takePollsButton}
                    </button>
                  )}
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

              {compatibilityProfile.completedThemes > 0 && (
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
                    {compatibilityProfile.overallPercent}%
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      color: "#4d466c",
                      fontSize: 14,
                      lineHeight: 1.45,
                    }}
                  >
                    {compatibilityProfile.pairType}
                  </div>

                  <div
                    style={{
                      marginTop: 12,
                      color: "#5a5378",
                      fontSize: 12,
                      lineHeight: 1.45,
                    }}
                  >
                    {t.pair.themesCompletedPrefix}{pairStats.completedThemes}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {hasPairCreated && (
        <div style={{ ...cardBaseStyle(), padding: 16 }}>
          {confirmingLeavePair ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#8a2f2f" }}>
                {t.pair.leavePairConfirmText}
              </div>
              <button
                onClick={onLeavePair}
                style={{
                  border: "none",
                  borderRadius: 16,
                  padding: "12px 16px",
                  background: "#c1352f",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                {t.pair.leavePairConfirmButton}
              </button>
              <button
                onClick={() => setConfirmingLeavePair(false)}
                style={secondaryButtonStyle}
              >
                {t.pair.leavePairCancelButton}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingLeavePair(true)}
              style={{
                border: "1px solid rgba(193,53,47,0.35)",
                borderRadius: 16,
                padding: "12px 16px",
                background: "rgba(193,53,47,0.08)",
                color: "#8a2f2f",
                fontWeight: 800,
                fontSize: 14,
                cursor: "pointer",
                width: "100%",
              }}
            >
              {t.pair.leavePairButton}
            </button>
          )}
        </div>
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
  onOpenPolls,
}: {
  appState: AppState;
  onBack: () => void;
  onOpenPolls: () => void;
}) {
  const market = getMarket();
  const t = market === "fi" ? TEXT_FI : market === "en" ? TEXT_EN : TEXT_RU;
  const profile = buildCompatibilityProfile(appState.pollAnswers || {});
  const hasData = profile.completedThemes > 0;

  if (!hasData) {
    return (
      <div style={{ padding: 12, display: "grid", gap: 10 }}>
        <div
          style={{
            ...cardBaseStyle(),
            padding: 28,
            textAlign: "center",
            background:
              "linear-gradient(160deg, rgba(143,107,255,0.16), rgba(255,118,186,0.14))",
          }}
        >
          <div style={{ fontSize: 44, lineHeight: 1 }}>💞</div>

          <div
            style={{
              marginTop: 14,
              fontSize: 20,
              fontWeight: 900,
              color: "#1f1d3a",
            }}
          >
            {t.pair.compatibilityInfo.notCalculatedTitle}
          </div>

          <div
            style={{
              marginTop: 10,
              fontSize: 14.5,
              lineHeight: 1.55,
              color: "#5b547d",
            }}
          >
            {t.pair.compatibilityInfo.notCalculatedText}
          </div>

          <button
            type="button"
            onClick={onOpenPolls}
            style={{ ...primaryButtonStyle, width: "100%", marginTop: 20 }}
          >
            {t.pair.takePollsButton}
          </button>

          <div
            style={{
              marginTop: 14,
              fontSize: 13,
              color: "#7a7396",
            }}
          >
            {t.pair.compatibilityCalculatedPrefix}0{t.pair.compatibilityCalculatedMid}{profile.totalThemes}{t.pair.compatibilityCalculatedSuffix}
          </div>
        </div>

        <button onClick={onBack} style={secondaryButtonStyle}>
          {t.common.back}
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 12, display: "grid", gap: 10 }}>
      <div
        style={{
          ...cardBaseStyle(),
          padding: 20,
          textAlign: "center",
          background:
            "linear-gradient(160deg, rgba(143,107,255,0.18), rgba(255,118,186,0.16))",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 800, color: "#5b547d" }}>
          💞 {t.pair.compatibilityInfo.headerLabel}
        </div>

        <div
          style={{
            marginTop: 10,
            fontSize: 58,
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
            marginTop: 10,
            display: "inline-block",
            padding: "6px 16px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.55)",
            fontSize: 16,
            fontWeight: 900,
            color: "#6b46ff",
          }}
        >
          {profile.pairType}
        </div>

        <div
          style={{
            marginTop: 14,
            fontSize: 14.5,
            lineHeight: 1.55,
            color: "#4d466c",
            textAlign: "left",
          }}
        >
          {profile.description}
        </div>

        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 18,
            background: "rgba(255,255,255,0.4)",
            border: "1px solid rgba(255,255,255,0.4)",
            fontSize: 13.5,
            color: "#615a86",
          }}
        >
          {t.pair.compatibilityCalculatedPrefix}{profile.completedThemes}{t.pair.compatibilityCalculatedMid}{profile.totalThemes}{t.pair.compatibilityCalculatedSuffix}
        </div>
      </div>

      <div style={{ ...cardBaseStyle(), padding: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: "#1f1d3a" }}>
          ✨ {t.pair.compatibilityInfo.strongSides}
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
          🌱 {t.pair.compatibilityInfo.growthZones}
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
          📊 {t.pair.compatibilityInfo.byThemes}
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
        {t.common.back}
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
  
const t = market === "fi" ? TEXT_FI : market === "en" ? TEXT_EN : TEXT_RU;
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
      alert(t.pair.invite.enterCodeAlert);
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
      alert(t.pair.invite.createFirstAlert);
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteLink);
      alert(t.pair.invite.linkCopiedAlert);
    } catch {
      alert(t.pair.invite.copyFailedAlert);
    }
  }

  function handleShareLink() {
    if (!inviteLink) {
      alert(t.pair.invite.createFirstAlert);
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
          {t.pair.invitePartner}
        </div>
        <div
          style={{
            marginTop: 8,
            color: "#3a345c",
            fontSize: 15,
            lineHeight: 1.45,
          }}
        >
          {t.pair.invite.subtitle}
        </div>
      </div>

      {!pair.inviteCode && (
        <div style={{ ...cardBaseStyle(), padding: 18 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#1f1d3a" }}>
            {t.pair.invite.createStepTitle}
          </div>

          <div
            style={{
              marginTop: 8,
              color: "#4b446a",
              lineHeight: 1.45,
              fontSize: 14,
            }}
          >
            {t.pair.invite.createStepText}
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
            {creating ? t.pair.invite.creating : t.pair.invite.createCode}
          </button>
        </div>
      )}

      {pair.inviteCode && (
        <div style={{ ...cardBaseStyle(), padding: 18 }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 900,
              color: "#1f1d3a",
            }}
          >
            {t.pair.invite.linkTitle}
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
              {t.pair.invite.copy}
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
              {t.pair.invite.shareLink}
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setShowJoinInput((prev) => !prev)}
        style={{ ...primaryButtonStyle, width: "100%", marginTop: 0 }}
      >
        {t.pair.invite.joinByCode}
      </button>

      {showJoinInput && (
        <div style={{ ...cardBaseStyle(), padding: 18 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#1f1d3a" }}>
            {t.pair.invite.enterCodeTitle}
          </div>

          <div
            style={{
              marginTop: 8,
              color: "#4b446a",
              lineHeight: 1.45,
              fontSize: 14,
            }}
          >
            {t.pair.invite.enterCodeText}
          </div>

          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder={t.pair.invite.codePlaceholder}
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
            {joining ? t.pair.invite.joining : t.pair.invite.join}
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
  const market = getMarket();
  const t = market === "fi" ? TEXT_FI : market === "en" ? TEXT_EN : TEXT_RU;

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
  const prevMilestoneDays = [...milestones]
    .reverse()
    .find((item) => item.days <= current)?.days ?? 0;

  const progressPercent = nextMilestone
    ? Math.min(
        100,
        Math.round(
          ((current - prevMilestoneDays) /
            (nextMilestone.days - prevMilestoneDays)) *
            100
        )
      )
    : 100;

  return (
    <div style={{ padding: 16, display: "grid", gap: 14 }}>


      <div
        style={{
          ...cardBaseStyle(),
          padding: 20,
          textAlign: "center",
          background:
            "linear-gradient(160deg, rgba(255,145,190,0.20), rgba(143,107,255,0.18))",
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: "#6c6487",
          }}
        >
          🔥 {t.pair.streakInfoScreen.title}
        </div>

        <div
          style={{
            marginTop: 10,
            fontSize: 46,
            fontWeight: 900,
            color: "#1f1d3a",
            lineHeight: 1,
            letterSpacing: "-0.03em",
          }}
        >
          {current} {t.pair.streakInfoScreen.daysShort}
        </div>

        <div
          style={{
            marginTop: 10,
            fontSize: 14,
            lineHeight: 1.55,
            color: "rgba(43,33,72,0.72)",
          }}
        >
          {t.pair.streakInfoScreen.description}
        </div>

        <div
          style={{
            marginTop: 16,
            padding: "14px 16px",
            borderRadius: 18,
            background: "rgba(255,255,255,0.42)",
            border: "1px solid rgba(255,255,255,0.4)",
            textAlign: "left",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 10,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#6c6487",
              }}
            >
              {t.pair.streakInfoScreen.nextBonus}
            </div>

            <div
              style={{
                fontSize: 15,
                fontWeight: 900,
                color: "#6f54ff",
              }}
            >
              {nextMilestone
                ? `${nextMilestone.days} ${t.pair.streakInfoScreen.daysShort} · +${nextMilestone.reward} ${t.bonus.pointsWord}`
                : t.pair.streakInfoScreen.maxReached}
            </div>
          </div>

          {nextMilestone && (
            <div
              style={{
                marginTop: 10,
                height: 8,
                borderRadius: 999,
                background: "rgba(255,255,255,0.6)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: "linear-gradient(90deg,#8f6bff,#ff76ba)",
                }}
              />
            </div>
          )}
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
          🏆 {t.pair.streakInfoScreen.milestonesTitle}
        </div>

        <div
          style={{
            marginTop: 8,
            fontSize: 14,
            lineHeight: 1.45,
            color: "rgba(43,33,72,0.72)",
          }}
        >
          {t.pair.streakInfoScreen.milestonesDesc}
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
                      opacity: reached ? 1 : 0.35,
                      filter: reached ? "none" : "grayscale(1)",
                    }}
                  >
                    {icon}
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
                      {t.pair.streakInfoScreen.reached}
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
                      {t.pair.streakInfoScreen.next}
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
                  {t.pair.streakInfoScreen.daysInARow}
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

type AiPsychologistMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  pairContextUsed?: boolean;
};

const AI_PSYCHOLOGIST_STARTERS_RU = [
  "Мы поссорились",
  "Хочу понять партнёра",
  "Помоги найти компромисс",
  "Мне не хватает внимания",
  "Ревность",
  "Помоги написать сообщение",
];

const AI_PSYCHOLOGIST_STARTERS_EN = [
  "We had a fight",
  "I want to understand my partner",
  "Help me find a compromise",
  "I'm not getting enough attention",
  "Jealousy",
  "Help me write a message",
];

// Универсальный чат с AI-психологом — настоящий LLM (OpenAI, через
// /api/psychologist/*), в отличие от старого детерминированного
// опросника (см. RELATIONSHIP_CHECK_QUESTIONS выше, теперь отдельная
// игра "Экспресс-чек отношений"). История разговора хранится на
// сервере (ai_psychologist_conversations/_messages), а не в localStorage
// — переустановка/смена устройства её не теряет.
function AiPsychologistChatScreen({
  onBack,
}: {
  onBack: () => void;
}) {
  const market = getMarket();
  // AI-психолог поддерживает только ru/en (см. relationship-psychologist-prompt.ts),
  // поэтому для fi-рынка используем английский промпт — понятнее, чем
  // молча откатываться на русский.
  const language: "ru" | "en" = market === "ru" ? "ru" : "en";
  const t = market === "fi" ? TEXT_FI : market === "en" ? TEXT_EN : TEXT_RU;

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiPsychologistMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sending, setSending] = useState(false);
  const [limitInfo, setLimitInfo] = useState<{
    used: number;
    limit: number;
    isPremium: boolean;
  } | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  // Pair Context — по умолчанию OFF. Хранится на самом conversation
  // (не глобально), чтобы один диалог мог быть личным, другой — с
  // контекстом пары. Сервер собирает только агрегированные данные
  // (уровень пары, % совместимости, сильные/слабые темы, серию вопроса
  // дня) — никаких сырых ответов партнёра.
  const [pairContextEnabled, setPairContextEnabled] = useState(false);

  const scrollBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function loadState() {
      const initData = window.Telegram?.WebApp?.initData;

      if (!initData) {
        setLoadingHistory(false);
        return;
      }

      try {
        const response = await fetch("/api/psychologist/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
        });

        const data = await response.json();

        if (response.ok && data?.ok) {
          setConversationId(data.activeConversationId ?? null);
          setMessages(
            (data.messages ?? []).map((m: any) => ({
              role: m.role,
              content: m.content,
              createdAt: m.createdAt,
            }))
          );

          const activeConversation = (data.conversations ?? []).find(
            (c: any) => c.id === data.activeConversationId
          );

          if (activeConversation) {
            setPairContextEnabled(Boolean(activeConversation.pair_context_enabled));
          }
        }
      } catch (error) {
        console.error("psychologist state load error:", error);
      } finally {
        setLoadingHistory(false);
      }
    }

    loadState();
  }, []);

  useEffect(() => {
    scrollBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function ensureConversation(): Promise<string | null> {
    if (conversationId) return conversationId;

    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return null;

    try {
      const response = await fetch("/api/psychologist/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, language, pairContextEnabled }),
      });

      const data = await response.json();

      if (response.ok && data?.ok) {
        setConversationId(data.conversationId);
        return data.conversationId as string;
      }
    } catch (error) {
      console.error("psychologist new conversation error:", error);
    }

    return null;
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
      setErrorText(
        language === "en"
          ? "Could not verify Telegram user"
          : t.errors.telegramUserNotConfirmed
      );
      return;
    }

    setErrorText(null);
    setInputText("");
    setSending(true);

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);

    try {
      const activeConversationId = await ensureConversation();

      if (!activeConversationId) {
        setErrorText(
          language === "en"
            ? "Failed to start a conversation, try again"
            : "Не удалось начать разговор, попробуй ещё раз"
        );
        return;
      }

      const response = await fetch("/api/psychologist/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          conversationId: activeConversationId,
          message: trimmed,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data?.ok) {
        if (data?.reason === "limit-reached") {
          setLimitInfo({
            used: data.used,
            limit: data.limit,
            isPremium: data.isPremium,
          });
          setErrorText(
            language === "en"
              ? `You've reached today's limit (${data.used}/${data.limit} messages). Come back tomorrow${data.isPremium ? "" : " or unlock Premium for more"}.`
              : `Дневной лимит сообщений исчерпан (${data.used}/${data.limit}). Возвращайся завтра${data.isPremium ? "" : " или разблокируй Premium для большего лимита"}.`
          );
        } else if (data?.reason === "ai-not-configured") {
          setErrorText(
            language === "en"
              ? "AI psychologist isn't available right now"
              : "AI-психолог сейчас недоступен"
          );
        } else {
          setErrorText(
            language === "en"
              ? "Something went wrong, try again"
              : "Что-то пошло не так, попробуй ещё раз"
          );
        }
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply,
          pairContextUsed: Boolean(data.pairContextUsed),
        },
      ]);

      setLimitInfo({
        used: data.used,
        limit: data.limit,
        isPremium: data.isPremium,
      });
    } catch (error) {
      console.error("psychologist chat send error:", error);
      setErrorText(
        language === "en"
          ? "Something went wrong, try again"
          : "Что-то пошло не так, попробуй ещё раз"
      );
    } finally {
      setSending(false);
    }
  }

  async function togglePairContext(next: boolean) {
    setPairContextEnabled(next);

    // Если разговор ещё не создан — значение просто уйдёт вместе с
    // первым сообщением через ensureConversation(). Если уже есть —
    // переключаем на сервере отдельным вызовом.
    if (!conversationId) return;

    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return;

    try {
      await fetch("/api/psychologist/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, conversationId, enabled: next }),
      });
    } catch (error) {
      console.error("psychologist context toggle error:", error);
    }
  }

  const starters =
    language === "en" ? AI_PSYCHOLOGIST_STARTERS_EN : AI_PSYCHOLOGIST_STARTERS_RU;

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          ...cardBaseStyle(),
          padding: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#1f1d3a" }}>
            🧠 {language === "en" ? "AI Psychologist" : "AI-психолог для пары"}
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 12.5,
              color: "#5a5378",
              lineHeight: 1.4,
            }}
          >
            {language === "en"
              ? "Not a licensed therapist — an AI relationship assistant."
              : "Не лицензированный специалист — AI-помощник по отношениям."}
          </div>
        </div>

        <button onClick={onBack} style={secondaryButtonStyle} type="button">
          {t.common.back}
        </button>
      </div>

      <button
        type="button"
        onClick={() => togglePairContext(!pairContextEnabled)}
        style={{
          ...cardBaseStyle(),
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          cursor: "pointer",
          border: "none",
          textAlign: "left",
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#3d3660" }}>
            ✨{" "}
            {language === "en"
              ? "Use our pair's data"
              : "Учитывать данные нашей пары"}
          </div>
          <div style={{ marginTop: 2, fontSize: 11.5, color: "#7a7396" }}>
            {language === "en"
              ? "Compatibility & strong/weak topics — never the partner's raw answers."
              : "Совместимость и сильные/слабые темы — без сырых ответов партнёра."}
          </div>
        </div>

        <div
          style={{
            width: 40,
            height: 22,
            borderRadius: 999,
            background: pairContextEnabled
              ? "linear-gradient(90deg,#8f6bff,#ff76ba)"
              : "rgba(255,255,255,0.4)",
            position: "relative",
            flexShrink: 0,
            transition: "background 0.2s ease",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 2,
              left: pairContextEnabled ? 20 : 2,
              width: 18,
              height: 18,
              borderRadius: 999,
              background: "#fff",
              transition: "left 0.2s ease",
              boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
            }}
          />
        </div>
      </button>

      <div
        style={{
          ...cardBaseStyle(),
          flex: 1,
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          overflowY: "auto",
          minHeight: 260,
        }}
      >
        {loadingHistory ? (
          <div style={{ color: "#5a5378", fontSize: 14 }}>
            {language === "en" ? "Loading…" : "Загрузка…"}
          </div>
        ) : messages.length === 0 ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ color: "#5a5378", fontSize: 14, lineHeight: 1.5 }}>
              {language === "en"
                ? "Tell me what's going on. You can talk about a fight, jealousy, trust, intimacy, boundaries — anything."
                : "Расскажи, что происходит. Можно обсудить ссору, ревность, доверие, близость, границы — что угодно."}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {starters.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => sendMessage(starter)}
                  style={{
                    border: "1px solid rgba(255,255,255,0.4)",
                    borderRadius: 999,
                    padding: "8px 12px",
                    background: "rgba(255,255,255,0.3)",
                    color: "#3d3660",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              style={{
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
              }}
            >
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 16,
                  fontSize: 14.5,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  background:
                    msg.role === "user"
                      ? "linear-gradient(135deg, #8f6bff, #ff76ba)"
                      : "rgba(255,255,255,0.4)",
                  color: msg.role === "user" ? "#fff" : "#241b40",
                }}
              >
                {msg.content}
              </div>

              {msg.role === "assistant" && msg.pairContextUsed && (
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 10.5,
                    color: "#8f6bff",
                    fontWeight: 700,
                  }}
                >
                  {language === "en"
                    ? "✨ Used your pair's data"
                    : "✨ Учтены данные вашей пары"}
                </div>
              )}
            </div>
          ))
        )}

        {sending && (
          <div
            style={{
              alignSelf: "flex-start",
              padding: "10px 14px",
              borderRadius: 16,
              background: "rgba(255,255,255,0.4)",
              color: "#5a5378",
              fontSize: 14,
            }}
          >
            {language === "en" ? "Typing…" : "Печатает…"}
          </div>
        )}

        <div ref={scrollBottomRef} />
      </div>

      {errorText && (
        <div
          style={{
            ...cardBaseStyle(),
            padding: 12,
            fontSize: 13,
            color: "#a8305a",
            background: "rgba(255,220,230,0.5)",
          }}
        >
          {errorText}
        </div>
      )}

      {limitInfo && !errorText && (
        <div
          style={{
            fontSize: 12,
            color: "#7a7396",
            textAlign: "center",
          }}
        >
          {language === "en"
            ? `${limitInfo.used}/${limitInfo.limit} messages today`
            : `Сообщений сегодня: ${limitInfo.used}/${limitInfo.limit}`}
        </div>
      )}

      <div
        style={{
          ...cardBaseStyle(),
          padding: 10,
          display: "flex",
          gap: 8,
          alignItems: "center",
          position: "sticky",
          bottom: 0,
        }}
      >
        <input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage(inputText);
            }
          }}
          placeholder={
            language === "en" ? "Write a message…" : "Напишите сообщение…"
          }
          disabled={sending}
          style={{
            flex: 1,
            border: "1px solid rgba(255,255,255,0.4)",
            borderRadius: 14,
            padding: "12px 14px",
            fontSize: 14.5,
            background: "rgba(255,255,255,0.5)",
            color: "#241b40",
            outline: "none",
          }}
        />

        <button
          type="button"
          onClick={() => sendMessage(inputText)}
          disabled={sending || !inputText.trim()}
          style={{
            ...primaryButtonStyle,
            padding: "12px 18px",
            opacity: sending || !inputText.trim() ? 0.6 : 1,
            cursor: sending || !inputText.trim() ? "not-allowed" : "pointer",
          }}
        >
          ➤
        </button>
      </div>
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
const t = market === "fi" ? TEXT_FI : market === "en" ? TEXT_EN : TEXT_RU;
  const today = getTodayLocalDateString();
  const question = getDailyPairQuestionForToday();

  const [saving, setSaving] = useState(false);
  // Пока today ещё не подгружен с сервера, не считаем "точно не
  // отвечал" — иначе на долю секунды показываются варианты ответа,
  // которые тут же прячутся, когда придёт настоящий статус (если
  // ответ уже был дан). loadingToday гасит этот флеш.
  const [loadingToday, setLoadingToday] = useState(true);
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
      if (!pair.pairId) {
        setLoadingToday(false);
        return;
      }

      setLoadingToday(true);

      const { today: rows } = await loadDailyPairState();

      setTodayAnswers(
        rows.map((row) => ({
          telegram_id: Number(row.telegram_id),
          question_id: String(row.question_id),
          answer_index: Number(row.answer_index),
        }))
      );

      setLoadingToday(false);
    }

    loadTodayAnswers();
  }, [pair.pairId, today]);

  const currentUserId = user?.id ?? null;
  const myAnswer = todayAnswers.find((row) => row.telegram_id === currentUserId) ?? null;
  const partnerAnswer =
    todayAnswers.find((row) => row.telegram_id !== currentUserId) ?? null;

  const bothAnswered = !!myAnswer && !!partnerAnswer;

  // Полностью свёрнуто по умолчанию — список показывается только по
  // нажатию кнопки "Показать" (раньше при 1 записи в истории она была
  // видна всегда, кнопки не было вовсе, потому что тогда нечего было
  // "разворачивать" — теперь кнопка есть в любом случае).
  const visibleHistory = historyExpanded ? appState.dailyPairHistory : [];

  async function saveAnswer(answerIndex: number) {
    if (!pair.pairId || !user?.id) {
      alert("Сначала нужно подключить пару");
      return;
    }

    if (myAnswer) {
      alert("Ты уже ответил(а) на вопрос дня");
      return;
    }

    const initData = window.Telegram?.WebApp?.initData;

    if (!initData) {
      alert(t.errors.telegramUserNotConfirmed);
      return;
    }

    try {
      setSaving(true);

      // Дата, вопрос дня, серия, совпадение и вся сумма бонуса теперь
      // считаются целиком на сервере (submit_daily_pair_answer) — сам
      // ответ тоже пишется там же, чтобы его нельзя было подделать
      // напрямую через daily_pair_answers.
      let data: any = null;

      try {
        const response = await fetch("/api/pair/daily-answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData, answerIndex }),
        });

        data = await response.json();

        if (!response.ok) {
          console.error("saveAnswer error:", data);
          alert(t.errors.saveAnswerFailed);
          return;
        }
      } catch (error) {
        console.error("saveAnswer request error:", error);
        alert(t.errors.saveAnswerFailed);
        return;
      }

      if (!data?.ok) {
        if (data?.reason === "answer-locked") {
          alert("Ответ на сегодня уже сохранён и его нельзя изменить");
        } else {
          console.error("Daily pair answer not accepted:", data?.reason);
          alert(t.errors.saveAnswerFailed);
        }
        return;
      }

      // Читаем сегодняшние ответы (и историю, если оба ответили) заново
      // — только для отображения, реальное начисление уже произошло на
      // сервере внутри submit_daily_pair_answer. pair state не
      // перезапрашиваем отдельным round-trip'ом — RPC уже вернул
      // актуальные pairTotalPoints/pairWeeklyPoints в самом ответе.
      const dailyState = await loadDailyPairState();
      const rows = dailyState.today;
      const history = data.status === "both_answered" ? dailyState.history : null;

      setTodayAnswers(
        rows.map((row) => ({
          telegram_id: Number(row.telegram_id),
          question_id: String(row.question_id),
          answer_index: Number(row.answer_index),
        }))
      );

      if (data.status === "both_answered") {
        const nextPairState =
          data.pairTotalPoints != null
            ? {
                ...pair,
                totalPoints: data.pairTotalPoints,
                weeklyPoints: data.pairWeeklyPoints ?? pair.weeklyPoints,
              }
            : pair;

        const currentStreak = Number(data.currentStreak ?? 0);
        const newMilestones: number[] = Array.isArray(data.newMilestones)
          ? data.newMilestones
          : [];
        const streakBonus = Number(data.streakBonus ?? 0);
        const matchBonus = Number(data.matchBonus ?? 0);

        setAppState((prev) => ({
          ...prev,
          pair: nextPairState,

          dailyPairHistory: history ?? [],
          dailyPairStreak: {
            current: currentStreak,
            reachedMilestones: [3, 5, 10, 15].filter(
              (m) => m <= currentStreak
            ),
          },
          dailyPairMatchBonusClaimedDates:
            matchBonus > 0
              ? [...prev.dailyPairMatchBonusClaimedDates, today]
              : prev.dailyPairMatchBonusClaimedDates,
        }));

        const newMilestone = newMilestones[0] ?? null;

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
          {t.dailyPairQuestion.title}
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

        {loadingToday ? (
          <div
            style={{
              marginTop: 12,
              display: "grid",
              gap: 8,
            }}
          >
            {question.options.map((_, index) => (
              <div
                key={index}
                style={{
                  height: 44,
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.14)",
                }}
              />
            ))}
          </div>
        ) : (
          !myAnswer && (
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
          )
        )}

        {loadingToday ? (
          <div
            style={{
              marginTop: 12,
              height: 60,
              borderRadius: 18,
              background: "rgba(255,255,255,0.14)",
            }}
          />
        ) : bothAnswered ? (
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
        {appState.dailyPairStreak.current} {t.pair.streakInfoScreen.daysShort}
      </div>

      <div
        style={{
          marginTop: 8,
          fontSize: 13,
          lineHeight: 1.45,
          color: "rgba(36,27,64,0.72)",
        }}
      >
        {t.pair.streakInfoScreen.bothAnsweredStreak}
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
              {t.dailyPairQuestion.milestoneReached}
            </div>

            <div
  style={{
    marginTop: 6,
    fontSize: 14,
    color: "#4d466c",
    lineHeight: 1.45,
  }}
>
  {t.dailyPairQuestion.streakDaysInARow.replace(
    "{days}",
    String(appState.dailyPairStreak.current)
  )}
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
        {t.pair.historyTitle}
      </div>

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
        {historyExpanded ? "Скрыть" : "Показать"}
      </button>
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
          {t.polls.title}
        </div>
        <div style={{ marginTop: 8, color: "#3a345c", fontSize: 15, lineHeight: 1.45 }}>
          {t.polls.chooseWhoTakes}
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

console.log("CURRENT WEEK:", getCurrentWeekKey());

function getCurrentDayKey() {
  const now = new Date();

  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
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
          {t.notifications.sectionCompleted}
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
          +{points} {t.bonus.pointsWord}
        </div>

        <button
          onClick={onClose}
          style={{ ...primaryButtonStyle, width: "100%", marginTop: 18 }}
        >
          {t.notifications.great}
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
          {t.notifications.newLevel}
        </div>

        <div
          style={{
            marginTop: 10,
            fontSize: 18,
            fontWeight: 800,
            color: "#4d466c",
          }}
        >
          {t.pair.level} {level}
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
          {t.notifications.great}
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

// Приз колеса теперь выбирается атомарно на сервере (RPC
// spin_reward_wheel, pgcrypto), а не здесь — раньше это делал
// pickWeightedIndex() на клиенте, что позволяло подделать результат.

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
    { key: "roles", label: "Роль в отношениях" },
    { key: "fidelity", label: "Верность и измена" },
    { key: "family", label: "Семья и друзья" },
    { key: "quality-time", label: "Совместное время" },
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

    const parsed = JSON.parse(raw) as Partial<AppState> & {
      points?: number;
    };

 return {
  points:
    parsed.points ??
    DEFAULT_STATE.points,

  soloPoints:
    parsed.soloPoints ??
    parsed.points ??
    DEFAULT_STATE.soloPoints,

  soloWeeklyPoints:
    parsed.soloWeeklyPoints ??
    DEFAULT_STATE.soloWeeklyPoints,

  isPremium: DEFAULT_STATE.isPremium,

  playedGameRewardKeys:
    parsed.playedGameRewardKeys ??
    DEFAULT_STATE.playedGameRewardKeys,


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
  weeklyPoints:
    parsed.pair?.weeklyPoints ?? DEFAULT_STATE.pair.weeklyPoints,
    dailyTestsUsed:
  parsed.pair?.dailyTestsUsed ??
  DEFAULT_STATE.pair.dailyTestsUsed,

dailyPollsUsed:
  parsed.pair?.dailyPollsUsed ??
  DEFAULT_STATE.pair.dailyPollsUsed,

dailyGamesUsed:
  parsed.pair?.dailyGamesUsed ??
  DEFAULT_STATE.pair.dailyGamesUsed,

dailyLimitDate:
  parsed.pair?.dailyLimitDate ??
  DEFAULT_STATE.pair.dailyLimitDate,

isPremium:
  parsed.pair?.isPremium ??
  DEFAULT_STATE.pair.isPremium,
weeklyTopRewardClaimedWeek:
  parsed.pair?.weeklyTopRewardClaimedWeek ??
  DEFAULT_STATE.pair.weeklyTopRewardClaimedWeek,
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
  // Раньше весь текст здесь был захардкожен по-русски — единственный
  // экран во всём приложении, который не переводился на EN/FI (нашли
  // при подготовке EN/FI скриншотов для App Store).
  const market = getMarket();
  const t = market === "fi" ? TEXT_FI : market === "en" ? TEXT_EN : TEXT_RU;

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
          {t.bonus.title}
        </div>
        <div
          style={{
            textAlign: "center",
            marginTop: 8,
            color: "#3b3158",
            fontSize: 15,
          }}
        >
          {t.bonus.subtitle}
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
                  {t.bonus.day} {day}
                </div>
                <div style={{ fontWeight: 900, fontSize: 20, color: "#17142e" }}>
                  +{reward}
                </div>
                <div style={{ fontSize: 12, color: "#43355f" }}>
                  {isPast ? t.bonus.claimed : isCurrent ? t.bonus.available : t.bonus.soon}
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
            {t.bonus.claim} +{getRewardForDay(currentDay)} {t.bonus.pointsWord}
          </button>
        ) : (
          <button
            onClick={onClose}
            style={{ ...secondaryButtonStyle, marginTop: 18, width: "100%" }}
          >
            {t.common.continue}
          </button>
        )}
      </div>
    </div>
  );
}

// Phase 2 (App Store план): экран входа только для Capacitor-сборки —
// Telegram-пользователи его никогда не видят (isCapacitorApp() у них
// всегда false, экран "auth" даже не устанавливается как screen).
// Email/password на этот проход; Sign in with Apple и телефон —
// отдельным заходом позже (нужен нативный плагин и настройка в
// Xcode, план явно откладывает это, чтобы не блокировать базовую
// обёртку).
function AuthScreen() {
  const market = getMarket();
  const t = market === "fi" ? TEXT_FI : market === "en" ? TEXT_EN : TEXT_RU;
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Показывается вместо формы, когда signUp прошёл без ошибки, но
  // Supabase ещё не выдал активную сессию — значит, у проекта включено
  // "Confirm email" (по умолчанию так и есть) и пользователю ушло
  // письмо со ссылкой подтверждения. Раньше в этом случае код молча
  // делал reload() и живого человека просто выкидывало обратно на
  // пустой экран входа без единого объяснения.
  const [checkEmailMessage, setCheckEmailMessage] = useState<string | null>(
    null
  );

  async function handleSubmit() {
    if (!email || !password) {
      setError(t.auth.emailPasswordRequired);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (mode === "sign-up") {
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (authError) {
          setError(authError.message);
          setLoading(false);
          return;
        }

        if (!data.session) {
          // Нет authError, но и активной сессии нет — email ещё не
          // подтверждён (обычный случай для signUp с "Confirm email").
          // Заодно это ровно тот же ответ, что Supabase отдаёт на
          // повторный signUp уже существующего подтверждённого email
          // (антиэнумерация) — показываем один и тот же нейтральный
          // текст в обоих случаях, ничего не раскрывая.
          setCheckEmailMessage(
            `${t.auth.checkEmailPrefix}${email}${t.auth.checkEmailSuffix}`
          );
          setLoading(false);
          return;
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (authError) {
          setError(authError.message);
          setLoading(false);
          return;
        }
      }

      // Простой и надёжный способ подхватить новую сессию — весь
      // bootstrap живёт в одном useEffect с [] на маунте компонента
      // (см. выше), перезапускать его отдельно сложнее и рискованнее,
      // чем просто перезагрузить страницу с уже сохранённой Supabase
      // сессией в локальном хранилище.
      window.location.reload();
    } catch (err) {
      console.error("AuthScreen submit error:", err);
      setError(t.auth.genericError);
      setLoading(false);
    }
  }

  async function handleAppleSignIn() {
    setLoading(true);
    setError(null);

    try {
      // Плагин подключён (@capacitor-community/apple-sign-in), но
      // реально протестировать нативный флоу можно только после
      // сборки в Xcode (нужны entitlements) — до этого просто
      // аккуратно ловим ошибку и показываем сообщение, ничего не
      // падает.
      const { SignInWithApple } = await import(
        "@capacitor-community/apple-sign-in"
      );

      const nonce = crypto.randomUUID();

      const result = await SignInWithApple.authorize({
        clientId: "com.couplequizzes.signin",
        redirectURI: "https://eudiyzokazypcalizcls.supabase.co/auth/v1/callback",
        scopes: "email name",
        nonce,
      });

      const { error: authError } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: result.response.identityToken,
        nonce,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      window.location.reload();
    } catch (err) {
      console.error("Apple sign-in error:", err);
      setError(t.auth.appleSignInError);
      setLoading(false);
    }
  }

  if (checkEmailMessage) {
    return (
      <div
        style={{
          padding: 16,
          paddingTop: 28,
          minHeight: "100vh",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 14,
        }}
      >
        <div style={{ ...cardBaseStyle(), padding: 18, textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>✉️</div>
          <div
            style={{
              marginTop: 10,
              fontSize: 20,
              fontWeight: 900,
              color: "#1f1d3a",
            }}
          >
            {t.auth.checkEmailTitle}
          </div>
          <div style={{ marginTop: 10, color: "#3a345c", fontSize: 15 }}>
            {checkEmailMessage}
          </div>
          <button
            onClick={() => {
              setCheckEmailMessage(null);
              setMode("sign-in");
              setPassword("");
            }}
            style={{ ...primaryButtonStyle, width: "100%", marginTop: 18 }}
          >
            {t.auth.gotIt}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 16,
        paddingTop: 28,
        minHeight: "100vh",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 14,
      }}
    >
      <div style={{ ...cardBaseStyle(), padding: 18 }}>
        <div style={{ fontSize: 26, fontWeight: 900, color: "#1f1d3a" }}>
          Couple Quizzes
        </div>
        <div style={{ marginTop: 6, color: "#3a345c", fontSize: 14 }}>
          {mode === "sign-up" ? t.auth.signUpTitle : t.auth.signInTitle}
        </div>

        <input
          type="email"
          placeholder={t.auth.emailPlaceholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            marginTop: 16,
            width: "100%",
            padding: "12px 14px",
            borderRadius: 14,
            border: "1px solid rgba(0,0,0,0.12)",
            fontSize: 15,
            boxSizing: "border-box",
          }}
        />
        <input
          type="password"
          placeholder={t.auth.passwordPlaceholder}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            marginTop: 10,
            width: "100%",
            padding: "12px 14px",
            borderRadius: 14,
            border: "1px solid rgba(0,0,0,0.12)",
            fontSize: 15,
            boxSizing: "border-box",
          }}
        />

        {error && (
          <div style={{ marginTop: 10, color: "#c0392b", fontSize: 13 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            ...primaryButtonStyle,
            width: "100%",
            marginTop: 16,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading
            ? t.auth.submitLoading
            : mode === "sign-up"
              ? t.auth.submitSignUp
              : t.auth.submit}
        </button>

        <div
          style={{
            marginTop: 14,
            marginBottom: 2,
            textAlign: "center",
            color: "#8a84a6",
            fontSize: 12,
          }}
        >
          {t.auth.or}
        </div>

        <button
          onClick={handleAppleSignIn}
          disabled={loading}
          style={{
            ...primaryButtonStyle,
            width: "100%",
            marginTop: 16,
            background: "#000000",
            opacity: loading ? 0.7 : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 18 }}></span> {t.auth.appleSignIn}
        </button>

        <button
          onClick={() => {
            setMode(mode === "sign-up" ? "sign-in" : "sign-up");
            setError(null);
          }}
          style={{
            ...secondaryButtonStyle,
            width: "100%",
            marginTop: 10,
          }}
        >
          {mode === "sign-up"
            ? t.auth.switchToSignIn
            : t.auth.switchToSignUp}
        </button>
      </div>
    </div>
  );
}

function WelcomeScreen({ onStart }: { onStart: () => void }) {
  const market = getMarket();
  const t = market === "fi" ? TEXT_FI : market === "en" ? TEXT_EN : TEXT_RU;
  const features: { emoji: string; label: string }[] = [
    { emoji: "💬", label: t.welcome.featurePolls },
    { emoji: "🎮", label: t.welcome.featureGames },
    { emoji: "🏆", label: t.welcome.featureTop },
  ];

  return (
    <div
      style={{
        padding: 16,
        paddingTop: 28,
        paddingBottom: 28,
        minHeight: "100vh",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div style={{ ...cardBaseStyle(), padding: 18, overflow: "hidden" }}>
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
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 14,
              left: 18,
              fontSize: 22,
              opacity: 0.5,
            }}
          >
            ✨
          </div>
          <div
            style={{
              position: "absolute",
              top: 22,
              right: 22,
              fontSize: 18,
              opacity: 0.45,
            }}
          >
            💫
          </div>

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
              padding: "14px 16px",
              borderRadius: 18,
              background: "rgba(255,255,255,0.34)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              color: "#241b40",
              textAlign: "center",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 22, lineHeight: 1.15 }}>
              Couple Quizzes
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 13,
                fontWeight: 700,
                color: "#4d4470",
                opacity: 0.9,
              }}
            >
              {t.welcome.subtitle}
            </div>
          </div>
        </div>

        <button
          onClick={onStart}
          style={{ ...primaryButtonStyle, width: "100%", marginTop: 18 }}
        >
          {t.common.start}
        </button>

        <div
          style={{
            marginTop: 16,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {features.map((feature) => (
            <div
              key={feature.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.35)",
                border: "1px solid rgba(255,255,255,0.4)",
                fontSize: 12.5,
                fontWeight: 800,
                color: "#3d3660",
              }}
            >
              <span style={{ fontSize: 14 }}>{feature.emoji}</span>
              {feature.label}
            </div>
          ))}
        </div>
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
  ? // Тот же фикс, что и в PairScreen — берём из pairLevel (очки пары),
    // а не из points (соло-баланс, не совпадал с прогресс-баром).
    `${t.home.toNextLevel}: ${Math.max(
      0,
      pairLevel.progressMax - pairLevel.progressInLevel
    )}`
  : t.home.maxLevelReached}
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


      <button
        type="button"
        onClick={() => onNavigate("ai-psychologist-chat")}
        style={{
          ...cardBaseStyle(),
          width: "100%",
          padding: 16,
          marginBottom: 12,
          textAlign: "left",
          cursor: "pointer",
          border: "1px solid rgba(255,255,255,0.4)",
          background:
            "linear-gradient(135deg, rgba(143,107,255,0.22), rgba(255,118,186,0.18))",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 30, flexShrink: 0 }}>🧠</div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#1f1d3a" }}>
            {t.aiPsychologist.menuTitle}
          </div>
          <div
            style={{
              marginTop: 2,
              fontSize: 12.5,
              color: "#5a5378",
              lineHeight: 1.35,
            }}
          >
            {t.aiPsychologist.menuSubtitle}
          </div>
        </div>

        <div style={{ fontSize: 20, color: "#7c5cff", flexShrink: 0 }}>→</div>
      </button>

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
  pair,
  isPremium,
  showPaywall,
}: {
  genderFilter: "boy" | "girl";
  completedPollIds: string[];
  onBack: () => void;
  onCompletePoll: (
  poll: Poll,
  answers: number[]
) => Promise<void>;

  pair: PairState;
  // Настоящий источник Premium-статуса — appState.isPremium (таблица
  // subscriptions). pair.isPremium читает несуществующую колонку
  // pairs.is_premium и всегда равен false — не использовать для этой
  // проверки.
  isPremium: boolean;

  showPaywall: () => void;
}) {
  const filteredPolls = POLLS.filter((p) => p.gender === genderFilter);

  const [page, setPage] = useState(1);
  const [activePollId, setActivePollId] = useState<string | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);
  const market = getMarket();
const t = market === "fi" ? TEXT_FI : market === "en" ? TEXT_EN : TEXT_RU;


const POLLS_PER_PAGE = 3;

const startIndex = (page - 1) * POLLS_PER_PAGE;
const endIndex = startIndex + POLLS_PER_PAGE;

const visiblePolls = filteredPolls.slice(startIndex, endIndex);

const totalPages = Math.ceil(filteredPolls.length / POLLS_PER_PAGE);

const activePoll = POLLS.find((poll) => poll.id === activePollId) || null;

  const currentQuestion = activePoll?.questions[currentQuestionIndex] || null;

  if (activePoll && activePoll.questions.length === 0) {
  return (
    <div style={{ padding: 20 }}>
      <button onClick={() => setActivePollId(null)}>
        {market !== "ru" ? "Back" : "Назад"}
      </button>
      <div style={{ marginTop: 16, opacity: 0.7 }}>
        {market !== "ru" ? "This poll has no questions yet" : "В этом опросе пока нет вопросов"}
      </div>
    </div>
  );
}

function startPoll(pollId: string) {
  const isFreePoll =
    pollId === "boy-communication" ||
    pollId === "girl-communication" ||
    pollId === "boy-jealousy" ||
    pollId === "girl-jealousy";

 if (!isPremium && !isFreePoll) {
  showPaywall();
  return;
}

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

async function handleFinish() {
  if (!activePoll) return;

  await onCompletePoll(activePoll, answers);

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
  {market !== "ru"
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
  {market !== "ru"
    ? `Page ${page} of ${totalPages}`
    : `Страница ${page} из ${totalPages}`}
</div>
<div style={{ fontSize: 13, color: "#5a5378" }}>
  {market !== "ru"
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
              {market !== "ru"
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
              {market !== "ru"
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
          {market !== "ru"
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
    {market !== "ru" ? "← Previous" : "← Предыдущая"}
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
    {market !== "ru" ? "Next →" : "Следующая →"}
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
          {market !== "ru" ? "Done 🎉" : "Готово 🎉"}
        </div>
        <div style={{ marginTop: 10, color: "#3a345c", lineHeight: 1.5 }}>
          {market !== "ru" ? (
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
          {market !== "ru" ? "Claim points" : "Забрать очки"}
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
          {market !== "ru"
            ? `Question ${currentQuestionIndex + 1} of ${activePoll.questions.length}`
            : `Вопрос ${currentQuestionIndex + 1} из ${activePoll.questions.length}`}
        </div>
      </div>

      <div style={{ ...cardBaseStyle(), padding: 14 }}>

 <div
  style={{
    width: "100%",
    aspectRatio: "16 / 9",
    overflow: "hidden",
    borderRadius: 22,
    marginBottom: 14,
    boxShadow: "0 14px 30px rgba(80, 50, 130, 0.18)",
  }}
>
  <img
    src={activePoll.image}
    alt={activePoll.title}
    style={{
      display: "block",
      width: "100%",
      height: "100%",
      objectFit: "cover",
      objectPosition: "center 38%",
    }}
  />
</div>

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
          {market !== "ru" ? "Exit poll" : "Выйти из опроса"}
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
const t = market === "fi" ? TEXT_FI : market === "en" ? TEXT_EN : TEXT_RU;
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [aiStep, setAiStep] = useState(0);
  const [showAiAnswers, setShowAiAnswers] = useState(true);
const [aiAnswers, setAiAnswers] = useState<number[]>([]);
const [aiTyping, setAiTyping] = useState(false);
const [lastAiAnswerIndex, setLastAiAnswerIndex] = useState<number | null>(null);
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
    // id/reward-key намеренно не переименованы (game-ai-psychologist в
    // reward-catalog.ts) — иначе тем, кто уже прошёл опросник, начислило
    // бы награду повторно под новым ключом. Экран называется по-новому:
    // это больше не "AI-психолог" (см. новый универсальный чат ниже),
    // а короткий детерминированный опросник — "Экспресс-чек отношений".
    id: "ai-psychologist",
    title: market !== "ru" ? "Relationship Express-Check" : "Экспресс-чек отношений",
    description:
      market !== "ru"
        ? "12 questions, 2 minutes — find out what's going on in your relationship right now"
        : "12 вопросов, 2 минуты — узнайте, что сейчас происходит в ваших отношениях",
    reward: 10,
    questions: [],

  },
];

 

  const allGames = [...gamesPage1, ...gamesPage2];
const activeGame = allGames.find((game) => game.id === activeGameId) || null;

if (activeGameId === "ai-psychologist") {
  const currentAiQuestion = RELATIONSHIP_CHECK_QUESTIONS[aiStep];
  const isFinished = aiStep >= RELATIONSHIP_CHECK_QUESTIONS.length;
  const result = getRelationshipCheckResult(aiAnswers);

  const psychologistEmotion = getRelationshipCheckEmotion({
  aiTyping,
  isFinished,
  aiStep,
});

const psychologistAvatar =
  AI_PSYCHOLOGIST_AVATARS[
    psychologistEmotion as keyof typeof AI_PSYCHOLOGIST_AVATARS
  ];

 function handleAiAnswer(answerIndex: number) {
  setLastAiAnswerIndex(answerIndex);
  setShowAiAnswers(false);
  setAiTyping(true);

  setTimeout(async () => {
    const nextAnswers = [...aiAnswers, answerIndex];
    const nextStep = aiStep + 1;

    setAiAnswers(nextAnswers);
    setAiStep(nextStep);
    setAiTyping(false);

    if (nextStep >= RELATIONSHIP_CHECK_QUESTIONS.length) {
      const rewardKey = "game-ai-psychologist";
      if (!playedGameRewardKeys.includes(rewardKey)) {
        await onClaimStepReward(rewardKey);
      }
    } else {
      setShowAiAnswers(true);
    }
  }, 900);
}

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ ...cardBaseStyle(), padding: 14 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#1f1d3a" }}>
          {market !== "ru" ? "Relationship Express-Check 🩺" : "Экспресс-чек отношений 🩺"}
        </div>

        <div
          style={{
            marginTop: 8,
            color: "#4b446a",
            lineHeight: 1.45,
            fontSize: 13,
          }}
        >
          {market !== "ru"
            ? "12 short questions to help you understand what's going on in your relationship right now."
            : "12 коротких вопросов помогут понять, что сейчас происходит в ваших отношениях."}
        </div>
      </div>

      {!isFinished ? (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <img
  src={psychologistAvatar}
  alt={market !== "ru" ? "Psychologist" : "Психолог"}
  style={{
  width: 96,
  height: 96,
  borderRadius: 999,
  objectFit: "cover",
  border: "3px solid rgba(255,255,255,0.55)",
  boxShadow: aiTyping
    ? "0 0 0 10px rgba(143,107,255,0.10), 0 10px 30px rgba(143,107,255,0.22)"
    : "0 10px 24px rgba(143,107,255,0.16)",
  flexShrink: 0,
  transform: aiTyping ? "scale(1.04)" : "scale(1)",
  transition: "all 0.35s ease",
}}
/>

            <div
              style={{
                ...cardBaseStyle(),
                padding: 16,
                flex: 1,
                borderTopLeftRadius: 12,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: "#6b5cff",
                  fontWeight: 800,
                }}
              >
                {market !== "ru"
                  ? `Question ${aiStep + 1} of ${RELATIONSHIP_CHECK_QUESTIONS.length}`
                  : `Вопрос ${aiStep + 1} из ${RELATIONSHIP_CHECK_QUESTIONS.length}`}
              </div>

              <div
                style={{
                  marginTop: 8,
                  fontSize: 20,
                  fontWeight: 900,
                  color: "#1f1d3a",
                  lineHeight: 1.35,
                }}
              >
                {currentAiQuestion.text}
              </div>

             
            </div>
          </div>

          <div style={{ flex: 1 }} />

          <div
            style={{
              ...cardBaseStyle(),
              padding: 14,
              position: "sticky",
              bottom: 0,
            }}
          >
            <div
              style={{
                fontSize: 13,
                color: "#5a5378",
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              {market !== "ru" ? "Choose an answer" : "Выберите ответ"}
            </div>

            {aiTyping ? (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      color: "#6b5cff",
      fontSize: 14,
      fontWeight: 700,
      padding: "10px 4px 4px",
    }}
  >
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        background: "#8f6bff",
        display: "inline-block",
        opacity: 0.7,
        animation: "pulse 1s infinite",
      }}
    />
    {market !== "ru" ? "Analyzing your answer..." : "Анализирую ваш ответ..."}
  </div>
) : (
  showAiAnswers && (
    <div style={{ display: "grid", gap: 10 }}>
      {currentAiQuestion.options.map((option, index) => (
        <button
          key={option}
          onClick={() => handleAiAnswer(index)}
          style={{
            ...secondaryButtonStyle,
            width: "100%",
            textAlign: "left",
            padding: "14px 16px",
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          {option}
        </button>
      ))}
    </div>
  )
)}
          </div>
        </>
      ) : (
        <>
          <div style={{ ...cardBaseStyle(), padding: 18 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <img
  src={AI_PSYCHOLOGIST_AVATARS.happy}
  alt={market !== "ru" ? "Psychologist" : "Психолог"}
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 999,
                  objectFit: "cover",
                  border: "2px solid rgba(255,255,255,0.45)",
                  flexShrink: 0,
                }}
              />

              <div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#6b5cff",
                    fontWeight: 800,
                  }}
                >
                  {market !== "ru" ? "Analysis ready" : "Анализ готов"}
                </div>

                <div
                  style={{
                    marginTop: 4,
                    fontSize: 22,
                    fontWeight: 900,
                    color: "#1f1d3a",
                    lineHeight: 1.3,
                  }}
                >
                  {result.title}
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 12,
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
              {market !== "ru" ? "What you can do right now 💞" : "Что можно сделать уже сейчас 💞"}
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
            {market !== "ru" ? "Take it again" : "Пройти ещё раз"}
          </button>
        </>
      )}

      <button
        onClick={() => setActiveGameId(null)}
        style={{ ...secondaryButtonStyle, width: "100%" }}
      >
        {market !== "ru" ? "Back to games" : "Назад к играм"}
      </button>
    </div>
  );
}

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
  setShowAiAnswers(true);
  setAiTyping(false);
  setLastAiAnswerIndex(null);
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
          {t.games.title}
        </div>
        <div style={{ marginTop: 4, color: "#3a345c", fontSize: 13 }}>
          {t.games.subtitle}
        </div>
      </div>

    {(page === 1 ? gamesPage1 : gamesPage2).map((game) => {
        const completed = completedGameIds.includes(game.id);

        if (activeGame?.id === "ai-psychologist") {
  return (
    <div style={{ padding: 20 }}>
      <div style={{ fontSize: 24 }}>РАБОТАЕТ ПСИХОЛОГ 🧠</div>

      <button onClick={() => setActiveGameId(null)}>
        {t.common.back}
      </button>
    </div>
  );
}

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
    {market !== "ru" ? "Coming soon 🧠" : "Скоро будет доступно 🧠"}
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
        {t.common.back}
      </button>

      <button
        onClick={() => setPage(2)}
        style={{
          ...secondaryButtonStyle,
          flex: 1,
          padding: "10px 16px",
        
        }}
      >
        {t.games.nextPage}
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
        {t.games.prevPage}
      </button>

      <button
        onClick={onBack}
        style={{
          ...secondaryButtonStyle,
          flex: 1,
          padding: "10px 16px",
        }}
      >
        {t.common.toMenu}
      </button>
    </>
  )}
</div>

    </div>
  );
}



  if (activeGame?.id === "ai-psychologist") {
  const currentQuestion = RELATIONSHIP_CHECK_QUESTIONS[aiStep];
  const isFinished = aiStep >= RELATIONSHIP_CHECK_QUESTIONS.length;
  const result = getRelationshipCheckResult(aiAnswers);

 function handleAiAnswer(answerIndex: number) {
  setLastAiAnswerIndex(answerIndex);
  setShowAiAnswers(false);
  setAiTyping(true);

  setTimeout(async () => {
    const nextAnswers = [...aiAnswers, answerIndex];
    const nextStep = aiStep + 1;

    setAiAnswers(nextAnswers);
    setAiStep(nextStep);
    setAiTyping(false);

    if (nextStep >= RELATIONSHIP_CHECK_QUESTIONS.length) {
      const rewardKey = "game-ai-psychologist";
      if (!playedGameRewardKeys.includes(rewardKey)) {
        await onClaimStepReward(rewardKey);
      }
    } else {
      setShowAiAnswers(true);
    }
  }, 900);
}


  return (
    <div style={{ padding: 16, display: "grid", gap: 14 }}>
      <div style={{ ...cardBaseStyle(), padding: 18 }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: "#1f1d3a" }}>
          {t.aiPsychologist.checkTitle}
        </div>

        <div
          style={{
            marginTop: 8,
            color: "#4b446a",
            lineHeight: 1.45,
            fontSize: 14,
          }}
        >
          {t.aiPsychologist.checkIntro}
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
            {t.aiPsychologist.questionOfPrefix} {aiStep + 1}{" "}
            {t.aiPsychologist.questionOfMid}{" "}
            {RELATIONSHIP_CHECK_QUESTIONS.length}
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
              {t.aiPsychologist.yourResult}
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
              {t.aiPsychologist.whatToDoNow}
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

          <div style={{ ...cardBaseStyle(), padding: 18 }}>
  <div style={{ fontSize: 18, fontWeight: 900, color: "#1f1d3a" }}>
    {t.aiPsychologist.breakdownByTopics}
  </div>

  <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
    {result.zones.map((zone) => (
      <div
        key={zone.key}
        style={{
          padding: "12px 14px",
          borderRadius: 16,
          background: "rgba(255,255,255,0.26)",
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: "#1f1d3a",
            textTransform: "capitalize",
          }}
        >
          {zone.title}
        </div>

        <div
          style={{
            marginTop: 4,
            fontSize: 13,
            color: "#5a5378",
            fontWeight: 700,
          }}
        >
          {zone.label}
        </div>
      </div>
    ))}
  </div>
</div>

          <button
            onClick={() => startGame("ai-psychologist")}
            style={{ ...primaryButtonStyle, width: "100%" }}
          >
            {t.games.playAgain}
          </button>
        </>
      )}

      <button
        onClick={() => setActiveGameId(null)}
        style={{ ...secondaryButtonStyle, width: "100%" }}
      >
        {market !== "ru" ? "Back to games" : "Назад к играм"}
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
            {t.games.finishedTitle}
          </div>
          <div style={{ marginTop: 10, color: "#3a345c", lineHeight: 1.5 }}>
            <b>{activeGame.title}</b> {t.games.completedSuffix}
            <br />
            {t.games.correctAnswersLabel}{" "}
            <b>
              {correctAnswers} {t.common.of} {total}
            </b>
            <br />
            {t.games.resultLabel} <b>{percent}%</b>
            <br />
            {t.games.rewardLabel}{" "}
            <b>
              +{activeGame.reward} {t.games.pointsUnit}
            </b>
          </div>

          <button
            onClick={handleFinish}
            style={{ ...primaryButtonStyle, width: "100%", marginTop: 16 }}
          >
            {t.games.claimPoints}
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
        {t.games.questionProgress
          .replace("{current}", String(currentQuestionIndex + 1))
          .replace("{total}", String(activeGame.questions.length))}
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
          ? t.common.finish
          : t.games.nextButton}
      </button>

      <button onClick={() => setActiveGameId(null)} style={secondaryButtonStyle}>
        {t.games.exitGame}
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
          {market !== "ru" ? "Spin the Bottle" : "Бутылочка"}
        </div>

        <div
          style={{
            marginTop: 8,
            color: "#4b446a",
            fontSize: 15,
            lineHeight: 1.45,
          }}
        >
          {market !== "ru"
            ? "Spin the bottle and get a task for whoever it points to."
            : "Крути бутылку и получай задание для того, на кого она покажет."}
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
          <span>{market !== "ru" ? "👧 Girl" : "👧 Девушка"}</span>
          <span>{market !== "ru" ? "👦 Guy" : "👦 Парень"}</span>
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
          {market !== "ru"
            ? isSpinning
              ? "Spinning..."
              : "Spin the bottle"
            : isSpinning
              ? "Крутим..."
              : "Крутить бутылку"}
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
              {market !== "ru" ? "💫 Bottle task" : "💫 Задание бутылочки"}
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
              {market !== "ru"
                ? activeTask.target === "boy"
                  ? "Task for him"
                  : "Task for her"
                : activeTask.target === "boy"
                  ? "Задание для него"
                  : "Задание для неё"}
            </div>

           <div style={{ marginTop: 10, fontSize: 16, lineHeight: 1.55, color: "#4b446a", padding: "14px 16px", borderRadius: 20, background: "rgba(107,70,255,0.06)", }} > {activeTask.text} </div>

            <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
              <button
                onClick={handleCompleteBottleTask}
                style={{ ...primaryButtonStyle, width: "100%" }}
              >
                {market !== "ru" ? "Task done" : "Задание выполнено"}
              </button>

              <button
                onClick={handleAnotherBottleTask}
                style={{ ...secondaryButtonStyle, width: "100%" }}
              >
                {market !== "ru" ? "Another task" : "Другое задание"}
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
          {market !== "ru" ? "90 Questions" : "90 вопросов"}
        </div>

        <div
          style={{
            marginTop: 8,
            color: "#4b446a",
            fontSize: 15,
            lineHeight: 1.45,
          }}
        >
          {market !== "ru"
            ? "Deep questions about feelings, closeness, and relationships."
            : "Глубокие вопросы про чувства, близость и отношения."}
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
                  {market !== "ru" ? "90 Questions 💞" : "90 вопросов 💞"}
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
    {market !== "ru" ? "✔ You already answered this one" : "✔ Вы уже отвечали на этот вопрос"}
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
              {market !== "ru" ? "Answered" : "Ответили"}
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
              {market !== "ru" ? "You've run out of questions 🎉" : "Вопросы закончились 🎉"}
            </div>

            <div style={{ marginTop: 12, color: "#4b446a", lineHeight: 1.45 }}>
              {market !== "ru"
                ? "You went through the whole current set of questions."
                : "Ты прошёл(а) весь текущий набор вопросов."}
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
  const nhCard = (
    id: string,
    type: "spicy" | "funny" | "romantic",
    emoji: string,
    textRu: string,
    textEn: string,
    taskRu: string,
    taskEn: string
  ) => ({
    id,
    type,
    emoji,
    text: market !== "ru" ? textEn : textRu,
    task: market !== "ru" ? taskEn : taskRu,
  });

  const cards = [
    nhCard(
      "nh1",
      "spicy",
      "😈",
      "Я никогда не играл(а) в карты на раздевание",
      "I have never played strip poker (or any strip game)",
      "Если партнёр делал это — ему пора пыхтеть 😏",
      "If your partner has, they're in the hot seat now 😏"
    ),
    nhCard(
      "nh2",
      "funny",
      "🤣",
      "Я никогда не пел(а) вслух в душе",
      "I have never sung out loud in the shower",
      "Если партнёр делал это — поёт одну строчку любой песни",
      "If your partner has, they sing one line of any song"
    ),
    nhCard(
      "nh3",
      "romantic",
      "🔥",
      "Я никогда не устраивал(а) романтический сюрприз",
      "I have never planned a romantic surprise",
      "Если партнёр делал это — делится самой милой историей",
      "If your partner has, they share their sweetest story"
    ),
    nhCard(
      "nh4",
      "spicy",
      "😈",
      "Я никогда не писал(а) бывшему ночью",
      "I have never texted an ex late at night",
      "Если партнёр делал это — рассказывает неловкую историю",
      "If your partner has, they tell an awkward story"
    ),
    nhCard(
      "nh5",
      "funny",
      "🤣",
      "Я никогда не засыпал(а) на свидании",
      "I have never fallen asleep on a date",
      "Если партнёр делал это — показывает это в лицах",
      "If your partner has, they act it out"
    ),
    nhCard(
      "nh6",
      "romantic",
      "🔥",
      "Я никогда не мечтал(а) о ленивом дне вдвоём без дел",
      "I have never dreamed of a lazy do-nothing day together",
      "Если партнёр делал это — описывает этот день тремя словами",
      "If your partner has, they describe that day in three words"
    ),
    nhCard(
      "nh7",
      "spicy",
      "😈",
      "Я никогда не ревновал(а) без причины",
      "I have never been jealous without a reason",
      "Если партнёр делал это — обнимает тебя 20 секунд",
      "If your partner has, they hug you for 20 seconds"
    ),
    nhCard(
      "nh8",
      "funny",
      "🤣",
      "Я никогда не говорил(а) 'я в пути', ещё не выйдя из дома",
      "I have never said 'I'm on my way' before actually leaving the house",
      "Если партнёр делал это — изображает очень виноватый вид 10 секунд",
      "If your partner has, they make a guilty face for 10 seconds"
    ),
    nhCard(
      "nh9",
      "romantic",
      "🔥",
      "Я никогда не представлял(а) наш идеальный совместный выходной",
      "I have never imagined our perfect day off together",
      "Если партнёр делал это — быстро рассказывает свой вариант",
      "If your partner has, they quickly describe theirs"
    ),
    nhCard(
      "nh10",
      "spicy",
      "😈",
      "Я никогда не флиртовал(а) ради шутки",
      "I have never flirted just as a joke",
      "Если партнёр делал это — выполняет твоё мини-желание",
      "If your partner has, they grant you a small wish"
    ),
    nhCard(
      "nh11",
      "funny",
      "🤣",
      "Я никогда не путал(а) имя человека",
      "I have never mixed up someone's name",
      "Если партнёр делал это — рассказывает самую неловкую ситуацию",
      "If your partner has, they tell their most awkward story about it"
    ),
    nhCard(
      "nh12",
      "romantic",
      "🔥",
      "Я никогда не придумывал(а) милое прозвище для любимого человека",
      "I have never come up with a cute nickname for someone I love",
      "Если партнёр делал это — придумывает тебе новое прямо сейчас",
      "If your partner has, they make up a new one for you right now"
    ),
    nhCard(
      "nh13",
      "spicy",
      "😈",
      "Я никогда не подглядывал(а) в чужой телефон",
      "I have never snooped on someone else's phone",
      "Если партнёр делал это — честно признаётся, зачем",
      "If your partner has, they honestly admit why"
    ),
    nhCard(
      "nh14",
      "funny",
      "🤣",
      "Я никогда не делал(а) вид, что слушаю, хотя мысли были в другом месте",
      "I have never pretended to listen while my mind was somewhere else",
      "Если партнёр делал это — должен(на) очень внимательно слушать тебя 30 секунд",
      "If your partner has, they have to listen to you very closely for 30 seconds"
    ),
    nhCard(
      "nh15",
      "romantic",
      "🔥",
      "Я никогда не влюблялся(ась) с первого взгляда",
      "I have never fallen in love at first sight",
      "Если партнёр делал это — делает тебе комплимент",
      "If your partner has, they give you a compliment"
    ),
    nhCard(
      "nh16",
      "spicy",
      "😈",
      "Я никогда не хотел(а) поцеловать человека в первый же вечер",
      "I have never wanted to kiss someone on the very first night",
      "Если партнёр делал это — улыбается максимально загадочно",
      "If your partner has, they smile as mysteriously as possible"
    ),
    nhCard(
      "nh17",
      "funny",
      "🤣",
      "Я никогда не танцевал(а) без музыки",
      "I have never danced without any music playing",
      "Если партнёр делал это — показывает 5 секунд танца",
      "If your partner has, they show 5 seconds of that dance"
    ),
    nhCard(
      "nh18",
      "romantic",
      "🔥",
      "Я никогда не хотел(а) устроить спонтанную поездку вдвоём",
      "I have never wanted to go on a spontaneous trip together",
      "Если партнёр делал это — называет место, куда хотел(а) бы поехать с тобой",
      "If your partner has, they name a place they'd want to go with you"
    ),
    nhCard(
      "nh19",
      "spicy",
      "😈",
      "Я никогда не писал(а) длинное сообщение и потом не удалял(а) его",
      "I have never written a long message and then deleted it instead of sending",
      "Если партнёр делал это — говорит, почему передумал(а)",
      "If your partner has, they say why they changed their mind"
    ),
    nhCard(
      "nh20",
      "funny",
      "🤣",
      "Я никогда не удалял(а) фото из-за того, что плохо получился(ась)",
      "I have never deleted a photo just because I looked bad in it",
      "Если партнёр делал это — показывает свою самую смешную мину",
      "If your partner has, they make their funniest face"
    ),
    nhCard(
      "nh21",
      "romantic",
      "🔥",
      "Я никогда не скучал(а) настолько, что пересматривал(а) фото человека",
      "I have never missed someone so much I kept scrolling through their photos",
      "Если партнёр делал это — признаётся, чьи фото так смотрел(а)",
      "If your partner has, they admit whose photos it was"
    ),
    nhCard(
      "nh22",
      "spicy",
      "😈",
      "Я никогда не говорил(а) 'мне всё равно', когда было очень даже не всё равно",
      "I have never said 'I don't care' when I actually cared a lot",
      "Если партнёр делал это — говорит 3 вещи, которые ему(ей) не всё равно",
      "If your partner has, they name 3 things they actually care about"
    ),
    nhCard(
      "nh23",
      "funny",
      "🤣",
      "Я никогда не выбирал(а) одежду дольше часа",
      "I have never spent over an hour picking an outfit",
      "Если партнёр делал это — рассказывает про свой самый сложный выбор",
      "If your partner has, they tell the story of their hardest outfit choice"
    ),
    nhCard(
      "nh24",
      "romantic",
      "🔥",
      "Я никогда не мечтал(а) проснуться у моря рядом с любимым человеком",
      "I have never dreamed of waking up by the sea next to someone I love",
      "Если партнёр делал это — описывает такое утро одной фразой",
      "If your partner has, they describe that morning in one sentence"
    ),
    nhCard(
      "nh25",
      "spicy",
      "😈",
      "Я никогда не ревновал(а) к прошлому партнёра",
      "I have never been jealous of a partner's past relationship",
      "Если партнёр делал это — честно признаётся, что именно задевало",
      "If your partner has, they honestly admit what exactly bothered them"
    ),
    nhCard(
      "nh26",
      "funny",
      "🤣",
      "Я никогда не опаздывал(а) на свидание больше чем на 30 минут",
      "I have never been more than 30 minutes late for a date",
      "Если партнёр делал это — извиняется максимально драматично",
      "If your partner has, they apologize as dramatically as possible"
    ),
    nhCard(
      "nh27",
      "romantic",
      "🔥",
      "Я никогда не делал(а) сюрприз без повода",
      "I have never planned a surprise for no reason at all",
      "Если партнёр делал это — обещает маленький сюрприз в будущем",
      "If your partner has, they promise a small surprise in the future"
    ),
    nhCard(
      "nh28",
      "spicy",
      "😈",
      "Я никогда не скрывал(а), что мне кто-то нравится",
      "I have never hidden that I liked someone",
      "Если партнёр делал это — показывает, как он(а) это обычно скрывает",
      "If your partner has, they show how they usually hide it"
    ),
    nhCard(
      "nh29",
      "funny",
      "🤣",
      "Я никогда не делал(а) скриншот переписки",
      "I have never taken a screenshot of a chat",
      "Если партнёр делал это — делает максимально innocent face",
      "If your partner has, they make the most innocent face possible"
    ),
    nhCard(
      "nh30",
      "romantic",
      "🔥",
      "Я никогда не представлял(а) совместную жизнь через 10 лет",
      "I have never imagined our life together 10 years from now",
      "Если партнёр делал это — рассказывает один такой образ",
      "If your partner has, they share one such picture"
    ),
    nhCard(
      "nh31",
      "spicy",
      "😈",
      "Я никогда не задерживал(а) ответ специально",
      "I have never delayed replying on purpose",
      "Если партнёр делал это — признаётся, зачем так делал(а)",
      "If your partner has, they admit why they did it"
    ),
    nhCard(
      "nh32",
      "funny",
      "🤣",
      "Я никогда не делал(а) вид, что не заметил(а) сообщение",
      "I have never pretended I didn't see a message",
      "Если партнёр делал это — признаётся, почему так бывает",
      "If your partner has, they admit why that happens"
    ),
    nhCard(
      "nh33",
      "romantic",
      "🔥",
      "Я никогда не хотел(а) обнять человека сильнее, чем позволяли обстоятельства",
      "I have never wanted to hug someone more than the situation allowed",
      "Если партнёр делал это — обнимает тебя прямо сейчас",
      "If your partner has, they hug you right now"
    ),
    nhCard(
      "nh34",
      "spicy",
      "😈",
      "Я никогда не устраивал(а) сцену ревности",
      "I have never made a jealous scene",
      "Если партнёр делал это — изображает свою ревность без слов",
      "If your partner has, they act out their jealousy without words"
    ),
    nhCard(
      "nh35",
      "funny",
      "🤣",
      "Я никогда не врал(а), что мне нравится подарок",
      "I have never lied about liking a gift",
      "Если партнёр делал это — рассказывает про самый странный подарок",
      "If your partner has, they tell the story of the strangest gift"
    ),
    nhCard(
      "nh36",
      "romantic",
      "🔥",
      "Я никогда не думал(а): 'с этим человеком было бы очень спокойно'",
      "I have never thought 'life would feel so calm with this person'",
      "Если партнёр делал это — говорит, что для него(неё) значит спокойствие в любви",
      "If your partner has, they say what calm love means to them"
    ),
    nhCard(
      "nh37",
      "spicy",
      "😈",
      "Я никогда не хотел(а) сбежать с вечеринки домой с кем-то вдвоём",
      "I have never wanted to sneak away from a party with someone",
      "Если партнёр делал это — объясняет, что для него(неё) идеальный вечер",
      "If your partner has, they describe their idea of a perfect night out"
    ),
    nhCard(
      "nh38",
      "funny",
      "🤣",
      "Я никогда не краснел(а) из-за комплимента",
      "I have never blushed because of a compliment",
      "Если партнёр делал это — получает от тебя новый комплимент",
      "If your partner has, they get a new compliment from you"
    ),
    nhCard(
      "nh39",
      "romantic",
      "🔥",
      "Я никогда не хранил(а) мелочь на память о важном человеке",
      "I have never kept a small memento of someone important to me",
      "Если партнёр делал это — рассказывает, что это была за вещь",
      "If your partner has, they tell you what it was"
    ),
    nhCard(
      "nh40",
      "spicy",
      "😈",
      "Я никогда не хотел(а) пофлиртовать, просто чтобы проверить реакцию",
      "I have never flirted just to test someone's reaction",
      "Если партнёр делал это — признаётся, что это было очень рискованно",
      "If your partner has, they admit it was pretty risky"
    ),
    nhCard(
      "nh41",
      "funny",
      "🤣",
      "Я никогда не пугался(ась) собственного сообщения на максимальной громкости",
      "I have never been startled by my own notification at max volume",
      "Если партнёр делал это — изображает этот момент",
      "If your partner has, they act out that moment"
    ),
    nhCard(
      "nh42",
      "romantic",
      "🔥",
      "Я никогда не представлял(а), как мы выглядели бы в старости",
      "I have never imagined what we'd look like when we're old",
      "Если партнёр делал это — рассказывает одну милую деталь",
      "If your partner has, they share one sweet detail"
    ),
    nhCard(
      "nh43",
      "spicy",
      "😈",
      "Я никогда не писал(а) бывшему первым(ой) после расставания",
      "I have never texted an ex first after a breakup",
      "Если партнёр делал это — рассказывает, зачем это было",
      "If your partner has, they explain why"
    ),
    nhCard(
      "nh44",
      "funny",
      "🤣",
      "Я никогда не спотыкался(ась) на ровном месте на глазах у других",
      "I have never tripped over nothing in front of other people",
      "Если партнёр делал это — показывает свой самый достойный выход из неловкости",
      "If your partner has, they show their smoothest recovery move"
    ),
    nhCard(
      "nh45",
      "romantic",
      "🔥",
      "Я никогда не хотел(а) провести целый день вдвоём без телефонов",
      "I have never wanted to spend a whole day together with no phones",
      "Если партнёр делал это — описывает этот день одной фразой",
      "If your partner has, they describe that day in one sentence"
    ),
    nhCard(
      "nh46",
      "spicy",
      "😈",
      "Я никогда не делал(а) первый шаг в отношениях",
      "I have never made the first move in a relationship",
      "Если партнёр делал это — рассказывает, как это было",
      "If your partner has, they tell the story of how it happened"
    ),
    nhCard(
      "nh47",
      "funny",
      "🤣",
      "Я никогда не делал(а) виноватое лицо, чтобы выкрутиться",
      "I have never put on a guilty face just to get out of trouble",
      "Если партнёр делал это — показывает своё лучшее виноватое лицо",
      "If your partner has, they show their best guilty face"
    ),
    nhCard(
      "nh48",
      "romantic",
      "🔥",
      "Я никогда не переслушивал(а) песню из-за воспоминаний о человеке",
      "I have never replayed a song over and over because it reminded me of someone",
      "Если партнёр делал это — называет эту песню или её настроение",
      "If your partner has, they name the song or its mood"
    ),
    nhCard(
      "nh49",
      "spicy",
      "😈",
      "Я никогда не хотел(а) поцеловать кого-то неожиданно",
      "I have never wanted to kiss someone out of the blue",
      "Если партнёр делал это — говорит, насколько это было спонтанно по шкале от 1 до 10",
      "If your partner has, they rate how spontaneous it was from 1 to 10"
    ),
    nhCard(
      "nh50",
      "funny",
      "🤣",
      "Я никогда не отправлял(а) сообщение не тому человеку",
      "I have never sent a message to the wrong person",
      "Если партнёр делал это — рассказывает, что это было за сообщение",
      "If your partner has, they tell you what the message said"
    ),
    nhCard(
      "nh51",
      "romantic",
      "🔥",
      "Я никогда не мечтал(а) о красивом признании в любви",
      "I have never dreamed of a beautiful love confession",
      "Если партнёр делал это — делится одной такой идеей",
      "If your partner has, they share one such idea"
    ),
    nhCard(
      "nh52",
      "spicy",
      "😈",
      "Я никогда не вёл(вела) себя слишком гордо после ссоры",
      "I have never been too proud to make up after a fight",
      "Если партнёр делал это — говорит одну фразу для примирения",
      "If your partner has, they say one line to make peace"
    ),
    nhCard(
      "nh53",
      "funny",
      "🤣",
      "Я никогда не делал(а) вид, что всё нормально, когда было очень смешно",
      "I have never pretended everything was fine when it was actually hilarious",
      "Если партнёр делал это — пытается не засмеяться 5 секунд, глядя на тебя",
      "If your partner has, they try not to laugh for 5 seconds while looking at you"
    ),
    nhCard(
      "nh54",
      "romantic",
      "🔥",
      "Я никогда не хотел(а) сказать человеку что-то очень нежное, но стеснялся(ась)",
      "I have never wanted to say something very tender to someone but got too shy",
      "Если партнёр делал это — говорит тебе это сейчас в мягкой форме",
      "If your partner has, they say it to you now, gently"
    ),
    nhCard(
      "nh55",
      "spicy",
      "😈",
      "Я никогда не делал(а) вид, что мне неинтересно, хотя было очень интересно",
      "I have never pretended not to be interested when I really was",
      "Если партнёр делал это — честно признаётся, когда так бывало",
      "If your partner has, they honestly admit when that happened"
    ),
    nhCard(
      "nh56",
      "funny",
      "🤣",
      "Я никогда не репетировал(а) разговор заранее в голове",
      "I have never rehearsed a conversation in my head beforehand",
      "Если партнёр делал это — изображает, как это выглядит",
      "If your partner has, they act out what that looks like"
    ),
    nhCard(
      "nh57",
      "romantic",
      "🔥",
      "Я никогда не хотел(а) провести с человеком весь день, ничего особо не делая",
      "I have never wanted to spend the whole day with someone, doing nothing in particular",
      "Если партнёр делал это — говорит, почему это для него(неё) ценно",
      "If your partner has, they say why that matters to them"
    ),
    nhCard(
      "nh58",
      "spicy",
      "😈",
      "Я никогда не делал(а) намёк вместо прямого признания",
      "I have never dropped a hint instead of just saying it directly",
      "Если партнёр делал это — признаётся, понял(а) ли кто-то этот намёк",
      "If your partner has, they admit whether anyone actually got the hint"
    ),
    nhCard(
      "nh59",
      "funny",
      "🤣",
      "Я никогда не терял(а) мысль посреди разговора",
      "I have never lost my train of thought in the middle of a conversation",
      "Если партнёр делал это — должен(на) придумать очень умный вид на 3 секунды",
      "If your partner has, they have to look extremely smart for 3 seconds"
    ),
  ];

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

  const rewardKey = `never-have:${card.id}`;
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
          {market !== "ru" ? "Never Have I Ever..." : "Я никогда не..."}
        </div>

        <div style={{ marginTop: 8, color: "#3a345c", fontSize: 15 }}>
          {market !== "ru" ? "Loading cards..." : "Загружаем карточки..."}
        </div>
      </div>

      <button onClick={onBack} style={secondaryButtonStyle}>
        {t.common.back}
      </button>
    </div>
  );
}

const rewardKey = `never-have:${card.id}`;
const alreadyPlayed = playedGameRewardKeys.includes(rewardKey);

const categoryLabel =
  market !== "ru"
    ? card.type === "romantic"
      ? "Romantic"
      : card.type === "spicy"
      ? "Bold"
      : "Funny"
    : card.type === "romantic"
    ? "Романтика"
    : card.type === "spicy"
    ? "Провокация"
    : "Смешное";

return (
  <div style={{ padding: 16, display: "grid", gap: 14 }}>
    <div style={{ ...cardBaseStyle(), padding: 18 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#1f1d3a" }}>
        {market !== "ru" ? "Never Have I Ever..." : "Я никогда не..."}
      </div>

      <div
        style={{
          marginTop: 8,
          color: "#3a345c",
          fontSize: 15,
          lineHeight: 1.45,
        }}
      >
        {market !== "ru"
          ? "Say something you've never done in your life — if your partner has done it, they complete the task on the card."
          : "Скажите что-то, чего вы никогда в жизни не делали, и если ваш партнёр делал это, он выполняет задание с карточки."}
      </div>

      <div
        style={{
          marginTop: 10,
          color: "#4d466c",
          fontSize: 14,
          lineHeight: 1.45,
        }}
      >
        {market !== "ru"
          ? "For example: “I have never played strip poker” — if your partner has done it at least once, it's their turn to complete the task."
          : "Например: «Я ни разу не играл в карты на раздевание» — если партнёр хотя бы раз делал это, ему пора выполнять задание."}
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
        {market !== "ru"
          ? `Reward per card: +${reward} points`
          : `Награда за карточку: +${reward} очков`}
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
              {card.emoji} {market !== "ru" ? "Task" : "Задание"}
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
        {market !== "ru"
          ? flipped
            ? "Show question"
            : "Show task"
          : flipped
            ? "Показать вопрос"
            : "Показать задание"}
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
    {market !== "ru"
      ? alreadyPlayed
        ? "Card already played"
        : "Card played"
      : alreadyPlayed
        ? "Карточка уже сыграна"
        : "Карточка сыграна"}
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
  pair,
  isPremium,
  showPaywall,
  onCheckDailyTestAccess,
}: {
  completedTestIds: string[];
  onBack: () => void;
  onCompleteTest: (test: TestDefinition) => Promise<void>;

  pair: PairState;
  // См. комментарий в PollsScreen — pair.isPremium читает несуществующую
  // колонку и всегда false, настоящий флаг — appState.isPremium.
  isPremium: boolean;
  showPaywall: () => void;
  // Персональный дневной лимит теста — сервер сам знает premium-статус
  // и атомарно списывает попытку. См. consumeDailyTestAccess.
  onCheckDailyTestAccess: () => Promise<{
    allowed: boolean;
    isPremium: boolean;
  } | null>;
}) {
  const [activeTestId, setActiveTestId] = useState<string | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);

  const market = getMarket();
const t = market === "fi" ? TEXT_FI : market === "en" ? TEXT_EN : TEXT_RU;
  const activeTest = TESTS.find((item) => item.id === activeTestId) || null;
  const currentQuestion = activeTest?.questions[currentQuestionIndex] || null;

 

async function startTest(testId: string) {
  if (!isPremium) {
    const access = await onCheckDailyTestAccess();

    if (!access) {
      // Не удалось проверить доступ (сеть/сервер недоступен) — не
      // открываем тест, чтобы сбой не превратился в бесплатный проход
      // мимо лимита.
      return;
    }

    if (!access.allowed) {
      showPaywall();
      return;
    }
  }

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

  async function confirmGiveawayAction(
  actionType: "poll" | "test"
) {
  try {
    const initData =
      window.Telegram?.WebApp?.initData;

    if (!initData) {
      console.error(
        "GIVEAWAY: Telegram initData отсутствует"
      );
      return false;
    }

    const response = await fetch(
      "/api/giveaway/complete-action",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          initData,
          actionType,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      console.error(
        "GIVEAWAY COMPLETE ACTION ERROR:",
        result
      );

      return false;
    }

    console.log(
      "GIVEAWAY TICKET ADDED:",
      result.entry
    );

    return true;
  } catch (error) {
    console.error(
      "GIVEAWAY REQUEST ERROR:",
      error
    );

    return false;
  }
}

async function handleFinish() {
  if (!activeTest) return;

  onCompleteTest(activeTest);

  await confirmGiveawayAction("test");

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
          {t.tests.title}
        </div>
        <div style={{ marginTop: 4, color: "#3a345c", fontSize: 13 }}>
          {t.tests.subtitle}
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
    {market !== "ru"
      ? `${test.questions.length} questions`
      : `${test.questions.length} вопросов`}
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
            
              {market !== "ru"
                ? completed
                  ? "Take again"
                  : "Start"
                : completed
                  ? "Пройти снова"
                  : "Начать"}
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
            {market !== "ru" ? "Test Result ✨" : "Результат теста ✨"}
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
            {market !== "ru"
              ? `Reward for the test: +${activeTest.reward} points`
              : `Награда за тест: +${activeTest.reward} очков`}
          </div>

          <button
            onClick={handleFinish}
            style={{ ...primaryButtonStyle, width: "100%", marginTop: 16 }}
          >
            {market !== "ru" ? "Claim points" : "Забрать очки"}
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
          {market !== "ru"
            ? `Question ${currentQuestionIndex + 1} of ${activeTest.questions.length}`
            : `Вопрос ${currentQuestionIndex + 1} из ${activeTest.questions.length}`}
        </div>
      </div>

      <div style={{ ...cardBaseStyle(), padding: 18 }}>

     {activeTest.image && (
  <img
    src={activeTest.image}
    alt={activeTest.title}
    style={{
      width: "100%",
      height: 220,
      objectFit: "cover",
      borderRadius: 22,
      marginBottom: 14,
      display: "block",
      boxShadow: "0 14px 30px rgba(80, 50, 130, 0.18)",
    }}
  />
)}
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
          {market !== "ru" ? "Exit test" : "Выйти из теста"}
        </button>
      </div>
    </div>
  );
}

// Раньше wonRewards/spinsInfo заполнялись только как побочный эффект
// вызова onSpin() — при переустановке/смене устройства история призов
// и счётчик "X/3 сегодня" пропадали, хотя реальная история давно
// хранится на сервере (wheel_spins). Подтягиваем её при открытии
// экрана через новый /api/rewards/state.
async function loadRewardsState(): Promise<{
  wonRewards: WonReward[];
  spinsInfo: { used: number; remaining: number; bonusCredits: number };
} | null> {
  const initData = window.Telegram?.WebApp?.initData;

  if (!initData) {
    console.error("loadRewardsState: Telegram initData отсутствует");
    return null;
  }

  try {
    const response = await fetch("/api/rewards/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });

    const data = await response.json();

    if (!response.ok || !data?.ok) {
      console.error("loadRewardsState error:", data);
      return null;
    }

    return { wonRewards: data.wonRewards, spinsInfo: data.spinsInfo };
  } catch (error) {
    console.error("loadRewardsState request error:", error);
    return null;
  }
}

function RewardsScreen({
  points,
  wonRewards,
  onBack,
  onSpin,
  onRewardsStateLoaded,
}: {
  points: number;
  wonRewards: WonReward[];
  onBack: () => void;
  onSpin: () => Promise<WonReward | null>;
  onRewardsStateLoaded: (wonRewards: WonReward[]) => void;
}) {

  const market = getMarket();
const t = market === "fi" ? TEXT_FI : market === "en" ? TEXT_EN : TEXT_RU;
  const [rotation, setRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedRewardId, setSelectedRewardId] = useState<string | null>(null);
  const selectedReward = wonRewards.find((item) => item.spinId === selectedRewardId) || null;
  const [showRewardScreen, setShowRewardScreen] = useState(false);

  const [rewardsExpanded, setRewardsExpanded] = useState(false);

const visibleRewards = rewardsExpanded
  ? [...wonRewards].reverse()
  : [...wonRewards].reverse().slice(0, 3);

  // Приз и очки решает сервер (spin_reward_wheel) — здесь мы только
  // подбираем, из какого каталога (RU/EN/FI) рисовать секторы колеса.
  // До первого спина ориентируемся на язык интерфейса; как только
  // приходит ответ сервера, переключаемся на реально закреплённый за
  // пользователем reward_market (result.market), чтобы секторы и текст
  // приза всегда совпадали с тем, что реально было разыграно. С
  // wheel_reward_wheel_fi.sql колесо умеет и 'fi' — Normal/Finnkino/
  // S-market, реально покупаемые в Финляндии подарочные карты.
  const [effectiveMarket, setEffectiveMarket] = useState<Market>(market);
  const wheelCategories =
    effectiveMarket === "fi"
      ? REWARD_CATEGORIES_FI
      : effectiveMarket === "en"
        ? REWARD_CATEGORIES_EN
        : REWARD_CATEGORIES_RU;

  // "Бонус" — не настоящий приз (70% вращений), а служебный исход
  // (+500 очков или +1 прокрут). У него нет записи в каталоге призов,
  // поэтому для колеса добавляем этот сектор только для отображения.
  const BONUS_DISPLAY_CATEGORY = {
    id: "bonus",
    title: t.rewards.wheelScreen.bonusSegmentLabel,
    emoji: "🎁",
  };
  const wheelDisplayCategories = [...wheelCategories, BONUS_DISPLAY_CATEGORY];

  // Теперь подтягивается сразу при открытии экрана через
  // /api/rewards/state (а не только после первого спина в этой
  // сессии) — история призов и счётчик "X/3 сегодня" переживают
  // переустановку/смену устройства, потому что реальный источник —
  // wheel_spins на сервере, а не localStorage.
  const [spinsInfo, setSpinsInfo] = useState<{
    used: number;
    remaining: number;
    bonusCredits: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadRewardsState().then((data) => {
      if (cancelled || !data) return;
      setSpinsInfo(data.spinsInfo);
      onRewardsStateLoaded(data.wonRewards);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const size = 320;
  const radius = 150;
  const center = size / 2;
  const count = wheelDisplayCategories.length;
  const segmentAngle = 360 / count;



  async function handleSpin() {
    if (isSpinning) return;
    if (points < WHEEL_SPIN_COST) {
      setMessage(t.errors.wheelInsufficientPoints);
      return;
    }

    setShowRewardScreen(false);
    setMessage("");
    setSelectedRewardId(null);
    setIsSpinning(true);

    // Сначала узнаём реальный результат у сервера, и только потом
    // анимируем колесо к уже определённому сектору — иначе мы бы
    // выбирали приз на клиенте, что как раз и было дырой в старой схеме.
    const result = await onSpin();

    if (!result) {
      setIsSpinning(false);
      setMessage(t.errors.wheelSpinFailed);
      return;
    }

    const resultCategories =
      result.market === "fi"
        ? REWARD_CATEGORIES_FI
        : result.market === "en"
          ? REWARD_CATEGORIES_EN
          : REWARD_CATEGORIES_RU;
    const resultDisplayCategories = [
      ...resultCategories,
      BONUS_DISPLAY_CATEGORY,
    ];
    setEffectiveMarket(result.market);
    setSpinsInfo({
      used: result.spinsUsedToday,
      remaining: result.spinsRemainingToday,
      bonusCredits: result.bonusSpinCredits,
    });

    // Реальный приз — крутим к его категории; любой из двух бонусов —
    // к служебному сектору "Бонус" в конце (см. BONUS_DISPLAY_CATEGORY).
    const targetIndex =
      result.outcomeType === "prize"
        ? Math.max(
            0,
            resultDisplayCategories.findIndex(
              (category) => category.id === result.categoryId,
            ),
          )
        : resultDisplayCategories.length - 1;
    const resultSegmentAngle = 360 / resultDisplayCategories.length;
    const spins = 5;
    const targetCenterAngle =
      targetIndex * resultSegmentAngle + resultSegmentAngle / 2;
    const targetRotation = spins * 360 + (360 - targetCenterAngle);

    setRotation((prev) => {
      const normalizedPrev = ((prev % 360) + 360) % 360;
      return prev - normalizedPrev + targetRotation;
    });

    setTimeout(() => {
      setIsSpinning(false);
      setSelectedRewardId(result.spinId);

      if (result.outcomeType === "bonus_points") {
        setMessage(
          t.rewards.wheelScreen.bonusPointsMessage.replace(
            "{value}",
            String(result.bonusValue ?? 500),
          ),
        );
      } else if (result.outcomeType === "bonus_spin") {
        setMessage(t.rewards.wheelScreen.bonusSpinMessage);
      } else {
        setMessage(
          t.rewards.wheelScreen.prizeWonMessage
            .replace("{title}", result.title)
            .replace("{categoryTitle}", result.categoryTitle),
        );
      }

      setShowRewardScreen(true);
    }, 4300);
  }

  return (
    <div style={{ padding: 12, display: "grid", gap: 10 }}>
     <div style={{ ...cardBaseStyle(), padding: 14 }}>
  <div style={{ fontSize: 24, fontWeight: 900, color: "#1f1d3a" }}>
    {t.rewards.wheel}
  </div>
  <div style={{ marginTop: 4, color: "#3a345c", fontSize: 13, lineHeight: 1.4 }}>
    {t.rewards.wheelScreen.spinCostPrefix} <b>{WHEEL_SPIN_COST}</b>{" "}
    {t.games.pointsUnit}
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
    {t.rewards.wheelScreen.pointsLabel} {points}
  </div>

  {spinsInfo && (
    <div style={{ marginTop: 6, color: "#3a345c", fontSize: 13 }}>
      {t.rewards.wheelScreen.todayLabel} {spinsInfo.used} / 3
      {spinsInfo.bonusCredits > 0
        ? ` ${t.rewards.wheelScreen.freeSpinsLabel} ${spinsInfo.bonusCredits}`
        : ""}
    </div>
  )}
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
            {wheelDisplayCategories.map((category, index) => {
              const startAngle = index * segmentAngle;
              const endAngle = startAngle + segmentAngle;
              const midAngle = startAngle + segmentAngle / 2;
              const textRadius = radius * 0.62;
              const textPos = polarToCartesian(center, center, textRadius, midAngle);
              const rotationForText = midAngle;

              // Больше категорий -> уже сектор -> текст скорее налезет на
              // соседей (было заметно на реальном скрине: "Активности"/
              // "Свидания"/"ЗЯ"/"WB" наезжали на иконки соседних секторов).
              // Два слоя защиты: 1) базовый размер шрифта уменьшается для
              // узких секторов, 2) textLength/lengthAdjust жёстко зажимает
              // фактическую ширину текста в доступный хорд сектора — так
              // переполнение невозможно вообще, при любом числе призов
              // (10 у RU, меньше у EN/FI).
              const emojiFontSize = segmentAngle < 40 ? 16 : segmentAngle < 55 ? 19 : 22;
              const titleFontSize = segmentAngle < 40 ? 8.5 : segmentAngle < 55 ? 9.5 : 11;
              const maxChordWidth =
                2 * textRadius * Math.sin((segmentAngle / 2) * (Math.PI / 180)) * 0.86;
              const titleWidth = category.title.length * titleFontSize * 0.62;
              const titleTextLength =
                titleWidth > maxChordWidth ? maxChordWidth : undefined;

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
                      fontSize={emojiFontSize}
                      fontWeight="700"
                    >
                      {category.emoji}
                    </text>
                    <text
                      x="0"
                      y="14"
                      textAnchor="middle"
                      fill="#241b40"
                      fontSize={titleFontSize}
                      fontWeight="800"
                      textLength={titleTextLength}
                      lengthAdjust={titleTextLength ? "spacingAndGlyphs" : undefined}
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
          {isSpinning
            ? t.rewards.wheelScreen.spinningLabel
            : `${t.rewards.wheelScreen.spinButtonPrefix} ${WHEEL_SPIN_COST} ${t.games.pointsUnit}`}
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

     

{showRewardScreen && selectedReward && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(20,16,40,0.75)",
      backdropFilter: "blur(6px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
      padding: 16,
    }}
  >
    <div
      style={{
        width: "100%",
        maxWidth: 360,
        borderRadius: 24,
        padding: 20,
        background: "linear-gradient(135deg,#ffffff,#f6f3ff)",
        textAlign: "center",
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        animation: "popIn 0.4s ease",
      }}
    >
      {/* 🎉 Заголовок */}
      <div style={{ fontSize: 26, fontWeight: 900 }}>
        {t.rewards.wheelScreen.congratsTitle}
      </div>

      {/* 🎁 Приз */}
      <div
        style={{
          marginTop: 12,
          fontSize: 20,
          fontWeight: 800,
          color: "#6b5cff",
        }}
      >
        {selectedReward.title}
      </div>

      {/* 💬 описание */}
      <div
        style={{
          marginTop: 8,
          fontSize: 14,
          color: "#4b446a",
          lineHeight: 1.4,
        }}
      >
        {t.rewards.wheelScreen.wonPrizeText}
      </div>

      {/* 🔘 кнопка */}
      <button
        onClick={() => {
          const text = encodeURIComponent(
            t.rewards.wheelScreen.managerMessageTemplate.replace(
              "{title}",
              selectedReward.title
            )
          );
          const url = `${MANAGER_CHAT_URL}?text=${text}`;

          if (
  typeof window !== "undefined" &&
  window.Telegram?.WebApp?.openTelegramLink
) {
  window.Telegram.WebApp.openTelegramLink(url);
} else {
  window.open(url, "_blank");
}
        }}
        style={{
          ...primaryButtonStyle,
          width: "100%",
          marginTop: 16,
          padding: "14px",
          fontSize: 16,
        }}
      >
        {t.rewards.wheelScreen.claimPrizeButton}
      </button>

      {/* ❌ закрыть */}
      <button
        onClick={() => setShowRewardScreen(false)}
        style={{
          marginTop: 10,
          fontSize: 13,
          color: "#6b5cff",
          background: "none",
          border: "none",
          cursor: "pointer",
        }}
      >
        {t.common.close}
      </button>
    </div>
  </div>
)}

      <div style={{ ...cardBaseStyle(), padding: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#1f1d3a" }}>
          {t.rewards.wheelScreen.wonRewardsTitle}
        </div>

        {wonRewards.length === 0 ? (
          <div style={{ marginTop: 10, color: "#4a4468", lineHeight: 1.5 }}>
            {t.rewards.wheelScreen.emptyPrizesText}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {visibleRewards.map((reward) => (
              <div
                key={reward.spinId}
                style={{
                  padding: "12px 14px",
                  borderRadius: 16,
                  background:
                    reward.spinId === selectedRewardId
                      ? "rgba(255,255,255,0.34)"
                      : "rgba(255,255,255,0.24)",
                  border:
                    reward.spinId === selectedRewardId
                      ? "2px solid rgba(108,58,255,0.42)"
                      : "1px solid transparent",
                }}
              >
                <div style={{ fontWeight: 900, color: "#241b40" }}>
                  {reward.title}
                </div>
                <div style={{ marginTop: 4, fontSize: 14, color: "#4d466c" }}>
                  {t.rewards.wheelScreen.categoryLabel} {reward.categoryTitle}
                </div>
                <div style={{ marginTop: 2, fontSize: 13, color: "#5b5578" }}>
                  {reward.wonAt}
                </div>
              </div>
            ))}
          </div>
        )}
        {wonRewards.length > 3 && (
  <button
    onClick={() => setRewardsExpanded((prev) => !prev)}
    style={{
      ...secondaryButtonStyle,
      width: "100%",
      marginTop: 12,
      padding: "10px 16px",
    }}
  >
    {rewardsExpanded
      ? t.rewards.wheelScreen.collapsePrizes
      : t.rewards.wheelScreen.showAllPrizes}
  </button>
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
  const market = getMarket();
  const t = market === "fi" ? TEXT_FI : market === "en" ? TEXT_EN : TEXT_RU;
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
          {t.genderSelect.title}
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
  {t.genderSelect.subtitle}
</div>

        <button
          style={{ ...primaryButtonStyle, width: "100%", marginTop: 18 }}
          onClick={() => onSelect("boy")}
        >
          {t.genderSelect.boy}
        </button>

        <button
          style={{ ...secondaryButtonStyle, width: "100%", marginTop: 10 }}
          onClick={() => onSelect("girl")}
        >
          {t.genderSelect.girl}
        </button>
      </div>
    </div>
  );
}

function TopPlayersScreen({
  user,
  pair,

  leaderboard,
  previousLeaderboard,

  userLeaderboard,
  previousUserLeaderboard,

  weeklyTopRewardClaimedWeek,

  onBack,
  onClaimWeeklyReward,
  onRefresh,
  refreshing,

  t,
}: {
  user: TgUser | null;
  pair: PairState;

  leaderboard: WeeklyPairLeaderboardRow[];
  previousLeaderboard: WeeklyPairLeaderboardRow[];

  userLeaderboard: WeeklyUserLeaderboardRow[];
  previousUserLeaderboard: WeeklyUserLeaderboardRow[];

  weeklyTopRewardClaimedWeek: string | null;

  onBack: () => void;
  onClaimWeeklyReward: () => void;
  onRefresh: () => Promise<void>;

  refreshing: boolean;
  t: any;
}) {
  const previousWeekKey = getPreviousWeekKey();

  const [topMode, setTopMode] = useState<"solo" | "pair">("solo");
  const [topExpanded, setTopExpanded] = useState(false);

  // -----------------------------
  // ПАРНЫЙ РЕЙТИНГ
  // -----------------------------

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

  const currentPairRow = allPairs.find(
    (row) => row.isCurrentPair
  );

  const previousWeekPairRow = previousWeekPairs.find(
    (row) => row.isCurrentPair
  );

  // -----------------------------
  // СОЛЬНЫЙ РЕЙТИНГ
  // -----------------------------

  const allUsers = userLeaderboard.map((row, index) => ({
    ...row,
    place: index + 1,
    isCurrentUser:
      Number(row.telegram_id) === Number(user?.id),
  }));

  const previousWeekUsers = previousUserLeaderboard.map(
    (row, index) => ({
      ...row,
      place: index + 1,
      isCurrentUser:
        Number(row.telegram_id) === Number(user?.id),
    })
  );

  const currentUserRow = allUsers.find(
    (row) => row.isCurrentUser
  );

  const previousWeekUserRow = previousWeekUsers.find(
    (row) => row.isCurrentUser
  );

  // После переключения вкладки сворачиваем рейтинг
  const handleChangeMode = (mode: "solo" | "pair") => {
    setTopMode(mode);
    setTopExpanded(false);
  };

  const activeRows =
    topMode === "solo" ? allUsers : allPairs;

  const visibleRows = topExpanded
    ? activeRows.slice(0, 10)
    : activeRows.slice(0, 3);

  // Пока награда недели остаётся только для парного топа
  const wasPairTopThreeLastWeek = [1, 2, 3].includes(
    previousWeekPairRow?.place ?? 0
  );

  const alreadyClaimedLastWeek =
    weeklyTopRewardClaimedWeek === previousWeekKey;

  const canClaimWeeklyReward =
    topMode === "pair" &&
    wasPairTopThreeLastWeek &&
    !alreadyClaimedLastWeek;

  function getPlaceBackground(place: number) {
    if (place === 1) {
      return "linear-gradient(135deg, #ffd54f, #ffb300)";
    }

    if (place === 2) {
      return "linear-gradient(135deg, #f4f4f4, #c8c8c8)";
    }

    if (place === 3) {
      return "linear-gradient(135deg, #ffcc80, #ff9e80)";
    }

    return "rgba(255,255,255,0.45)";
  }

  function getPlaceEmoji(place: number) {
    if (place === 1) return "🥇";
    if (place === 2) return "🥈";
    if (place === 3) return "🥉";

    return String(place);
  }

  return (
    <div
      style={{
        padding: 12,
        display: "grid",
        gap: 10,
      }}
    >
      <style>
        {`
          @keyframes topRefreshSpin {
            from {
              transform: rotate(0deg);
            }

            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>

      {/* Заголовок */}

      <div
        style={{
          ...cardBaseStyle(),
          padding: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 24,
                fontWeight: 900,
                color: "#1f1d3a",
              }}
            >
              🏆 {t.top.title}
            </div>

            <div
              style={{
                marginTop: 4,
                color: "#3a345c",
                fontSize: 13,
                lineHeight: 1.4,
              }}
            >
              {topMode === "solo"
                ? t.top.screen.soloSubtitle
                : t.top.screen.pairSubtitle}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              void onRefresh();
            }}
            disabled={refreshing}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              flexShrink: 0,
              minHeight: 38,
              padding: "9px 12px",
              border: "1px solid rgba(108,58,255,0.18)",
              borderRadius: 14,
              background: "rgba(255,255,255,0.35)",
              color: "#332b55",
              fontSize: 12,
              fontWeight: 900,
              cursor: refreshing ? "default" : "pointer",
              opacity: refreshing ? 0.65 : 1,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <span
              style={{
                display: "inline-block",
                fontSize: 16,
                lineHeight: 1,
                animation: refreshing
                  ? "topRefreshSpin 0.8s linear infinite"
                  : "none",
              }}
            >
              ↻
            </span>

            {refreshing ? "..." : t.top.screen.refresh}
          </button>
        </div>

        {/* Переключатель рейтинга */}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
            marginTop: 16,
            padding: 5,
            borderRadius: 17,
            background: "rgba(255,255,255,0.25)",
          }}
        >
          <button
            type="button"
            onClick={() => handleChangeMode("solo")}
            style={{
              border: "none",
              borderRadius: 13,
              minHeight: 45,
              padding: "10px 8px",
              fontSize: 14,
              fontWeight: 900,
              cursor: "pointer",
              transition:
                "transform 0.15s ease, background 0.15s ease",
              background:
                topMode === "solo"
                  ? "linear-gradient(135deg, #7657ff, #a36cff)"
                  : "transparent",
              color:
                topMode === "solo"
                  ? "#ffffff"
                  : "#393253",
              boxShadow:
                topMode === "solo"
                  ? "0 8px 18px rgba(108,58,255,0.22)"
                  : "none",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {t.top.screen.soloTabLabel}
          </button>

          <button
            type="button"
            onClick={() => handleChangeMode("pair")}
            style={{
              border: "none",
              borderRadius: 13,
              minHeight: 45,
              padding: "10px 8px",
              fontSize: 14,
              fontWeight: 900,
              cursor: "pointer",
              transition:
                "transform 0.15s ease, background 0.15s ease",
              background:
                topMode === "pair"
                  ? "linear-gradient(135deg, #ff62a9, #ff7c86)"
                  : "transparent",
              color:
                topMode === "pair"
                  ? "#ffffff"
                  : "#393253",
              boxShadow:
                topMode === "pair"
                  ? "0 8px 18px rgba(255,98,169,0.22)"
                  : "none",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {t.top.screen.pairTabLabel}
          </button>
        </div>
      </div>

      {/* Рейтинг */}

      <div
        style={{
          ...cardBaseStyle(),
          padding: 14,
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
          <div
            style={{
              fontSize: 18,
              fontWeight: 900,
              color: "#1f1d3a",
            }}
          >
            {topMode === "solo"
              ? t.top.screen.soloRankingTitle
              : t.top.screen.pairRankingTitle}
          </div>

          <div
            style={{
              padding: "6px 9px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.32)",
              color: "#5d547b",
              fontSize: 11,
              fontWeight: 900,
              whiteSpace: "nowrap",
            }}
          >
            {t.top.screen.currentWeekBadge}
          </div>
        </div>

        {activeRows.length === 0 ? (
          <div
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: 16,
              background: "rgba(255,255,255,0.22)",
              color: "#4a4468",
              lineHeight: 1.45,
              fontSize: 14,
              textAlign: "center",
            }}
          >
            {topMode === "solo"
              ? t.top.screen.soloEmpty
              : t.top.screen.pairEmpty}
          </div>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gap: 8,
                marginTop: 12,
              }}
            >
              {topMode === "solo"
                ? visibleRows.map((unknownRow) => {
                    const userRow =
                      unknownRow as WeeklyUserLeaderboardRow & {
                        place: number;
                        isCurrentUser: boolean;
                      };

                    const isTop1 = userRow.place === 1;

                    return (
                      <div
                        key={`${userRow.week_key}-${userRow.telegram_id}`}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 16,
                          background: userRow.isCurrentUser
                            ? "linear-gradient(135deg, rgba(118,87,255,0.16), rgba(255,255,255,0.38))"
                            : "rgba(255,255,255,0.24)",
                          border: userRow.isCurrentUser
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
                            width: 36,
                            height: 36,
                            borderRadius: 999,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            fontWeight: 900,
                            fontSize:
                              userRow.place <= 3 ? 18 : 14,
                            color: "#1f1d3a",
                            background: getPlaceBackground(
                              userRow.place
                            ),
                          }}
                        >
                          {getPlaceEmoji(userRow.place)}
                        </div>

                        {userRow.photo_url ? (
                          <img
                            src={userRow.photo_url}
                            alt={userRow.display_name}
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 999,
                              objectFit: "cover",
                              flexShrink: 0,
                              border:
                                "2px solid rgba(255,255,255,0.55)",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 999,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                              background:
                                "linear-gradient(135deg, #9d81ff, #ff8bbd)",
                              color: "#ffffff",
                              fontSize: 15,
                              fontWeight: 900,
                            }}
                          >
                            {(userRow.display_name || "U")
                              .trim()
                              .charAt(0)
                              .toUpperCase()}
                          </div>
                        )}

                        <div
                          style={{
                            minWidth: 0,
                            flex: 1,
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 900,
                              color: "#241b40",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {userRow.display_name}

                            {userRow.isCurrentUser
                              ? " (Вы)"
                              : ""}
                          </div>

                          <div
                            style={{
                              marginTop: 3,
                              fontSize: 12,
                              color: "#4d466c",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {isTop1
                              ? t.top.screen.leaderOfWeek
                              : userRow.username
                              ? `@${userRow.username.replace(
                                  /^@/,
                                  ""
                                )}`
                              : t.top.screen.placeTemplate.replace(
                                  "{place}",
                                  String(userRow.place)
                                )}
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
                          ⭐ {userRow.total_points}
                        </div>
                      </div>
                    );
                  })
                : visibleRows.map((unknownRow) => {
                    const pairRow =
                      unknownRow as WeeklyPairLeaderboardRow & {
                        place: number;
                        isCurrentPair: boolean;
                      };

                    const isTop1 = pairRow.place === 1;

                    return (
                      <div
                        key={pairRow.id}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 16,
                          background: pairRow.isCurrentPair
                            ? "linear-gradient(135deg, rgba(255,98,169,0.16), rgba(255,255,255,0.38))"
                            : "rgba(255,255,255,0.24)",
                          border: pairRow.isCurrentPair
                            ? "2px solid rgba(255,98,169,0.42)"
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
                            width: 36,
                            height: 36,
                            borderRadius: 999,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            fontWeight: 900,
                            fontSize:
                              pairRow.place <= 3 ? 18 : 14,
                            color: "#1f1d3a",
                            background: getPlaceBackground(
                              pairRow.place
                            ),
                          }}
                        >
                          {getPlaceEmoji(pairRow.place)}
                        </div>

                        <div
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: 999,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            background:
                              "linear-gradient(135deg, #ff85bc, #ff8c86)",
                            color: "#ffffff",
                            fontSize: 19,
                            fontWeight: 900,
                            border:
                              "2px solid rgba(255,255,255,0.55)",
                          }}
                        >
                          💕
                        </div>

                        <div
                          style={{
                            minWidth: 0,
                            flex: 1,
                          }}
                        >
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

                            {pairRow.isCurrentPair
                              ? t.top.screen.youSuffix
                              : ""}
                          </div>

                          <div
                            style={{
                              marginTop: 3,
                              fontSize: 12,
                              color: "#4d466c",
                            }}
                          >
                            {isTop1
                              ? t.top.leadersOfWeek
                              : t.top.screen.placeTemplate.replace(
                                  "{place}",
                                  String(pairRow.place)
                                )}
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

            {activeRows.length > 3 && (
              <button
                type="button"
                onClick={() =>
                  setTopExpanded((prev) => !prev)
                }
                style={{
                  ...secondaryButtonStyle,
                  width: "100%",
                  marginTop: 12,
                  padding: "10px 16px",
                }}
              >
                {topExpanded
                  ? t.top.screen.collapseRanking
                  : t.top.screen.showTop10}
              </button>
            )}
          </>
        )}
      </div>

      {/* Личное место пользователя или пары — показываем только если
          человек/пара НЕ виден(на) в уже отображённом списке выше
          (иначе это дублирует то, что и так на экране). */}

      {topMode === "solo" &&
        !(currentUserRow && currentUserRow.place <= visibleRows.length) && (
        <div
          style={{
            ...cardBaseStyle(),
            padding: 14,
          }}
        >
          <div
            style={{
              fontSize: 17,
              fontWeight: 900,
              color: "#1f1d3a",
            }}
          >
            {t.top.screen.yourPlaceTitle}
          </div>

          <div
            style={{
              marginTop: 10,
              padding: "12px 14px",
              borderRadius: 16,
              background: "rgba(255,255,255,0.25)",
              color: "#30294d",
              fontSize: 14,
              fontWeight: 800,
              lineHeight: 1.45,
            }}
          >
            {currentUserRow
              ? t.top.screen.yourPlaceText
                  .replace("{place}", String(currentUserRow.place))
                  .replace(
                    "{points}",
                    String(currentUserRow.total_points)
                  )
              : t.top.screen.yourPlaceEmptyText}
          </div>
        </div>
      )}

      {topMode === "pair" &&
        !(currentPairRow && currentPairRow.place <= visibleRows.length) && (
        <div
          style={{
            ...cardBaseStyle(),
            padding: 14,
          }}
        >
          <div
            style={{
              fontSize: 17,
              fontWeight: 900,
              color: "#1f1d3a",
            }}
          >
            {t.top.screen.yourPairPlaceTitle}
          </div>

          <div
            style={{
              marginTop: 10,
              padding: "12px 14px",
              borderRadius: 16,
              background: "rgba(255,255,255,0.25)",
              color: "#30294d",
              fontSize: 14,
              fontWeight: 800,
              lineHeight: 1.45,
            }}
          >
            {!pair.pairId
              ? t.top.screen.pairNeedsPartnerText
              : currentPairRow
              ? t.top.screen.yourPairPlaceText
                  .replace("{place}", String(currentPairRow.place))
                  .replace(
                    "{points}",
                    String(currentPairRow.total_points)
                  )
              : t.top.screen.pairNoRankYetText}
          </div>
        </div>
      )}

      {/* Награда недели */}

      <div
        style={{
          ...cardBaseStyle(),
          padding: 14,
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 900,
            color: "#1f1d3a",
          }}
        >
          {t.top.screen.weeklyRewardTitle}
        </div>

        {topMode === "solo" ? (
          <div
            style={{
              marginTop: 10,
              padding: "12px 14px",
              borderRadius: 16,
              background: "rgba(255,255,255,0.24)",
              color: "#4a4468",
              lineHeight: 1.45,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {t.top.screen.soloRewardComingSoon}
          </div>
        ) : (
          <>
            <div
              style={{
                marginTop: 8,
                color: "#4a4468",
                lineHeight: 1.45,
                fontSize: 13,
              }}
            >
              {t.top.screen.topThreeRewardPrefix}{" "}
              <b>+500 {t.top.points.toLowerCase()}</b>.
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
                lineHeight: 1.45,
              }}
            >
              {!pair.pairId
                ? t.top.screen.connectPartnerForRankingText
                : wasPairTopThreeLastWeek
                ? alreadyClaimedLastWeek
                  ? t.top.screen.rewardAlreadyClaimedText
                  : t.top.screen.rewardAvailableText
                : t.top.screen.rewardOnlyTopThreeText}
            </div>

            {canClaimWeeklyReward && (
              <button
                type="button"
                onClick={onClaimWeeklyReward}
                style={{
                  ...primaryButtonStyle,
                  width: "100%",
                  marginTop: 12,
                }}
              >
                {t.top.screen.claimRewardButton}
              </button>
            )}
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onBack}
        style={{
          ...secondaryButtonStyle,
          width: "100%",
          marginTop: 0,
        }}
      >
        {t.common.back}
      </button>
      
    </div>
  );
}

function FreePremiumScreen({
  onBack,
}: {
  onBack: () => void;
}) {
  return (
    <div style={{ padding: 16, display: "grid", gap: 14 }}>
      <div style={{ ...cardBaseStyle(), padding: 20 }}>
        <div
          style={{
            fontSize: 26,
            fontWeight: 900,
            color: "#241b40",
          }}
        >
          🎁 Premium бесплатно
        </div>

        <div
          style={{
            marginTop: 12,
            lineHeight: 1.6,
            color: "#4b446a",
          }}
        >
          Подпишитесь на два наших канала и получите Premium бесплатно.
        </div>

        <button
  onClick={() =>
    window.open(
      "https://t.me/+UEOCfzXBdI8wZTA8",
      "_blank"
    )
  }
  style={{
    ...primaryButtonStyle,
    width: "100%",
    marginTop: 18,
  }}
>
  💖 Канал про отношения
</button>

        <button
  onClick={() =>
    window.open(
      "https://t.me/+VbnjVHz0pzsxMjlk",
      "_blank"
    )
  }
  style={{
    ...primaryButtonStyle,
    width: "100%",
    marginTop: 10,
  }}
>
  🎮 Couple Quizzes
</button>

        <button
  onClick={async () => {
    // telegramId сервер теперь достаёт сам из подписанного initData —
    // раньше принимался прямо из тела запроса без проверки.
    const initData = window.Telegram?.WebApp?.initData;

    if (!initData) {
      alert(t.errors.telegramNotDetected);
      return;
    }

    const response = await fetch(
      "/api/check-free-premium",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          initData,
        }),
      }
    );


    const result = await response.json();

if (result.success) {
  const untilText = result.expiresAt
    ? new Date(result.expiresAt).toLocaleDateString("ru-RU")
    : null;

  alert(
    untilText
      ? `🎉 Premium активирован до ${untilText}!`
      : "🎉 Premium активирован!"
  );
  window.location.reload();
} else {
  console.error("FREE PREMIUM RESULT:", result);

  alert(
    result.error ||
      `Канал отношений: ${result.relationStatus ?? "неизвестно"}\n` +
        `Couple Quizzes: ${result.cqStatus ?? "неизвестно"}`
  );
}
  }}
  style={{
    width: "100%",
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    border: "none",
    background: "#241b40",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
  }}
>
  ✅ Проверить и активировать Premium
</button>
      </div>

      <button
        onClick={onBack}
        style={secondaryButtonStyle}
      >
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
         {t.referrals.title}
      </div>
    </div>

    {/* Основная карточка */}
    <div style={{ ...cardBaseStyle(), padding: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#1f1d3a" }}>
          {t.referrals.programTitle}
        </div>

        <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.5, color: "#5f5a7a" }}>
          {t.referrals.subtitle}
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          <div style={{ ...cardBaseStyle(), padding: 14 }}>
            <div style={{ fontSize: 13, color: "#7b7698", fontWeight: 700 }}>
              {t.referrals.invitedFriends}
            </div>
            <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900, color: "#1f1d3a" }}>
              {appState.referrals.invitedUsers.length}
            </div>
          </div>

          <div style={{ ...cardBaseStyle(), padding: 14 }}>
            <div style={{ fontSize: 13, color: "#7b7698", fontWeight: 700 }}>
              {t.referrals.earnedPoints}
            </div>
            <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900, color: "#6b46ff" }}>
              +{appState.referrals.totalReward}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, color: "#7b7698", fontWeight: 700, marginBottom: 8 }}>
            {t.referrals.yourLink}
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
            {inviteLink || t.referrals.linkLoadingFallback}
          </div>
        </div>

        <button
          style={{ ...primaryButtonStyle, width: "100%", marginTop: 16 }}
          onClick={handleInvite}
        >
          {t.referrals.inviteButton}
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
const t = market === "fi" ? TEXT_FI : market === "en" ? TEXT_EN : TEXT_RU;
  const fullName =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    "Пользователь";

 const pairStats = calculatePairStats(pairPollAnswers);

  // Apple Guideline 5.1.1(v) — apps with account creation must offer
  // in-app account deletion. Only the Capacitor build has a real
  // Supabase Auth account to delete; Telegram users never see this.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  async function handleDeleteAccount() {
    setDeletingAccount(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        alert(t.account.deleteAccountError);
        setDeletingAccount(false);
        return;
      }

      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supabaseAccessToken: accessToken }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        alert(t.account.deleteAccountError);
        setDeletingAccount(false);
        return;
      }

      await supabase.auth.signOut();
      window.location.reload();
    } catch (error) {
      console.error("handleDeleteAccount error:", error);
      alert(t.account.deleteAccountError);
      setDeletingAccount(false);
    }
  }


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
    👑 Premium активен
  </div>
) : (
  <div style={{ marginTop: 6, display: "grid", gap: 8 }}>
    <button
      onClick={() => onNavigate("paywall")}
      style={{
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
      {t.paywall.unlockButton} ✨
    </button>

    {/* Временно скрыто на всех платформах по просьбе Артёма (не
        только в iOS) — легко вернуть, поменяв false обратно на
        условие/true. */}
    {false && (
      <button
        onClick={() => onNavigate("freePremium")}
        style={{
          marginTop: 6,
          padding: "6px 10px",
          fontSize: 12,
          borderRadius: 999,
          border: "1px solid rgba(143,107,255,0.3)",
          background: "rgba(255,255,255,0.4)",
          color: "#241b40",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        🎁 Получить Premium бесплатно
      </button>
    )}

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
    {market !== "ru" ? "Invite friends 👥" : "Пригласи друзей 👥"}
  </div>

  <div
    style={{
      marginTop: 8,
      color: "#4b446a",
      fontSize: 14,
      lineHeight: 1.45,
    }}
  >
    {t.referrals.cardText}
  </div>



  <button
  onClick={() => onNavigate("referrals")}
  style={{ ...primaryButtonStyle, width: "100%", marginTop: 12 }}
>
  {t.referrals.inviteButton}
</button>

</div>

{isCapacitorApp() && (
  <div style={{ ...cardBaseStyle(), padding: 18 }}>
    <div style={{ fontSize: 16, fontWeight: 900, color: "#8a2f2f" }}>
      {t.account.deleteAccountTitle}
    </div>
    <div
      style={{
        marginTop: 6,
        color: "#4b446a",
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      {t.account.deleteAccountText}
    </div>

    {confirmingDelete ? (
      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#8a2f2f" }}>
          {t.account.deleteAccountConfirmText}
        </div>
        <button
          onClick={handleDeleteAccount}
          disabled={deletingAccount}
          style={{
            border: "none",
            borderRadius: 16,
            padding: "12px 16px",
            background: "#c1352f",
            color: "#fff",
            fontWeight: 800,
            fontSize: 14,
            cursor: deletingAccount ? "default" : "pointer",
            opacity: deletingAccount ? 0.7 : 1,
          }}
        >
          {deletingAccount
            ? t.common.loading
            : t.account.deleteAccountConfirmButton}
        </button>
        <button
          onClick={() => setConfirmingDelete(false)}
          disabled={deletingAccount}
          style={secondaryButtonStyle}
        >
          {t.account.deleteAccountCancelButton}
        </button>
      </div>
    ) : (
      <button
        onClick={() => setConfirmingDelete(true)}
        style={{
          border: "1px solid rgba(193,53,47,0.35)",
          borderRadius: 16,
          padding: "12px 16px",
          background: "rgba(193,53,47,0.08)",
          color: "#8a2f2f",
          fontWeight: 800,
          fontSize: 14,
          cursor: "pointer",
          marginTop: 12,
          width: "100%",
        }}
      >
        {t.account.deleteAccountButton}
      </button>
    )}
  </div>
)}

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

// Профиль (имя/юзернейм/фото) теперь пишется только через
// /api/profile/bootstrap: сервер сам достаёт эти поля из подписанного
// initData, а не из тела запроса — значения TgUser здесь используются
// только для раннего return, если Telegram user вообще недоступен.
// RPC bootstrap_profile трогает исключительно display-поля, никогда
// pair_id/solo_points/premium и т.д.
async function upsertTelegramProfile(user: TgUser): Promise<{
  telegramId: number;
  pairId: string | null;
  soloPoints: number;
  soloWeeklyPoints: number;
  soloWeeklyPointsWeek: string | null;
} | null> {
  if (!user.id) return null;

  const initData = window.Telegram?.WebApp?.initData;

  if (!initData) {
    console.error("upsertTelegramProfile: Telegram initData отсутствует");
    return null;
  }

  try {
    const response = await fetch("/api/profile/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });

    const data = await response.json();

    if (!response.ok || !data?.ok) {
      console.error("upsertTelegramProfile error:", data);
      return null;
    }

    return {
      telegramId: Number(data.telegramId),
      pairId: data.pairId ?? null,
      soloPoints: Number(data.soloPoints ?? 0),
      soloWeeklyPoints: Number(data.soloWeeklyPoints ?? 0),
      soloWeeklyPointsWeek: data.soloWeeklyPointsWeek ?? null,
    };
  } catch (error) {
    console.error("upsertTelegramProfile request error:", error);
    return null;
  }
}

type GiveawayActionResult = {
  success: boolean;
  ticketAdded?: boolean;
  tickets?: number;
  message?: string;
};

async function completeGiveawayAction(
  actionType: "poll" | "test"
): Promise<GiveawayActionResult> {
  try {
    const initData = window.Telegram?.WebApp?.initData;

    if (!initData) {
      return {
        success: false,
        ticketAdded: false,
        message: "Telegram initData не найден",
      };
    }

    const response = await fetch("/api/giveaway/complete-action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        initData,
        actionType,
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        success: false,
        ticketAdded: false,
        message:
          data?.message ||
          data?.error ||
          "Не удалось проверить выполнение задания",
      };
    }

    return {
      success: Boolean(data?.success),
      ticketAdded: Boolean(data?.ticketAdded),
      tickets:
        typeof data?.tickets === "number"
          ? data.tickets
          : undefined,
      message: data?.message,
    };
  } catch (error) {
    console.error("COMPLETE GIVEAWAY ACTION ERROR:", error);

    return {
      success: false,
      ticketAdded: false,
      message: "Ошибка соединения с сервером",
    };
  }
}

async function loadWeeklyPairLeaderboard(weekKey: string): Promise<WeeklyPairLeaderboardRow[]> {
  // Сортировка должна побитово совпадать с ранжированием внутри RPC
  // claim_weekly_pair_top_reward (total_points desc, updated_at asc,
  // pair_id asc), иначе UI и сервер могут по-разному решить, кто занял
  // 3-е место при равенстве очков.
  const { data, error } = await supabase
    .from("weekly_pair_leaderboard")
    .select("*")
    .eq("week_key", weekKey)
    .order("total_points", { ascending: false })
    .order("updated_at", { ascending: true })
    .order("pair_id", { ascending: true })
    .limit(20);

  if (error || !data) {
    console.error("loadWeeklyPairLeaderboard error:", error);
    return [];
  }

  return data as WeeklyPairLeaderboardRow[];
}

async function loadWeeklyUserLeaderboard(
  weekKey: string
): Promise<WeeklyUserLeaderboardRow[]> {
  const { data, error } = await supabase
    .from("weekly_user_leaderboard")
    .select("*")
    .eq("week_key", weekKey)
    .order("total_points", { ascending: false })
    .limit(20);

  if (error || !data) {
    console.error(
      "loadWeeklyUserLeaderboard error:",
      error
    );

    return [];
  }

  return data as WeeklyUserLeaderboardRow[];
}

// upsertWeeklyPairLeaderboardEntry()/upsertWeeklyUserLeaderboardEntry()
// removed (security-pass finding): they wrote directly to
// weekly_pair_leaderboard/weekly_user_leaderboard with the public
// anon key, client-computed totalPoints, no server validation —
// confirmed live-exploitable (anyone could POST arbitrary points for
// any pair_id/telegram_id via the anon key alone, then fraudulently
// claim the weekly top-3 reward). Removed the client write path
// entirely; see supabase/weekly_leaderboard_lockdown.sql — both
// tables are now revoked from anon/authenticated writes and kept in
// sync exclusively by server-side triggers (sync_pair_weekly_leaderboard
// on pairs.weekly_points, sync_user_weekly_leaderboard on
// profiles.solo_weekly_points), which fire automatically whenever a
// legitimate server RPC updates those columns. The client only reads.

const EMPTY_PAIR_STATE: PairState = {
  pairId: null,
  inviteCode: null,
  partner: null,
  createdByTelegramId: null,
  totalPoints: 0,
  weeklyPoints: 0,

  dailyTestsUsed: 0,
  dailyPollsUsed: 0,
  dailyGamesUsed: 0,
  dailyLimitDate: null,
  isPremium: false,
  weeklyTopRewardClaimedWeek: null,
};

// Раньше это была прямая цепочка supabase.from("profiles"/"pairs")
// .select(...) анонимным ключом — теперь тот же результат отдаёт
// сервер через /api/pair/state (см. lib/server/pair-state.ts), где
// telegramId уже подтверждён подписанным initData. Сигнатура функции
// (принимает telegramId, отдаёт PairState) намеренно не менялась —
// все существующие call sites (после начисления очков и т.п.)
// продолжают работать без изменений.
async function loadPairStateForUser(telegramId: number): Promise<PairState> {
  const initData = window.Telegram?.WebApp?.initData;

  if (!initData) {
    console.error("loadPairStateForUser: Telegram initData отсутствует");
    return EMPTY_PAIR_STATE;
  }

  try {
    const response = await fetch("/api/pair/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });

    const data = await response.json();

    if (!response.ok || !data?.ok || !data?.pair) {
      console.error("loadPairStateForUser error:", data);
      return EMPTY_PAIR_STATE;
    }

    return data.pair as PairState;
  } catch (error) {
    console.error("loadPairStateForUser request error:", error);
    return EMPTY_PAIR_STATE;
  }
}

type ActivityAwardResult = {
  awarded: boolean;
  soloPoints: number;
  soloWeeklyPoints: number;
  pairTotalPoints: number | null;
  pairWeeklyPoints: number | null;
};

// Сумму (delta) и pairId сервер теперь определяет сам — клиент присылает
// initData + activityType/id и не может повлиять на начисленную сумму
// (см. app/api/activity/award/route.ts и config/reward-catalog.ts).
async function awardActivityPoints(params: {
  activityType:
    | "test"
    | "poll"
    | "game"
    | "game-step"
    | "completion";
  id: string;
}): Promise<ActivityAwardResult | null> {
  const { activityType, id } = params;

  const initData = window.Telegram?.WebApp?.initData;

  if (!initData) {
    console.error(
      "awardActivityPoints: Telegram initData отсутствует"
    );
    return null;
  }

  let data: any = null;

  try {
    const response = await fetch("/api/activity/award", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData, activityType, id }),
    });

    data = await response.json();

    if (!response.ok) {
      console.error("awardActivityPoints error:", data);
      return null;
    }
  } catch (error) {
    console.error("awardActivityPoints request error:", error);
    return null;
  }

  if (!data) {
    console.error(
      "awardActivityPoints returned no data"
    );
    return null;
  }

  return {
    awarded: Boolean(data.awarded),

    soloPoints: Number(
      data.soloPoints ?? 0
    ),

    soloWeeklyPoints: Number(
      data.soloWeeklyPoints ?? 0
    ),

    pairTotalPoints:
      data.pairTotalPoints == null
        ? null
        : Number(data.pairTotalPoints),

    pairWeeklyPoints:
      data.pairWeeklyPoints == null
        ? null
        : Number(data.pairWeeklyPoints),
  };
}

// updatePairPoints() (клиентский read-then-write в pairs.total_points/
// weekly_points через обычный .update()) удалён отсюда — это была
// последняя точка вызова. Все начисления PAIR-очков теперь идут только
// через server-side RPC (spin_reward_wheel, claim_weekly_pair_top_reward,
// submit_daily_pair_answer и т.д.), а не прямой записью с клиента.

// Персональный (не парный) дневной лимит бесплатных тестов — раньше
// был сломанный клиентский гейт "pair.dailyTestsUsed" (никогда не
// инкрементировался с клиента, лимита фактически не было). Теперь
// сервер сам atomically проверяет/списывает попытку и знает реальный
// premium-статус — см. consume_daily_access в
// supabase/pairs_profiles_server_side.sql.
async function consumeDailyTestAccess(): Promise<{
  allowed: boolean;
  isPremium: boolean;
} | null> {
  const initData = window.Telegram?.WebApp?.initData;

  if (!initData) {
    console.error("consumeDailyTestAccess: Telegram initData отсутствует");
    return null;
  }

  try {
    const response = await fetch("/api/activity/consume-daily-limit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData, activityType: "test" }),
    });

    const data = await response.json();

    if (!response.ok || !data?.ok) {
      console.error("consumeDailyTestAccess error:", data);
      return null;
    }

    return {
      allowed: Boolean(data.allowed),
      isPremium: Boolean(data.isPremium),
    };
  } catch (error) {
    console.error("consumeDailyTestAccess request error:", error);
    return null;
  }
}



// Раньше писал прямо в poll_submissions с pairId/telegramId из React
// state (можно было подделать ответы партнёра) — теперь /api/poll/submit
// сам достаёт telegramId/pairId из initData/профиля и сразу отдаёт
// пересчитанный pairPollAnswers, отдельного loadPairPollAnswers после
// этого больше не нужно.
async function savePollSubmission(params: {
  pollId: string;
  answers: number[];
}): Promise<Record<string, number[]> | null> {
  const { pollId, answers } = params;

  const initData = window.Telegram?.WebApp?.initData;

  if (!initData) {
    console.error("savePollSubmission: Telegram initData отсутствует");
    return null;
  }

  try {
    const response = await fetch("/api/poll/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData, pollId, answers }),
    });

    const data = await response.json();

    if (!response.ok || !data?.ok) {
      console.error("savePollSubmission error:", data);
      return null;
    }

    return data.pairPollAnswers as Record<string, number[]>;
  } catch (error) {
    console.error("savePollSubmission request error:", error);
    return null;
  }
}

// Раньше — два прямых supabase.from("daily_pair_answers").select(...)
// анонимным ключом; теперь один авторизованный вызов /api/pair/daily-state
// (сервер сам знает pairId из профиля и вычисляет "сегодня" по
// Europe/Helsinki), возвращающий и сегодняшние ответы, и историю сразу.
async function loadDailyPairState(): Promise<{
  today: Array<{ telegram_id: number; question_id: string; answer_index: number }>;
  history: Array<{
    date: string;
    questionId: string;
    boyAnswerIndex: number | null;
    girlAnswerIndex: number | null;
  }>;
}> {
  const initData = window.Telegram?.WebApp?.initData;

  if (!initData) {
    console.error("loadDailyPairState: Telegram initData отсутствует");
    return { today: [], history: [] };
  }

  try {
    const response = await fetch("/api/pair/daily-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });

    const data = await response.json();

    if (!response.ok || !data?.ok) {
      console.error("loadDailyPairState error:", data);
      return { today: [], history: [] };
    }

    return { today: data.today ?? [], history: data.history ?? [] };
  } catch (error) {
    console.error("loadDailyPairState request error:", error);
    return { today: [], history: [] };
  }
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

async function loadPairPollAnswersForCurrentUser(): Promise<
  Record<string, number[]>
> {
  const initData = window.Telegram?.WebApp?.initData;

  if (!initData) {
    console.error("loadPairPollAnswersForCurrentUser: initData отсутствует");
    return {};
  }

  try {
    const response = await fetch("/api/pair/poll-answers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });

    const data = await response.json();

    if (!response.ok || !data?.ok) {
      console.error("loadPairPollAnswersForCurrentUser error:", data);
      return {};
    }

    return data.pairPollAnswers ?? {};
  } catch (error) {
    console.error("loadPairPollAnswersForCurrentUser request error:", error);
    return {};
  }
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
  const [pollAnswers, dailyState] = await Promise.all([
    loadPairPollAnswersForCurrentUser(),
    loadDailyPairState(),
  ]);

  pairPollAnswersFromDb = pollAnswers;
  dailyPairHistoryFromDb = dailyState.history;
  dailyPairStreakFromDb = calculateDailyPairStreak(dailyPairHistoryFromDb);
}

const referralStats = await loadReferralStats(user.id);

setAppState((prev) => ({
  ...prev,

  pair: nextPairState,

  pairPollAnswers: pairPollAnswersFromDb,
  dailyPairHistory: dailyPairHistoryFromDb,
  dailyPairStreak: dailyPairStreakFromDb,
  referrals: referralStats,
}));
}


// telegramId только из подписанного initData (сервер извлекает сам) —
// раньше currentTelegramId был обычным параметром функции, идущим от
// клиента без проверки, из-за чего можно было подключиться к ЧУЖОЙ
// паре под произвольным telegram_id. Вся проверка (код существует /
// пара ещё не полная / не self-join) теперь внутри join_pair RPC.
async function joinPairByInviteCode(
  telegramId: number,
  inviteCode: string
): Promise<PairState | null> {
  const currentTelegramId = Number(telegramId);
  const initData = window.Telegram?.WebApp?.initData;

  if (!initData) {
    console.error("joinPairByInviteCode: Telegram initData отсутствует");
    return null;
  }

  let data: any = null;

  try {
    const response = await fetch("/api/pair/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        initData,
        inviteCode: inviteCode.trim().toUpperCase(),
      }),
    });

    data = await response.json();
  } catch (error) {
    console.error("joinPairByInviteCode request error:", error);
    return null;
  }

  if (!data?.ok) {
    // already-in-pair — не ошибка: пользователь уже состоит в паре
    // (например, повторный заход по инвайт-ссылке) — просто отдаём
    // его текущее состояние без алерта, как и раньше.
    if (data?.reason === "already-in-pair") {
      return loadPairStateForUser(currentTelegramId);
    }

    if (data?.reason === "self-join") {
      alert("Нельзя подключить самого себя по своему приглашению");
    } else if (data?.reason === "pair-full") {
      alert("Эта пара уже подключена");
    } else {
      console.error("joinPairByInviteCode error:", data);
    }

    return null;
  }

  return loadPairStateForUser(currentTelegramId);
}

// referrerTelegramId и invitedTelegramId сервер теперь достаёт сам из
// подписанного initData (invitedTelegramId = user.id, referrerTelegramId —
// из start_param вида "ref_<id>"), а не принимает от клиента — иначе
// можно было бы вызвать claim с любыми двумя существующими telegram_id
// и приписать себе чужое приглашение. См. app/api/referral/claim/route.ts.
async function claimReferralReward(initData: string) {
  let data: any = null;

  try {
    const response = await fetch("/api/referral/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });

    data = await response.json();

    if (!response.ok) {
      console.error("claimReferralReward error:", data);
      return { ok: false, reason: "request-error" as const };
    }
  } catch (error) {
    console.error("claimReferralReward request error:", error);
    return { ok: false, reason: "request-error" as const };
  }

  if (!data?.ok) {
    console.log(
      "Referral reward not granted:",
      data?.reason
    );

    return {
      ok: false,
      reason:
        data?.reason ??
        "not-awarded",
    };
  }

  console.log(
    "Referral reward granted:",
    data
  );

  return {
    ok: true,
    reward:
      Number(data.reward ?? 200),

    soloPoints:
      Number(data.soloPoints ?? 0),

    soloWeeklyPoints:
      Number(
        data.soloWeeklyPoints ?? 0
      ),
  };
}


// Атомарная награда за топ-3 в парном рейтинге прошлой недели.
// Неделя (previous/current) и размер награды вычисляются на сервере —
// клиенту нельзя доверять эти значения (иначе можно было бы прислать
// произвольный reward или выбрать выгодную неделю). Вся проверка места
// в лидерборде, принадлежности пользователя паре и того, была ли уже
// получена награда, плюс само начисление — одним атомарным запросом
// в БД (см. RPC claim_weekly_pair_top_reward, блокировка строки пары),
// чтобы исключить гонку при двойном клике или клейме от обоих партнёров.
// pairId и telegramId сервер теперь достаёт сам (telegramId — из
// подписанного initData, pairId — из profiles.pair_id этого telegramId),
// клиент их больше не присылает. См. app/api/rewards/claim-weekly-top.
async function claimWeeklyPairTopReward(): Promise<{
  awarded: boolean;
  reason: string;
  reward?: number;
  place?: number;
  previousWeekKey?: string;
  currentWeekKey?: string;
  pairTotalPoints?: number;
  pairWeeklyPoints?: number;
  weeklyTopRewardClaimedWeek?: string;
} | null> {
  const initData = window.Telegram?.WebApp?.initData;

  if (!initData) {
    console.error(
      "claimWeeklyPairTopReward: Telegram initData отсутствует"
    );
    return null;
  }

  let data: any = null;

  try {
    const response = await fetch("/api/rewards/claim-weekly-top", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });

    data = await response.json();

    if (!response.ok) {
      console.error("claimWeeklyPairTopReward error:", data);
      return null;
    }
  } catch (error) {
    console.error("claimWeeklyPairTopReward request error:", error);
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    awarded: Boolean(data.awarded),
    reason: String(data.reason ?? "unknown"),
    reward: data.reward == null ? undefined : Number(data.reward),
    place: data.place == null ? undefined : Number(data.place),
    previousWeekKey: data.previousWeekKey ?? undefined,
    currentWeekKey: data.currentWeekKey ?? undefined,
    pairTotalPoints:
      data.pairTotalPoints == null ? undefined : Number(data.pairTotalPoints),
    pairWeeklyPoints:
      data.pairWeeklyPoints == null
        ? undefined
        : Number(data.pairWeeklyPoints),
    weeklyTopRewardClaimedWeek: data.weeklyTopRewardClaimedWeek ?? undefined,
  };
}


// Раньше это был прямой supabase.from("referrals").select(...) с
// клиента — security-pass находка: таблица была читаема anon-ключом
// целиком, без фильтра по пользователю (кто кого пригласил — для
// всех). Теперь только через сервер, который сам берёт telegramId из
// validated initData, а не из параметра функции.
async function loadReferralStats(_telegramId: number) {
  const initData = window.Telegram?.WebApp?.initData;

  if (!initData) {
    console.error("loadReferralStats: Telegram initData отсутствует");
    return {
      invitedUsers: [],
      totalReward: 0,
    };
  }

  try {
    const response = await fetch("/api/referral/stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("loadReferralStats error", data);
      return {
        invitedUsers: [],
        totalReward: 0,
      };
    }

    return {
      invitedUsers: Array.isArray(data.invitedUsers) ? data.invitedUsers : [],
      totalReward: typeof data.totalReward === "number" ? data.totalReward : 0,
    };
  } catch (error) {
    console.error("loadReferralStats error", error);
    return {
      invitedUsers: [],
      totalReward: 0,
    };
  }
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
  const [selectedLang, setSelectedLang] = useState<Market>("ru");

const market = selectedLang;
const t = market === "fi" ? TEXT_FI : market === "en" ? TEXT_EN : TEXT_RU;
const REWARD_CATEGORIES =
  market === "en" ? REWARD_CATEGORIES_EN : REWARD_CATEGORIES_RU;

    useEffect(() => {
  if (typeof window === "undefined") return;

  // getMarket() уже содержит всю логику приоритета: сохранённый выбор
  // пользователя → язык Telegram-клиента → язык устройства → en как
  // безопасный дефолт (раньше тут читался только localStorage, и любой
  // новый пользователь без сохранённого выбора всегда получал русский,
  // даже если его Telegram/устройство было на другом языке).
  setSelectedLang(getMarket());
}, []);

  

 

// Раньше здесь был общий лимит "3 бесплатных действия на все разделы
// сразу" — он блокировал вход в опросы/тесты/игры целиком после
// суммарно 3 пройденных штук чего угодно, что конфликтовало с
// изначальной задумкой (первые 2 опроса по порядку + 1 тест + по
// одному ходу в каждой игре открыты всегда). Убрано: теперь решение о
// paywall принимает каждый экран сам — PollsScreen (isFreePoll),
// TestsScreen (dailyTestsUsed), GamesScreen (без ограничения).





  function getLiveTelegramUser(): TgUser | null {
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
   const startParam =
    window.Telegram?.WebApp?.initDataUnsafe?.start_param;

  if (startParam === "welcome") {
    console.log("Welcome user 🚀");
  }
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

async function confirmGiveawayAction(
  action: "poll" | "test"
) {
  try {
    const telegramId =
      window.Telegram?.WebApp?.initDataUnsafe?.user?.id;

    if (!telegramId) {
      console.error("GIVEAWAY: Telegram ID not found");
      return false;
    }

    const response = await fetch("/api/giveaway/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        telegramId,
        action,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      console.error("GIVEAWAY ACTION ERROR:", result);
      return false;
    }

    console.log("GIVEAWAY TICKET ADDED:", result);

    return true;
  } catch (error) {
    console.error("GIVEAWAY ACTION REQUEST ERROR:", error);
    return false;
  }
}

const handleBuyPremium = async () => {
  try {
    setPremiumLoading(true);

    // Standalone iOS-клиент (Capacitor): Telegram Stars недоступны
    // вообще (это Telegram-специфичный openInvoice), а Apple требует
    // покупку строго через собственный In-App Purchase (Guideline
    // 3.1.1) — сторонний способ оплаты отклонят на ревью. Отдельная
    // ветка, ниже существующий Stars-путь остаётся нетронутым для
    // Telegram.
    if (isCapacitorApp()) {
      const { ApplePurchase, APPLE_PREMIUM_MONTH_PRODUCT_ID } = await import(
        "@/lib/applePurchase"
      );

      const purchaseResult = await ApplePurchase.purchase({
        productId: APPLE_PREMIUM_MONTH_PRODUCT_ID,
      });

      const { data: sessionData } = await supabase.auth.getSession();
      const supabaseAccessToken = sessionData.session?.access_token;

      if (!supabaseAccessToken) {
        throw new Error(t.errors.noActiveSession);
      }

      const verifyRes = await fetch("/api/payments/apple-iap-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supabaseAccessToken,
          signedTransaction: purchaseResult.jwsRepresentation,
        }),
      });
      const verifyData = await verifyRes.json();

      if (!verifyRes.ok || !verifyData?.ok) {
        throw new Error(verifyData?.error || t.errors.purchaseNotConfirmed);
      }

      const hasPremium = Boolean(verifyData.isPremium);

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

      return;
    }

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
      throw new Error(data?.error || t.errors.paymentCreateFailed);
    }

    const invoiceLink = data?.invoiceLink;
    if (!invoiceLink) {
      throw new Error(t.errors.paymentLinkMissing);
    }

    if (window.Telegram?.WebApp?.openInvoice) {
      window.Telegram.WebApp.openInvoice(invoiceLink, async (status) => {
  console.log("INVOICE STATUS:", status);

  if (status !== "paid" || !user?.id) return;

  const initDataForPremiumCheck = window.Telegram?.WebApp?.initData;
  let hasPremium = false;

  if (initDataForPremiumCheck) {
    try {
      const premiumResponse = await fetch("/api/profile/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: initDataForPremiumCheck }),
      });
      const premiumData = await premiumResponse.json();

      if (premiumResponse.ok && premiumData?.ok) {
        hasPremium = Boolean(premiumData.isPremium);
      } else {
        console.error("POST-PAYMENT PREMIUM CHECK ERROR:", premiumData);
      }
    } catch (error) {
      console.error("POST-PAYMENT PREMIUM CHECK ERROR:", error);
    }
  }

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
      throw new Error(t.errors.telegramInvoiceUnavailable);
    }
  } catch (error) {
    // Пользователь сам отменил системный диалог StoreKit — это не
    // ошибка, не пугаем алертом.
    if (
      error instanceof Error &&
      error.message.includes("USER_CANCELLED")
    ) {
      return;
    }
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
): Promise<boolean> => {
  if (!user?.id) {
    console.error(
      "claimCompletionBonus: Telegram user отсутствует"
    );
    return false;
  }

  const previousPairPoints =
    appState.pair.totalPoints || 0;

  const awardResult =
    await awardActivityPoints({
      activityType: "completion",

      id: type,
    });

  if (!awardResult) {
    console.error(
      "Не удалось начислить completion bonus"
    );
    return false;
  }

  // Сервер уже вернул актуальные pairTotalPoints/pairWeeklyPoints в
  // ответе award_activity_points — не делаем лишний round-trip
  // (loadPairStateForUser это 2 доп. запроса), просто мёржим их в
  // локальный pair state. Полный перезапрос не нужен: остальные поля
  // пары (партнёр, дневные лимиты и т.д.) от начисления очков не меняются.
  let nextPairState =
    appState.pair.pairId && awardResult.pairTotalPoints != null
      ? {
          ...appState.pair,
          totalPoints: awardResult.pairTotalPoints,
          weeklyPoints:
            awardResult.pairWeeklyPoints ?? appState.pair.weeklyPoints,
        }
      : appState.pair;

  const nextPairPoints =
    nextPairState.totalPoints || 0;

  // Анимация очков пары
  if (
    awardResult.awarded &&
    nextPairPoints > previousPairPoints
  ) {
    setAnimatedPairPoints(
      previousPairPoints
    );

    animatePairPoints(
      previousPairPoints,
      nextPairPoints
    );
  }

  // Проверяем повышение уровня пары
  const oldLevel =
    getPairLevelInfo(
      previousPairPoints
    );

  const newLevel =
    getPairLevelInfo(
      nextPairPoints
    );

  const bonusData =
    type === "polls"
      ? {
          title: "Пройдены все опросы",
          emoji: "🗳️",
        }
      : type === "tests"
      ? {
          title: "Пройдены все тесты",
          emoji: "🧠",
        }
      : {
          title: "Пройден весь игровой раздел",
          emoji: "🎮",
        };

  setAppState((prev) => ({
    ...prev,

    pair: nextPairState,

    soloPoints:
      awardResult.soloPoints,

    soloWeeklyPoints:
      awardResult.soloWeeklyPoints,

    points:
      awardResult.soloPoints,

    completionBonusesClaimed: {
      ...prev.completionBonusesClaimed,
      [type]: true,
    },
  }));

  if (
    awardResult.awarded &&
    newLevel.level > oldLevel.level
  ) {
    setLevelUpData({
      level: newLevel.level,
      title: newLevel.title,
    });

    setShowLevelUp(true);
  }

  // Показываем окно только при реальном
  // первом начислении награды
  if (awardResult.awarded) {
    setCompletionBonusData({
      title: bonusData.title,
      points: 200,
      section: type,
      emoji: bonusData.emoji,
    });

    setShowCompletionBonus(true);
  }

  return awardResult.awarded;
};

const claimGameStepReward = async (
  rewardKey: string
): Promise<boolean> => {
  if (
    appState.playedGameRewardKeys.includes(
      rewardKey
    )
  ) {
    return false;
  }

  if (!user?.id) {
    console.error(
      "claimGameStepReward: Telegram user отсутствует"
    );
    return false;
  }

  const previousPairPoints =
    appState.pair.totalPoints || 0;

  const awardResult =
    await awardActivityPoints({
      activityType: "game-step",

      id: rewardKey,
    });

  if (!awardResult) {
    console.error(
      "Не удалось начислить пошаговую игровую награду"
    );
    return false;
  }

  // См. комментарий в claimCompletionBonus — сервер уже вернул
  // pairTotalPoints/pairWeeklyPoints, лишний loadPairStateForUser не нужен.
  let nextPairState =
    appState.pair.pairId && awardResult.pairTotalPoints != null
      ? {
          ...appState.pair,
          totalPoints: awardResult.pairTotalPoints,
          weeklyPoints:
            awardResult.pairWeeklyPoints ?? appState.pair.weeklyPoints,
        }
      : appState.pair;

  const nextPairPoints =
    nextPairState.totalPoints || 0;

  if (
    awardResult.awarded &&
    nextPairPoints > previousPairPoints
  ) {
    setAnimatedPairPoints(
      previousPairPoints
    );

    animatePairPoints(
      previousPairPoints,
      nextPairPoints
    );
  }

  const oldLevel =
    getPairLevelInfo(
      previousPairPoints
    );

  const newLevel =
    getPairLevelInfo(
      nextPairPoints
    );

  setAppState((prev) => ({
    ...prev,

    pair: nextPairState,

    soloPoints:
      awardResult.soloPoints,

    soloWeeklyPoints:
      awardResult.soloWeeklyPoints,

    points:
      awardResult.soloPoints,

    playedGameRewardKeys:
      prev.playedGameRewardKeys.includes(
        rewardKey
      )
        ? prev.playedGameRewardKeys
        : [
            ...prev.playedGameRewardKeys,
            rewardKey,
          ],
  }));

  if (
    awardResult.awarded &&
    newLevel.level > oldLevel.level
  ) {
    setLevelUpData({
      level: newLevel.level,
      title: newLevel.title,
    });

    setShowLevelUp(true);
  }

  return awardResult.awarded;
};

const handleCompleteGame = async (game: Game, score: number) => {
  const alreadyCompleted =
    appState.completedGameIds.includes(game.id);

  const rewardToAdd =
    alreadyCompleted ? 0 : game.reward;

  let nextSoloPoints =
    appState.soloPoints;

  let nextSoloWeeklyPoints =
    appState.soloWeeklyPoints;

  let activityAwarded = false;

  let nextPairState =
    appState.pair;

  let leveledUpTo: {
    level: number;
    title: string;
  } | null = null;

  if (rewardToAdd > 0 && user?.id) {
    const awardResult =
      await awardActivityPoints({
        activityType: "game",

        id: game.id,
      });

    if (!awardResult) {
      console.error(
        "Не удалось начислить очки за игру"
      );
    } else {
      activityAwarded =
        awardResult.awarded;

      nextSoloPoints =
        awardResult.soloPoints;

      nextSoloWeeklyPoints =
        awardResult.soloWeeklyPoints;

      // См. комментарий в claimCompletionBonus — сервер уже вернул
      // pairTotalPoints/pairWeeklyPoints, лишний loadPairStateForUser не нужен.
      if (appState.pair.pairId && awardResult.pairTotalPoints != null) {
        nextPairState = {
          ...appState.pair,
          totalPoints: awardResult.pairTotalPoints,
          weeklyPoints:
            awardResult.pairWeeklyPoints ?? appState.pair.weeklyPoints,
        };
      }
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

  soloPoints: nextSoloPoints,

  soloWeeklyPoints:
    nextSoloWeeklyPoints,

  points: nextSoloPoints,

  stats: {
    ...prev.stats,

    gamesPlayed: activityAwarded
      ? prev.stats.gamesPlayed + 1
      : prev.stats.gamesPlayed,
  },

  completedGameIds: activityAwarded
    ? prev.completedGameIds.includes(game.id)
      ? prev.completedGameIds
      : [
          ...prev.completedGameIds,
          game.id,
        ]
    : prev.completedGameIds,
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

  if (!appState.pair.pairId || !user?.id) return;
  // Быстрая локальная проверка (UX only) — источник истины проверяется
  // атомарно внутри RPC ниже (сервер сам определяет неделю и размер
  // награды), поэтому двойной клик или клейм от второго партнёра
  // не даст задвоить награду.
  if (appState.pair.weeklyTopRewardClaimedWeek === previousWeekKey) return;

  const result = await claimWeeklyPairTopReward();

  if (!result?.awarded) {
    console.log("Weekly top reward not claimed:", result?.reason);
    return;
  }

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




// Больше не пишет в weekly_pair_leaderboard/weekly_user_leaderboard
// напрямую с клиента (см. security-pass находку у определения
// upsertWeeklyPairLeaderboardEntry выше) — только перечитывает уже
// синхронизированные сервером (триггеры на pairs/profiles) строки.
// nextState/currentUser/points остаются в сигнатуре, чтобы не трогать
// вызывающий код, хотя сама запись больше не используется.
const syncWeeklyPairLeaderboard = async (nextState: AppState, currentUser?: TgUser | null) => {
  const pairId = nextState.pair.pairId;
  if (!pairId) return;

  const weekKey = getCurrentWeekKey();

  const rows = await loadWeeklyPairLeaderboard(weekKey);
  setWeeklyPairLeaderboard(rows);
};

const syncWeeklyUserLeaderboard = async (
  points: number,
  currentUser?: TgUser | null
) => {
  const actualUser = currentUser ?? user;

  if (!actualUser?.id) return;

  const rows = await loadWeeklyUserLeaderboard(
    getCurrentWeekKey()
  );

  setWeeklyUserLeaderboard(rows);
};



const handleLeavePair = async () => {
  const initData = window.Telegram?.WebApp?.initData;

  if (!initData) {
    alert(t.errors.telegramUserNotConfirmed);
    return;
  }

  try {
    const response = await fetch("/api/pair/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });

    const result = await response.json();

    if (!result.ok) {
      alert(t.errors.pairLeaveFailed);
      return;
    }

    // Простой и надёжный способ подхватить обновлённое (уже без пары)
    // состояние — тот же приём, что и после auth-действий: bootstrap
    // на маунте сам подтянет свежие данные с сервера.
    window.location.reload();
  } catch (error) {
    console.error("handleLeavePair error:", error);
    alert(t.errors.pairLeaveFailed);
  }
};

const handleJoinByCode = async (inviteCode: string) => {
  const actualUser = getTelegramUserSafe(user);

  if (!actualUser?.id) {
    alert(t.errors.telegramUserNotFound);
    return;
  }

  setUser(actualUser);
  await upsertTelegramProfile(actualUser);

  const joinedPair = await joinPairByInviteCode(actualUser.id, inviteCode.trim().toUpperCase());

  if (!joinedPair) {
    alert(t.errors.pairJoinFailed);
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


alert(t.errors.pairJoinedSuccess);
setScreen("pair");
};



const handleCreateInvite = async () => {
  const actualUser = getTelegramUserSafe(user);

  if (!actualUser?.id) {
    alert(t.errors.telegramUserNotFound);
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

  // invite_code генерируется на сервере (create_pair RPC), а не
  // Math.random() на клиенте; created_by_telegram_id/partner_1_telegram_id
  // сервер берёт из подписанного initData, не из тела запроса — иначе
  // пару можно было создать "от имени" произвольного telegram_id.
  const initData = window.Telegram?.WebApp?.initData;

  if (!initData) {
    alert(t.errors.telegramUserNotConfirmed);
    return;
  }

  let createData: any = null;

  try {
    const response = await fetch("/api/pair/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });

    createData = await response.json();

    if (!response.ok || !createData?.ok) {
      console.error("create pair error:", createData);
      alert(
        `${t.errors.pairCreateInviteFailedPrefix} ${
          createData?.reason || "unknown error"
        }`
      );
      return;
    }
  } catch (error) {
    console.error("create pair request error:", error);
    alert(t.errors.pairCreateInviteFailed);
    return;
  }

  const nextPairState = await loadPairStateForUser(actualUser.id);

 setAppState((prev) => ({
  ...prev,
  pair: nextPairState,
 
}));

await refreshPairData({
  user: actualUser,
  setAppState,
});
};


const [
  weeklyPairLeaderboard,
  setWeeklyPairLeaderboard,
] = useState<WeeklyPairLeaderboardRow[]>([]);


const [
  weeklyUserLeaderboard,
  setWeeklyUserLeaderboard,
] = useState<WeeklyUserLeaderboardRow[]>([]);

const [
  previousWeeklyUserLeaderboard,
  setPreviousWeeklyUserLeaderboard,
] = useState<WeeklyUserLeaderboardRow[]>([]);

const [
  topRefreshing,
  setTopRefreshing,
] = useState(false);

const [showPaymentChoice, setShowPaymentChoice] =
  useState(false);

const TRIBUTE_LINK =
  "https://t.me/tribute/app?startapp=sMuC";


  
  const [screen, setScreen] = useState<Screen>("welcome");
  const [paywallBackScreen, setPaywallBackScreen] = useState<Screen>("menu");
  const [user, setUser] = useState<TgUser | null>(null);
  const [showDailyBonus, setShowDailyBonus] = useState(true);
  const [claimableDay, setClaimableDay] = useState(1);
  const [bonusClaimAvailable, setBonusClaimAvailable] = useState(true);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [rewardsExpanded, setRewardsExpanded] = useState(false);
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
  async function bootstrap() {
    setMounted(true);

    // Phase 2 (App Store план): в Capacitor-сборке window.Telegram не
    // существует в принципе — устанавливаем шим (см. lib/platform.ts)
    // ДО того, как что-либо ниже попробует его прочитать. В Telegram
    // isCapacitorApp() === false, эта строка — no-op, ничего не меняет.
    installCapacitorTelegramShim();
    if (isCapacitorApp()) {
      // Дожидаемся, пока Supabase восстановит сессию из локального
      // хранилища — иначе шим ещё не знает access token и initData
      // шима будет пустым на первом рендере. У Telegram аналогичная
      // проблема решается retry через 600мс ниже, эта же логика после
      // этого await продолжает работать как раньше.
      const signedIn = await hasSupabaseSession();
      if (!signedIn) {
        // Ни один Telegram-пользователь никогда сюда не попадёт —
        // isCapacitorApp() у них всегда false. Показываем экран входа
        // вместо того, чтобы пытаться бутстрапиться без сессии.
        setScreen("auth");
        return;
      }
    }

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

   const currentUser: TgUser = {
  id: telegramUser.id,
  first_name: telegramUser.first_name,
  last_name: telegramUser.last_name,
  username: telegramUser.username,
  photo_url: telegramUser.photo_url,
};

setUser(currentUser);

// Единый старт: раньше здесь была россыпь отдельных прямых
// supabase.from(...).select(...) анонимным ключом (профиль, пара,
// premium-статус, парные ответы опросов, вопрос дня) — теперь один
// авторизованный POST /api/bootstrap отдаёт всё сразу. См.
// lib/server/pair-state.ts / lib/server/reads.ts на сервере.
const initData = window.Telegram?.WebApp?.initData;

if (!initData) {
  console.error("bootstrap: Telegram initData отсутствует");
  return;
}

let bootstrapData: any = null;

try {
  const response = await fetch("/api/bootstrap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData }),
  });

  bootstrapData = await response.json();

  if (!response.ok || !bootstrapData?.ok) {
    console.error("bootstrap request failed:", bootstrapData);
    return;
  }
} catch (error) {
  console.error("bootstrap request error:", error);
  return;
}

// В Capacitor-сборке до этого момента telegramId был временным
// плейсхолдером (см. lib/platform.ts) — сервер уже давно знает
// настоящий синтетический id, обновляем шим и currentUser, чтобы
// весь дальнейший код (referral-ссылки, отображение имени и т.д.)
// использовал правильное значение.
if (isCapacitorApp() && bootstrapData.profile?.telegramId) {
  const realTelegramId = Number(bootstrapData.profile.telegramId);
  setSyntheticTelegramId(realTelegramId);
  setUser((prev) => (prev ? { ...prev, id: realTelegramId } : prev));
}

const soloPointsFromDb = Number(bootstrapData.profile?.soloPoints ?? 0);
const soloWeeklyPointsFromDb = Number(
  bootstrapData.profile?.soloWeeklyPoints ?? 0
);

setAppState((prev) => ({
  ...prev,

  isPremium: Boolean(bootstrapData.isPremium),

  soloPoints: soloPointsFromDb,
  soloWeeklyPoints: soloWeeklyPointsFromDb,

  // Пока points используется старым UI как личный баланс.
  points: soloPointsFromDb,
}));

if (startParam?.startsWith("ref_")) {
  // Локальная проверка startParam — только чтобы не дёргать эндпоинт
  // впустую; сам referrerTelegramId сервер заново достаёт из initData.
  await claimReferralReward(initData);
}

const referralStats = await loadReferralStats(currentUser.id!);

let nextPairState: PairState = bootstrapData.pair;
let pairPollAnswersFromDb: Record<string, number[]> =
  bootstrapData.pairPollAnswers ?? {};
let dailyPairTodayFromDb = bootstrapData.dailyPair?.today ?? [];
let dailyPairHistoryFromDb = bootstrapData.dailyPair?.history ?? [];

if (!nextPairState.pairId && startParam?.startsWith("invite_")) {
  const inviteCode = startParam.replace("invite_", "");

  console.log("TRY JOIN WITH CODE:", inviteCode);

  const joinedPair = await joinPairByInviteCode(
    currentUser.id!,
    inviteCode
  );

  if (joinedPair) {
    nextPairState = joinedPair;

    // bootstrap уже сходил за pairPollAnswers/dailyPair ДО join —
    // для только что подключённой пары нужно перечитать их заново.
    if (nextPairState.pairId) {
      const dailyState = await loadDailyPairState();
      dailyPairTodayFromDb = dailyState.today;
      dailyPairHistoryFromDb = dailyState.history;
    }
  }
}

console.log("PAIR STATE AFTER BOOTSTRAP:", nextPairState);

setAppState((prev) => ({
  ...prev,
  pair: nextPairState,

  referrals: referralStats,
  pairPollAnswers: pairPollAnswersFromDb,
  dailyPairHistory: dailyPairHistoryFromDb,
}));

// Загружаем топ текущей и предыдущей недели при запуске приложения
try {
  const [currentRows, previousRows] = await Promise.all([
    loadWeeklyPairLeaderboard(getCurrentWeekKey()),
    loadWeeklyPairLeaderboard(getPreviousWeekKey()),
  ]);

  setWeeklyPairLeaderboard(currentRows);
  setPreviousWeeklyPairLeaderboard(previousRows);
} catch (error) {
  console.error("BOOTSTRAP LEADERBOARD ERROR:", error);
}
  }

  bootstrap();
}, []);

/*
 * При открытии раздела "Топ":
 * 1. Обновляем данные пары.
 * 2. Синхронизируем её запись в таблице лидеров.
 * 3. Загружаем свежий топ.
 */


const refreshTopLeaderboard = async () => {
  if (!user?.id || topRefreshing) return;

  try {
    setTopRefreshing(true);

    const currentWeekKey =
      getCurrentWeekKey();

    const previousWeekKey =
      getPreviousWeekKey();

    /*
     * 1. Получаем свежие личные очки (через /api/profile/state —
     * раньше был прямой supabase.from("profiles").select(...))
     */
    const initDataForProfile = window.Telegram?.WebApp?.initData;
    let freshProfile: {
      solo_points: number;
      solo_weekly_points: number;
      solo_weekly_points_week: string | null;
    } | null = null;

    if (initDataForProfile) {
      try {
        const profileResponse = await fetch("/api/profile/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: initDataForProfile }),
        });
        const profileData = await profileResponse.json();

        if (profileResponse.ok && profileData?.ok) {
          freshProfile = {
            solo_points: profileData.profile.soloPoints,
            solo_weekly_points: profileData.profile.soloWeeklyPoints,
            solo_weekly_points_week: profileData.profile.soloWeeklyPointsWeek,
          };
        } else {
          console.error("TOP PROFILE REFRESH ERROR:", profileData);
        }
      } catch (error) {
        console.error("TOP PROFILE REFRESH ERROR:", error);
      }
    }

    /*
     * 2. Получаем свежие данные пары
     */
    const refreshedPair =
      await loadPairStateForUser(
        user.id
      );

    /*
     * 3. Загружаем сразу четыре рейтинга
     */
    const [
      currentSoloRows,
      previousSoloRows,
      currentPairRows,
      previousPairRows,
    ] = await Promise.all([
      loadWeeklyUserLeaderboard(
        currentWeekKey
      ),

      loadWeeklyUserLeaderboard(
        previousWeekKey
      ),

      loadWeeklyPairLeaderboard(
        currentWeekKey
      ),

      loadWeeklyPairLeaderboard(
        previousWeekKey
      ),
    ]);

    /*
     * 4. Обновляем локальное состояние
     */
    setAppState((prev) => {
      const freshSoloPoints =
        Number(
          freshProfile?.solo_points ??
          prev.soloPoints
        );

      const freshSoloWeeklyPoints =
        freshProfile
          ?.solo_weekly_points_week ===
        currentWeekKey
          ? Number(
              freshProfile
                ?.solo_weekly_points ?? 0
            )
          : 0;

      return {
        ...prev,

        soloPoints:
          freshSoloPoints,

        soloWeeklyPoints:
          freshSoloWeeklyPoints,

        // временный alias старого UI
        points:
          freshSoloPoints,

        pair:
          refreshedPair,
      };
    });

    setAnimatedPairPoints(
      refreshedPair.totalPoints || 0
    );

    /*
     * 5. Обновляем оба топа
     */
    setWeeklyUserLeaderboard(
      currentSoloRows
    );

    setPreviousWeeklyUserLeaderboard(
      previousSoloRows
    );

    setWeeklyPairLeaderboard(
      currentPairRows
    );

    setPreviousWeeklyPairLeaderboard(
      previousPairRows
    );
  } catch (error) {
    console.error(
      "REFRESH TOP ERROR:",
      error
    );
  } finally {
    setTopRefreshing(false);
  }
};

useEffect(() => {
  if (screen !== "top") return;
  if (!user?.id) return;

  refreshTopLeaderboard();
}, [screen, user?.id]);

// Обновляем данные пары на остальных основных экранах
useEffect(() => {
  const screensToRefresh: Screen[] = [
    "menu",
    "pair",
    "profile",
    "rewards",
  ];

  if (!user?.id) return;
  if (!screensToRefresh.includes(screen)) return;

  async function refreshCurrentPair() {
    try {
      await refreshPairData({
        user,
        setAppState,
      });
    } catch (error) {
      console.error("REFRESH PAIR DATA ERROR:", error);
    }
  }

  refreshCurrentPair();
}, [screen, user?.id]);

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



const handleClaimBonus = async () => {
  // День серии и сумма теперь определяются сервером (profiles.daily_bonus_*
  // в БД) — claimableDay остаётся только локальным UI-предположением для
  // отображения ДО ответа сервера, реальный streakDay берём из ответа.
  const initData = window.Telegram?.WebApp?.initData;

  if (!initData) {
    console.error(
      "handleClaimBonus: Telegram initData отсутствует"
    );
    return;
  }

  const today = getTodayLocalDateString();

  let data: any = null;

  try {
    const response = await fetch("/api/rewards/daily-bonus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });

    data = await response.json();

    if (!response.ok || !data?.awarded) {
      console.error(
        "Не удалось начислить ежедневный бонус:",
        data
      );

      // Раньше здесь ничего не показывалось пользователю — кнопка
      // выглядела нерабочей ("нажимаю — ничего не происходит"), хотя
      // на самом деле сервер честно отклонял запрос. claimableDay/
      // bonusClaimAvailable — только локальная UI-догадка (localStorage,
      // локальный часовой пояс устройства), а реальная проверка — на
      // сервере (Europe/Helsinki). Если локальная догадка разошлась с
      // сервером, синхронизируем UI под реальный ответ, а не оставляем
      // кнопку в неверном состоянии.
      if (data?.reason === "already-claimed") {
        setBonusClaimAvailable(false);
        setShowDailyBonus(false);

        if (data?.streakDay != null) {
          setClaimableDay(Number(data.streakDay));
        }

        alert(t.errors.bonusAlreadyClaimedToday);
      } else {
        alert(t.errors.bonusClaimFailed);
      }

      return;
    }
  } catch (error) {
    console.error("handleClaimBonus request error:", error);
    alert(t.errors.bonusClaimFailed);
    return;
  }

  const reward = Number(data.reward ?? 0);

  setAppState((prev) => ({
    ...prev,

    soloPoints: Number(data.soloPoints ?? 0),

    soloWeeklyPoints: Number(data.soloWeeklyPoints ?? 0),

    // временный alias старого UI
    points: Number(data.soloPoints ?? 0),

    dailyBonus: {
      streakDay: Number(data.streakDay ?? claimableDay),
      lastClaimDate: today,

      totalPointsEarnedFromBonus:
        prev.dailyBonus.totalPointsEarnedFromBonus + reward,
    },
  }));

  setBonusClaimAvailable(false);
  setShowDailyBonus(false);
};

  type GiveawayActionType = "poll" | "test";

async function completeGiveawayAction(
  actionType: GiveawayActionType
): Promise<{
  success: boolean;
  ticketAdded: boolean;
  tickets?: number;
  message?: string;
}> {
  const initData = window.Telegram?.WebApp?.initData;

  if (!initData) {
    console.error("Telegram initData отсутствует");

    return {
      success: false,
      ticketAdded: false,
      message: t.errors.telegramUserNotConfirmed,
    };
  }

  try {
    const response = await fetch("/api/giveaway/complete-action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        initData,
        actionType,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("GIVEAWAY ACTION ERROR:", result);

      return {
        success: false,
        ticketAdded: false,
        message: result?.error || "Не удалось начислить билет",
      };
    }

    return {
      success: result?.success === true,
      ticketAdded: result?.ticketAdded === true,
      tickets: result?.tickets,
      message: result?.message,
    };
  } catch (error) {
    console.error("GIVEAWAY REQUEST ERROR:", error);

    return {
      success: false,
      ticketAdded: false,
      message: "Ошибка соединения при начислении билета",
    };
  }
}

const handleCompletePoll = async (
  poll: Poll,
  answers: number[]
) => {
  const alreadyCompleted =
    appState.completedPollIds.includes(poll.id);

  const rewardToAdd =
    alreadyCompleted ? 0 : poll.reward;

  let nextSoloPoints =
    appState.soloPoints;

  let nextSoloWeeklyPoints =
    appState.soloWeeklyPoints;

  let activityAwarded = false;

  let nextPairState =
    appState.pair;

  let pairPollAnswersFromDb =
    appState.pairPollAnswers;

  if (
    appState.pair.pairId &&
    user?.id
  ) {
    const updatedPairPollAnswers = await savePollSubmission({
      pollId: poll.id,
      answers,
    });

    if (updatedPairPollAnswers) {
      pairPollAnswersFromDb = updatedPairPollAnswers;
    }
  }




  let leveledUpTo: { level: number; title: string } | null = null;


if (rewardToAdd > 0 && user?.id) {
  const awardResult =
    await awardActivityPoints({
      activityType: "poll",

      id: poll.id,
    });

  if (!awardResult) {
    console.error(
      "Не удалось начислить очки за опрос"
    );
  } else {
    activityAwarded =
      awardResult.awarded;

    nextSoloPoints =
      awardResult.soloPoints;

    nextSoloWeeklyPoints =
      awardResult.soloWeeklyPoints;

    // См. комментарий в claimCompletionBonus — сервер уже вернул
    // pairTotalPoints/pairWeeklyPoints, лишний loadPairStateForUser не нужен.
    if (appState.pair.pairId && awardResult.pairTotalPoints != null) {
      nextPairState = {
        ...appState.pair,
        totalPoints: awardResult.pairTotalPoints,
        weeklyPoints:
          awardResult.pairWeeklyPoints ?? appState.pair.weeklyPoints,
      };
    }
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

soloPoints: nextSoloPoints,
soloWeeklyPoints: nextSoloWeeklyPoints,
points: nextSoloPoints,
  pairPollAnswers: pairPollAnswersFromDb,
  stats: {
    ...prev.stats,
    pollsCompleted: alreadyCompleted
  ? prev.stats.pollsCompleted
  : prev.stats.pollsCompleted + 1,
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

if (!alreadyCompleted) {
  const giveawayResult = await completeGiveawayAction("poll");

  if (giveawayResult.ticketAdded) {
    alert(
      `🎟️ Вы получили +1 билет за прохождение опроса!${
        typeof giveawayResult.tickets === "number"
          ? `\n\nВсего билетов: ${giveawayResult.tickets}`
          : ""
      }`
    );
  } else if (!giveawayResult.success) {
    console.error(
      "Билет за опрос не начислен:",
      giveawayResult.message
    );
  }
}

if (finishedAllPolls && !appState.completionBonusesClaimed.polls) {
  await claimCompletionBonus("polls");
}

 
};



   const handleCompleteTest = async (test: TestDefinition) => {
  const alreadyCompleted = appState.completedTestIds.includes(test.id);
  const rewardToAdd = alreadyCompleted ? 0 : test.reward;

  let nextSoloPoints = appState.soloPoints;

let nextSoloWeeklyPoints =
  appState.soloWeeklyPoints;

let activityAwarded = false;
let nextPairState = appState.pair;
let leveledUpTo: { level: number; title: string } | null = null;

if (rewardToAdd > 0 && user?.id) {
  const awardResult =
    await awardActivityPoints({
      activityType: "test",

      id: test.id,
    });

  if (!awardResult) {
    console.error(
      "Не удалось начислить очки за тест"
    );
  } else {
    activityAwarded =
      awardResult.awarded;

    nextSoloPoints =
      awardResult.soloPoints;

    nextSoloWeeklyPoints =
      awardResult.soloWeeklyPoints;

    // См. комментарий в claimCompletionBonus — сервер уже вернул
    // pairTotalPoints/pairWeeklyPoints, лишний loadPairStateForUser не нужен.
    if (appState.pair.pairId && awardResult.pairTotalPoints != null) {
      nextPairState = {
        ...appState.pair,
        totalPoints: awardResult.pairTotalPoints,
        weeklyPoints:
          awardResult.pairWeeklyPoints ?? appState.pair.weeklyPoints,
      };
    }
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

  soloPoints: nextSoloPoints,

  soloWeeklyPoints:
    nextSoloWeeklyPoints,

  points: nextSoloPoints,

  stats: {
    ...prev.stats,

    testsCompleted: activityAwarded
      ? prev.stats.testsCompleted + 1
      : prev.stats.testsCompleted,
  },

  completedTestIds: activityAwarded
    ? prev.completedTestIds.includes(test.id)
      ? prev.completedTestIds
      : [
          ...prev.completedTestIds,
          test.id,
        ]
    : prev.completedTestIds,
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


 const handleSpinReward = async (): Promise<WonReward | null> => {
  if (!appState.pair.pairId) {
    alert(t.errors.pairRequiredForSpin);
    return null;
  }

  const initData = window.Telegram?.WebApp?.initData;

  if (!initData) {
    console.error("handleSpinReward: Telegram initData отсутствует");
    alert(t.errors.telegramUserNotConfirmed);
    return null;
  }

  // Списание очков, выбор категории/приза и запись в историю — всё
  // происходит атомарно на сервере (RPC spin_reward_wheel), клиент
  // только запрашивает результат и потом анимирует уже известный исход.
  let data: any = null;

  try {
    const response = await fetch("/api/rewards/spin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        initData,
        // С wheel_reward_wheel_fi.sql сервер понимает 'ru'/'en'/'fi'
        // напрямую (см. supabase/wheel_reward_wheel_fi.sql).
        suggestedMarket: market,
      }),
    });

    data = await response.json();

    if (!response.ok) {
      console.error("REWARDS SPIN ERROR:", data);
      alert(t.errors.wheelSpinFailed);
      return null;
    }
  } catch (error) {
    console.error("REWARDS SPIN REQUEST ERROR:", error);
    alert(t.errors.wheelSpinFailed);
    return null;
  }

  if (!data?.awarded) {
    if (data?.reason === "insufficient-points") {
      alert(t.errors.wheelInsufficientPoints);
    } else if (data?.reason === "daily-limit-reached") {
      alert(t.errors.wheelDailyLimitReached);
    } else {
      console.error("Wheel spin not awarded:", data?.reason);
    }
    return null;
  }

  const result: WonReward = {
    spinId: data.spinId,
    itemId: data.itemId,
    title: data.itemTitle,
    categoryId: data.categoryId,
    categoryTitle: data.categoryTitle,
    wonAt: getCurrentDateTimeLabel(),
    spentPoints: data.spentPoints,
    spinsUsedToday: data.spinsUsedToday,
    spinsRemainingToday: data.spinsRemainingToday,
    market: data.market,
    outcomeType: data.outcomeType,
    bonusValue: data.bonusValue ?? null,
    spinSource: data.spinSource,
    bonusSpinCredits: data.bonusSpinCredits ?? 0,
  };

  setAppState((prev) => ({
    ...prev,
    soloPoints: data.soloPoints,
    points: data.soloPoints,
    stats: {
      ...prev.stats,
      rewardsRedeemed: prev.stats.rewardsRedeemed + 1,
    },
    wonRewards: [...prev.wonRewards, result],
  }));

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
    // env(safe-area-inset-*) — держит контент подальше от выреза/
    // динамического острова сверху и home indicator снизу вне
    // Telegram (там свой chrome, эти отступы там просто равны 0,
    // ничего не портят). Требует viewport-fit=cover в app/layout.tsx.
    paddingTop: "env(safe-area-inset-top)",
    paddingBottom: "calc(24px + env(safe-area-inset-bottom))",
    paddingLeft: "env(safe-area-inset-left)",
    paddingRight: "env(safe-area-inset-right)",
    boxSizing: "border-box",
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
    @keyframes popIn {
    0% {
      transform: scale(0.8);
      opacity: 0;
    }
    100% {
      transform: scale(1);
      opacity: 1;
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

        {showDailyBonus && screen !== "auth" && (
          <DailyBonusModal
            currentDay={claimableDay}
            canClaim={bonusClaimAvailable}
            onClaim={handleClaimBonus}
            onClose={() => setShowDailyBonus(false)}
          />
        )}

        {screen === "auth" && <AuthScreen />}

        {screen === "welcome" && (
  <WelcomeScreen
   onStart={() =>
  setScreen(
    appState.profile.gender
      ? "menu"
      : "gender-select"
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
      onClick={() => {
        setSelectedLang("fi");
        localStorage.setItem("couple-quizzes-lang", "fi");
        setScreen("gender-select");
      }}
      style={{ ...primaryButtonStyle }}
    >
      🇫🇮 Suomi
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
  // Раздел открывается всегда — сам paywall (если нужен) показывает
  // конкретный экран (PollsScreen/TestsScreen), а не общий счётчик.
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
    pair={appState.pair}
    isPremium={appState.isPremium}
showPaywall={() => {
  setPaywallBackScreen(screen);
  setScreen("paywall");
}}
  />
)}

{screen === "polls-girl" && (
  <PollsScreen
    genderFilter="girl"
    completedPollIds={appState.completedPollIds}
    onBack={() => setScreen("menu")}
    onCompletePoll={handleCompletePoll}
    pair={appState.pair}
    isPremium={appState.isPremium}
    showPaywall={() => {
      setPaywallBackScreen("menu");
      setScreen("paywall");
    }}
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
    pair={appState.pair}
    isPremium={appState.isPremium}
    showPaywall={() => {
      setPaywallBackScreen("menu");
      setScreen("paywall");
    }}
    onCheckDailyTestAccess={consumeDailyTestAccess}
  />
)}

        {screen === "rewards" && (
          <RewardsScreen
            points={appState.points}
            wonRewards={appState.wonRewards}
            onBack={() => setScreen("menu")}
            onSpin={handleSpinReward}
            onRewardsStateLoaded={(wonRewards) =>
              setAppState((prev) => ({ ...prev, wonRewards }))
            }
          />
        )}

  {screen === "top" && (
  <TopPlayersScreen
    user={user}
    pair={appState.pair}

    leaderboard={weeklyPairLeaderboard}
    previousLeaderboard={previousWeeklyPairLeaderboard}

    userLeaderboard={weeklyUserLeaderboard}
    previousUserLeaderboard={previousWeeklyUserLeaderboard}

    weeklyTopRewardClaimedWeek={
      appState.pair.weeklyTopRewardClaimedWeek
    }

    onClaimWeeklyReward={
      handleClaimWeeklyTopReward
    }

     onRefresh={refreshTopLeaderboard}

  refreshing={topRefreshing}

    onBack={() => setScreen("menu")}
    t={t}
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

{screen === "freePremium" && (
  <FreePremiumScreen
    onBack={() => setScreen("profile")}
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
  onLeavePair={handleLeavePair}
  onOpenPolls={() => {
    // "polls" как единого экрана не существует — как и в MainMenu,
    // опросы разделены на polls-boy/polls-girl по полу профиля.
    if (!appState.profile.gender) {
      setScreen("gender-select");
      return;
    }
    setScreen(appState.profile.gender === "boy" ? "polls-boy" : "polls-girl");
  }}
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

{screen === "ai-psychologist-chat" && (
  <AiPsychologistChatScreen onBack={() => setScreen("menu")} />
)}

{screen === "pair-compatibility-info" && (
  <PairCompatibilityInfoScreen
    appState={appState}
    onBack={() => setScreen("pair")}
    onOpenPolls={() => {
      if (!appState.profile.gender) {
        setScreen("gender-select");
        return;
      }
      setScreen(appState.profile.gender === "boy" ? "polls-boy" : "polls-girl");
    }}
  />
)}

{screen === "paywall" && (
  <div
    style={{
      padding: 16,
      minHeight: "100vh",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
    }}
  >
    <div style={{ ...cardBaseStyle(), padding: 20 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#1f1d3a" }}>
        {t.paywall.title}
      </div>

      <div
        style={{
          marginTop: 10,
          color: "#3a345c",
          lineHeight: 1.5,
          fontSize: 15,
        }}
      >
        {t.paywall.subtitle}
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
        {t.paywall.featurePolls}<br />
        {t.paywall.featureGames}<br />
        {t.paywall.featureTests}<br />
        {t.paywall.featureWheel}<br />
        {t.paywall.featureBonusPoints}<br />
        {t.paywall.featureDesign}
      </div>

      <div
        style={{
          marginTop: 16,
          fontSize: 24,
          fontWeight: 900,
          color: "#6b46ff",
        }}
      >
        299 ₽
      </div>

      <button
        onClick={() => setShowPaymentChoice(true)}
        style={{
          ...primaryButtonStyle,
          width: "100%",
          marginTop: 16,
        }}
      >
        {t.paywall.unlockButton}
      </button>

      <button
  onClick={() => {
    setShowPaymentChoice(false);
    setScreen("menu");
  }}
  style={{
    ...secondaryButtonStyle,
    width: "100%",
    marginTop: 10,
  }}
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
          {t.completionBonus.prefix}
          {completionBonusData?.section === "polls"
            ? t.completionBonus.pollsWord
            : completionBonusData?.section === "tests"
            ? t.completionBonus.testsWord
            : t.completionBonus.sectionWord}
          {t.completionBonus.suffix}
        </div>

        <div style={completionPointsStyle}>
          +{completionBonusData?.points ?? 0}
        </div>

        <div style={completionPointsLabelStyle}>
          {t.completionBonus.pairPointsLabel}
        </div>

        <button
          style={completionButtonStyle}
          onClick={() => {
            setShowCompletionBonus(false);
            setCompletionBonusData(null);
          }}
        >
          {t.completionBonus.claimRewardButton}
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
        {t.paywall.title}
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
        {t.paywall.choosePaymentSubtitle}
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
        {t.common.cancel}
      </button>
    </div>
  </div>
)}

    </main>
  


    
  );
}