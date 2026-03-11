"use client";

import { CSSProperties, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
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
  | "menu"
  | "polls"
  | "polls-boy"
  | "polls-girl"
  | "games"
  | "tests"
  | "rewards"
  | "leaderboard"
  | "pair"
  | "profile";

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
  dailyBonus: DailyBonusState;
  stats: AppStats;
  completedPollIds: string[];
  wonRewards: WonReward[];
  completedGameIds: string[];
  completedTestIds: string[];
  pollAnswers: Record<string, number[]>;
  pair: PairState;
};

 type Poll = {
  id: string;
  title: string;
  description: string;
  reward: number;
  gender: "boy" | "girl";
  questions: {
    id: string;
    text: string;
    options: string[];
  }[];
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
  questions: {
    id: string;
    text: string;
    options: string[];
    correctIndex: number;
  }[];
};

type TestKind = "scale" | "love-language" | "personality";

type TestQuestion = {
  id: string;
  text: string;
  options: string[];
};

type TestDefinition = {
  id: string;
  title: string;
  description: string;
  reward: number;
  kind: TestKind;
  questions: TestQuestion[];
};

type TestResult = {
  title: string;
  subtitle: string;
  description: string;
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
};


const DAILY_REWARDS = [25, 50, 75, 100, 150, 200, 300, 400, 500];
const STORAGE_KEY = "couple-quizzes-miniapp-v6";
const WHEEL_SPIN_COST = 100;

const TESTS: TestDefinition[] = [
  {
    id: "trust-level",
    title: "Уровень доверия к партнёру",
    description: "Покажет, насколько спокойно и уверенно ты чувствуешь себя в отношениях.",
    reward: 80,
    kind: "scale",
    questions: [
      {
        id: "t1",
        text: "Мне комфортно делиться с партнёром своими переживаниями.",
        options: ["Никогда", "Редко", "Иногда", "Часто", "Всегда"],
      },
      {
        id: "t2",
        text: "Я не боюсь, что партнёр осудит мои чувства.",
        options: ["Никогда", "Редко", "Иногда", "Часто", "Всегда"],
      },
      {
        id: "t3",
        text: "Я верю словам партнёра без лишних сомнений.",
        options: ["Никогда", "Редко", "Иногда", "Часто", "Всегда"],
      },
      {
        id: "t4",
        text: "Мне спокойно, когда партнёр проводит время без меня.",
        options: ["Никогда", "Редко", "Иногда", "Часто", "Всегда"],
      },
      {
        id: "t5",
        text: "Я чувствую себя в безопасности рядом с партнёром.",
        options: ["Никогда", "Редко", "Иногда", "Часто", "Всегда"],
      },
      {
        id: "t6",
        text: "Если возникает проблема, я верю, что мы сможем её обсудить.",
        options: ["Никогда", "Редко", "Иногда", "Часто", "Всегда"],
      },
      {
        id: "t7",
        text: "Я не жду подвоха от партнёра.",
        options: ["Никогда", "Редко", "Иногда", "Часто", "Всегда"],
      },
      {
        id: "t8",
        text: "Мне легко быть собой в этих отношениях.",
        options: ["Никогда", "Редко", "Иногда", "Часто", "Всегда"],
      },
    ],
  },
  {
    id: "love-language",
    title: "Язык любви",
    description: "Определит, как тебе приятнее всего чувствовать любовь и заботу.",
    reward: 90,
    kind: "love-language",
    questions: [
      {
        id: "l1",
        text: "Что приятнее получить от партнёра?",
        options: [
          "Тёплые слова и комплименты",
          "Объятия и прикосновения",
          "Подарок или сюрприз",
          "Совместное время только вдвоём",
          "Помощь в делах",
        ],
      },
      {
        id: "l2",
        text: "Когда тебе особенно хорошо в отношениях?",
        options: [
          "Когда меня хвалят и поддерживают",
          "Когда меня обнимают и целуют",
          "Когда делают неожиданные подарки",
          "Когда уделяют мне всё внимание",
          "Когда помогают без просьб",
        ],
      },
      {
        id: "l3",
        text: "Что ты запоминаешь сильнее всего?",
        options: [
          "Красивые слова",
          "Нежные жесты",
          "Материальные знаки внимания",
          "Проведённое вместе время",
          "Реальную заботу в действиях",
        ],
      },
      {
        id: "l4",
        text: "Как тебе легче почувствовать любовь?",
        options: [
          "Услышать это словами",
          "Почувствовать физически",
          "Получить что-то символичное",
          "Побыть рядом подольше",
          "Увидеть помощь и участие",
        ],
      },
      {
        id: "l5",
        text: "Что тебя расстраивает сильнее всего, когда этого не хватает?",
        options: [
          "Поддержки и слов",
          "Нежности",
          "Подарков и сюрпризов",
          "Времени вместе",
          "Помощи и заботы",
        ],
      },
      {
        id: "l6",
        text: "Что для тебя романтичнее?",
        options: [
          "Искреннее признание",
          "Долгие объятия",
          "Неожиданный подарок",
          "Вечер вдвоём",
          "Когда о тебе заботятся делом",
        ],
      },
    ],
  },
  {
    id: "personality-strengths",
    title: "Сильные стороны личности",
    description: "Покажет, какая твоя энергия сильнее всего проявляется в жизни и отношениях.",
    reward: 85,
    kind: "personality",
    questions: [
      {
        id: "p1",
        text: "В сложной ситуации ты чаще...",
        options: [
          "Поддерживаешь других",
          "Берёшь ответственность на себя",
          "Стараешься сохранить романтику и тепло",
          "Сохраняешь спокойствие",
          "Быстро заряжаешь всех энергией",
        ],
      },
      {
        id: "p2",
        text: "Люди чаще ценят в тебе...",
        options: [
          "Доброту",
          "Уверенность",
          "Чувственность",
          "Надёжность",
          "Харизму",
        ],
      },
      {
        id: "p3",
        text: "В отношениях ты больше про...",
        options: [
          "Заботу",
          "Силу характера",
          "Романтику",
          "Стабильность",
          "Эмоции и драйв",
        ],
      },
      {
        id: "p4",
        text: "Какой твой главный плюс?",
        options: [
          "Эмпатия",
          "Решительность",
          "Нежность",
          "Уравновешенность",
          "Энергичность",
        ],
      },
      {
        id: "p5",
        text: "Когда рядом близкий человек, ты чаще...",
        options: [
          "Поддерживаешь",
          "Защищаешь",
          "Вдохновляешь",
          "Успокаиваешь",
          "Заряжаешь",
        ],
      },
      {
        id: "p6",
        text: "Твой идеальный образ себя — это...",
        options: [
          "Заботливый человек",
          "Сильная личность",
          "Романтичная натура",
          "Спокойный и мудрый человек",
          "Яркий источник энергии",
        ],
      },
    ],
  },
];

const POLLS: Poll[] = [

{
id:"girl-romance",
title:"Романтика в отношениях",
description:"О том, какие жесты делают отношения по-настоящему приятными.",
reward:60,
gender:"girl",
questions:[
{ id:"q1", text:"Что для тебя самое романтичное?", options:["Комплименты","Объятия","Сюрпризы","Совместный вечер"] },
{ id:"q2", text:"Идеальное свидание это...", options:["Кафе","Прогулка","Фильм дома","Поездка"] },
{ id:"q3", text:"Что важнее всего на свидании?", options:["Атмосфера","Внимание","Юмор","Разговор"] },
{ id:"q4", text:"Какой жест особенно трогает?", options:["Письмо","Цветы","Объятие","Подарок"] },
{ id:"q5", text:"Лучший вечер вместе?", options:["Кино","Ужин","Прогулка","Путешествие"] },
{ id:"q6", text:"Что делает момент особенным?", options:["Музыка","Слова","Нежность","Время"] }
]
},

{
id:"girl-attention",
title:"Внимание партнёра",
description:"Что для тебя важнее всего в отношениях.",
reward:60,
gender:"girl",
questions:[
{ id:"q1", text:"Что приятнее всего?", options:["Комплименты","Подарки","Забота","Время вместе"] },
{ id:"q2", text:"Когда ты чувствуешь любовь?", options:["Когда слушают","Когда обнимают","Когда поддерживают","Когда удивляют"] },
{ id:"q3", text:"Что ценишь больше всего?", options:["Внимание","Поддержку","Нежность","Юмор"] },
{ id:"q4", text:"Что делает отношения крепче?", options:["Честность","Общение","Доверие","Забота"] },
{ id:"q5", text:"Как партнёр может порадовать?", options:["Подарок","Комплимент","Помощь","Сюрприз"] },
{ id:"q6", text:"Что важнее всего в любви?", options:["Уважение","Нежность","Доверие","Внимание"] }
]
},

{
id:"girl-jealousy",
title:"Ревность",
description:"Как ты относишься к вниманию других девушек.",
reward:55,
gender:"girl",
questions:[
{ id:"q1", text:"Если на него смотрят другие девушки?", options:["Нормально","Немного ревную","Сильно ревную","Не нравится"] },
{ id:"q2", text:"Он общается с бывшей?", options:["Спокойно","Настороженно","Не нравится","Против"] },
{ id:"q3", text:"Лайки другим девушкам?", options:["Нормально","Не люблю","Раздражает","Ссоримся"] },
{ id:"q4", text:"Дружба с девушками?", options:["Нормально","Если границы","Сложно","Против"] },
{ id:"q5", text:"Что важнее всего?", options:["Доверие","Честность","Границы","Уважение"] },
{ id:"q6", text:"Как решать ревность?", options:["Разговор","Доверие","Время","Поддержка"] }
]
},

{
id:"girl-love",
title:"Как ты проявляешь любовь",
description:"О твоём стиле любви.",
reward:60,
gender:"girl",
questions:[
{ id:"q1", text:"Как ты показываешь любовь?", options:["Слова","Объятия","Забота","Подарки"] },
{ id:"q2", text:"Что делаешь чаще?", options:["Комплименты","Объятия","Помогаю","Сюрпризы"] },
{ id:"q3", text:"Что важнее?", options:["Внимание","Нежность","Время","Поддержка"] },
{ id:"q4", text:"Любишь ли сюрпризы?", options:["Очень","Иногда","Редко","Нет"] },
{ id:"q5", text:"Как радуешь партнёра?", options:["Подарок","Слова","Забота","Поцелуй"] },
{ id:"q6", text:"Главное в любви?", options:["Доверие","Нежность","Поддержка","Честность"] }
]
},

{
id:"boy-attraction",
title:"Что тебя привлекает",
description:"О том, что ты ценишь в девушке.",
reward:60,
gender:"boy",
questions:[
{ id:"q1", text:"Что привлекает больше всего?", options:["Улыбка","Характер","Внешность","Юмор"] },
{ id:"q2", text:"Самое привлекательное качество?", options:["Нежность","Уверенность","Доброта","Энергия"] },
{ id:"q3", text:"Что цепляет сразу?", options:["Глаза","Голос","Стиль","Улыбка"] },
{ id:"q4", text:"Что важно в отношениях?", options:["Доверие","Поддержка","Страсть","Уважение"] },
{ id:"q5", text:"Какой характер нравится?", options:["Мягкий","Сильный","Весёлый","Спокойный"] },
{ id:"q6", text:"Что делает девушку особенной?", options:["Харизма","Забота","Юмор","Энергия"] }
]
},

{
id:"boy-romance",
title:"Романтика",
description:"Как ты относишься к романтике.",
reward:60,
gender:"boy",
questions:[
{ id:"q1", text:"Любишь романтику?", options:["Очень","Иногда","Редко","Нет"] },
{ id:"q2", text:"Что романтичнее?", options:["Ужин","Прогулка","Путешествие","Сюрприз"] },
{ id:"q3", text:"Даришь ли подарки?", options:["Часто","Иногда","Редко","Нет"] },
{ id:"q4", text:"Любишь свидания?", options:["Да","Иногда","Редко","Нет"] },
{ id:"q5", text:"Лучший вечер?", options:["Фильм","Прогулка","Ужин","Поездка"] },
{ id:"q6", text:"Как удивить девушку?", options:["Подарок","Цветы","Сюрприз","Комплимент"] }
]
},

{
id:"boy-jealousy",
title:"Ревность",
description:"Как ты реагируешь на внимание других мужчин.",
reward:55,
gender:"boy",
questions:[
{ id:"q1", text:"Другие парни пишут ей?", options:["Нормально","Не нравится","Раздражает","Злюсь"] },
{ id:"q2", text:"Она общается с бывшим?", options:["Спокойно","Не люблю","Не нравится","Против"] },
{ id:"q3", text:"Фото в соцсетях?", options:["Нормально","Иногда ревную","Не люблю","Против"] },
{ id:"q4", text:"Мужчины на работе?", options:["Ок","Если границы","Не нравится","Ревную"] },
{ id:"q5", text:"Что важнее?", options:["Доверие","Честность","Уважение","Верность"] },
{ id:"q6", text:"Как решать ревность?", options:["Разговор","Доверие","Спокойствие","Время"] }
]
},

{
id:"boy-relationship",
title:"Идеальные отношения",
description:"Как ты представляешь отношения.",
reward:60,
gender:"boy",
questions:[
{ id:"q1", text:"Главное в отношениях?", options:["Доверие","Поддержка","Свобода","Любовь"] },
{ id:"q2", text:"Идеальный вечер?", options:["Фильм","Прогулка","Ужин","Путешествие"] },
{ id:"q3", text:"Что ценишь в девушке?", options:["Доброту","Юмор","Нежность","Ум"] },
{ id:"q4", text:"Что делает пару сильной?", options:["Доверие","Поддержка","Честность","Забота"] },
{ id:"q5", text:"Как решать конфликты?", options:["Разговор","Компромисс","Пауза","Юмор"] },
{ id:"q6", text:"Что важно каждый день?", options:["Внимание","Забота","Поддержка","Любовь"] }
]
}

];

const GAMES: Game[] = [
  {
    id: "guess-partner",
    title: "Угадай партнёра",
    description: "Попробуй угадать, что выбрал бы твой партнёр в разных ситуациях.",
    reward: 70,
    questions: [
      {
        id: "g1",
        text: "Что партнёр, скорее всего, выберет на вечер?",
        options: [
          "Фильм дома",
          "Прогулку вдвоём",
          "Ресторан",
          "Сон и отдых",
        ],
        correctIndex: 1,
      },
      {
        id: "g2",
        text: "Какой подарок партнёру понравится больше?",
        options: [
          "Сюрприз своими руками",
          "Практичная вещь",
          "Сладости",
          "Сертификат",
        ],
        correctIndex: 0,
      },
      {
        id: "g3",
        text: "Что партнёр выберет из еды?",
        options: ["Роллы", "Бургер", "Пиццу", "Пасту"],
        correctIndex: 0,
      },
      {
        id: "g4",
        text: "Какой формат отдыха ближе партнёру?",
        options: ["Домашний уют", "Поездка", "Вечеринка", "Спорт"],
        correctIndex: 1,
      },
      {
        id: "g5",
        text: "Что партнёр ценит сильнее всего?",
        options: ["Внимание", "Юмор", "Заботу", "Честность"],
        correctIndex: 2,
      },
    ],
  },
  {
    id: "bottle",
    title: "Бутылочка",
    description: "Крути бутылку и получай романтичные и дерзкие задания для пары.",
    reward: 50,
    questions: [],
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

const REWARD_CATEGORIES: RewardCategory[] = [
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
  dailyBonus: {
    streakDay: 1,
    lastClaimDate: null,
    totalPointsEarnedFromBonus: 0,
  },
  stats: {
    pollsCompleted: 0,
    gamesPlayed: 0,
    testsCompleted: 0,
    rewardsRedeemed: 0,
  },
  completedPollIds: [],
  wonRewards: [],
  completedGameIds: [],
  completedTestIds: [],
  pollAnswers: {},
  pair: {
    pairId: null,
    inviteCode: null,
    partner: null,
    createdByTelegramId: null,
  },
};

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
  onBack,
  onCreateInvite,
}: {
  user: TgUser | null;
  pair: PairState;
  points: number;
  onBack: () => void;
  onCreateInvite: () => void;
}) {

  const hasPair = !!pair.pairId;

const inviteLink =
  pair.inviteCode
    ? `https://t.me/testcouple1_bot?startapp=invite_${pair.inviteCode}`
    : "";

  async function copyInvite() {
  if (!inviteLink) return;

  try {
    await navigator.clipboard.writeText(inviteLink);
    alert("Ссылка скопирована");
  } catch {
    alert("Не удалось скопировать ссылку");
  }
}


  return (
    <div style={{ padding: 16, display: "grid", gap: 14 }}>
      <div style={{ ...cardBaseStyle(), padding: 18 }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: "#1f1d3a" }}>
          Пара
        </div>
        <div style={{ marginTop: 8, color: "#3a345c", fontSize: 15, lineHeight: 1.45 }}>
          Здесь можно пригласить партнёра и посмотреть статус вашей пары.
        </div>
      </div>

      {!hasPair ? (
        <>
          <div style={{ ...cardBaseStyle(), padding: 18 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#1f1d3a" }}>
              Пара ещё не подключена
            </div>
            <div style={{ marginTop: 8, color: "#4b446a", lineHeight: 1.45 }}>
              Пригласи партнёра по ссылке, чтобы проходить опросы вместе и считать совместимость.
            </div>

            <button
              onClick={onCreateInvite}
              style={{ ...primaryButtonStyle, width: "100%", marginTop: 16 }}
            >
              Создать приглашение
            </button>
          </div>

          {pair.inviteCode && (
  <div style={{ ...cardBaseStyle(), padding: 18 }}>
    <div style={{ fontSize: 18, fontWeight: 900, color: "#1f1d3a" }}>
      Ссылка-приглашение
    </div>

    <div
      style={{
        marginTop: 12,
        padding: "14px 16px",
        borderRadius: 16,
        background: "rgba(255,255,255,0.24)",
        fontWeight: 700,
        color: "#241b40",
        textAlign: "left",
        fontSize: 14,
        lineHeight: 1.45,
        wordBreak: "break-all",
      }}
    >
      {inviteLink}
     <button
  onClick={copyInvite}
  style={{
    ...primaryButtonStyle,
    width: "100%",
    marginTop: 12,
  }}
>
  Скопировать ссылку
</button>

<a
  href={`https://t.me/share/url?url=${encodeURIComponent(inviteLink)}`}
  target="_blank"
  rel="noreferrer"
  style={{
    ...secondaryButtonStyle,
    display: "block",
    textAlign: "center",
    textDecoration: "none",
    marginTop: 10,
  }}
>
  Отправить приглашение
</a>
{pair.inviteCode && !pair.partner && (
  <div style={{ marginTop: 8, color: "#4b446a", fontSize: 14 }}>
    Ожидаем подключения партнёра…
  </div>
)}

    </div>
  </div>
)}
        </>
      ) : (
        <>
          <div style={{ ...cardBaseStyle(), padding: 18 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#1f1d3a" }}>
              Вы в паре 💕
            </div>

            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              <StatRow
                label="Ты"
                value={user?.first_name ? 1 : 1}
              />
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.24)",
                }}
              >
                <div style={{ color: "#2c2647", fontWeight: 700 }}>Партнёр</div>
                <div style={{ color: "#1c1733", fontWeight: 900, marginTop: 4 }}>
                  {pair.partner?.firstName || "Подключён"}
                  {pair.partner?.username ? ` (@${pair.partner.username})` : ""}
                </div>
              </div>

              <StatRow label="Очки" value={points} />
            </div>
          </div>
        </>
      )}

      <button onClick={onBack} style={secondaryButtonStyle}>
        Назад в меню
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
        Назад в меню
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

function loadState(): AppState {
  if (typeof window === "undefined") return DEFAULT_STATE;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;

    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      points: parsed.points ?? DEFAULT_STATE.points,
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
        pair: {
  pairId: parsed.pair?.pairId ?? DEFAULT_STATE.pair.pairId,
  inviteCode: parsed.pair?.inviteCode ?? DEFAULT_STATE.pair.inviteCode,
  partner: parsed.pair?.partner ?? DEFAULT_STATE.pair.partner,
  createdByTelegramId:
    parsed.pair?.createdByTelegramId ?? DEFAULT_STATE.pair.createdByTelegramId,
},
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
          Назад в меню
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
          <div
            style={{
              width: 160,
              height: 160,
              borderRadius: 999,
              background: "rgba(255,255,255,0.42)",
              border: "1px solid rgba(255,255,255,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 72,
              boxShadow: "0 18px 40px rgba(73, 56, 120, 0.16)",
            }}
          >
            💖
          </div>

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
        padding: 18,
        textAlign: "left",
        minHeight: 112,
        cursor: "pointer",
        background: "rgba(255,255,255,0.20)",
        width: "100%",
      }}
    >
      <div style={{ fontSize: 30 }}>{emoji}</div>
      <div
        style={{
          marginTop: 12,
          fontSize: 18,
          fontWeight: 900,
          color: "#1e1a36",
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
  onNavigate,
}: {
  points: number;
  user: TgUser | null;
  onNavigate: (screen: Screen) => void;
}) {
  const firstName = user?.first_name || "Друг";

  return (
    <div style={{ padding: 16, paddingTop: 18 }}>
      <div style={{ ...cardBaseStyle(), padding: 18, marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#1f1d3a" }}>
              Привет, {firstName}
            </div>
            <div style={{ marginTop: 6, color: "#3a345c", fontSize: 15 }}>
              Выбирай раздел и начинай игру
            </div>
          </div>

          <div
            style={{
              padding: "12px 14px",
              borderRadius: 16,
              background: "rgba(255,255,255,0.34)",
              fontSize: 16,
              fontWeight: 900,
              color: "#241b40",
              whiteSpace: "nowrap",
            }}
          >
            ⭐ {points}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 14,
        }}
      >
        <MenuButton label="Опросы" emoji="🗳️" onClick={() => onNavigate("polls")} />
        <MenuButton label="Игры" emoji="🎮" onClick={() => onNavigate("games")} />
        <MenuButton label="Тесты" emoji="🧠" onClick={() => onNavigate("tests")} />
        <MenuButton label="Очки и призы" emoji="🎡" onClick={() => onNavigate("rewards")} />
          <MenuButton label="Пара" emoji="💕" onClick={() => onNavigate("pair")} />
        <div style={{ gridColumn: "1 / -1" }}>
          <MenuButton
            label="Профиль и статистика"
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
  const [activePollId, setActivePollId] = useState<string | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);

  const activePoll = POLLS.find((poll) => poll.id === activePollId) || null;
  const currentQuestion = activePoll?.questions[currentQuestionIndex] || null;

  function startPoll(pollId: string) {
    setActivePollId(pollId);
    setCurrentQuestionIndex(0);
    setAnswers([]);
    setFinished(false);
  }

 function handleSelect(optionIndex: number) {
  setAnswers((prev) => {
    const next = [...prev];
    next[currentQuestionIndex] = optionIndex;
    return next;
  });
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
    <div style={{ padding: 16, display: "grid", gap: 14 }}>
      <div style={{ ...cardBaseStyle(), padding: 18 }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: "#1f1d3a" }}>
          Опросы
        </div>
        <div style={{ marginTop: 8, color: "#3a345c", fontSize: 15 }}>
          Выбери опрос и пройди его до конца, чтобы получить очки.
        </div>
      </div>

      <div style={{ fontSize: 22, fontWeight: 900 }}>
  {genderFilter === "girl" ? "Опросы для неё 👧" : "Опросы для него 👦"}
</div>

{filteredPolls.map((poll) => {

        const completed = completedPollIds.includes(poll.id);

        return (
          <div key={poll.id} style={{ ...cardBaseStyle(), padding: 18 }}>
            <div
              style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
            >
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#1f1d3a" }}>
                  {poll.title}
                </div>
                <div style={{ marginTop: 8, color: "#40395f", lineHeight: 1.45 }}>
                  {poll.description}
                </div>
              </div>
              <div
                style={{
                  alignSelf: "flex-start",
                  padding: "8px 12px",
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.28)",
                  fontWeight: 900,
                  whiteSpace: "nowrap",
                }}
              >
                +{poll.reward}
              </div>
            </div>

            <div style={{ marginTop: 12, color: "#4d466c", fontSize: 14 }}>
              Вопросов: {poll.questions.length}
            </div>

            <button
              onClick={() => startPoll(poll.id)}
              style={{
                ...primaryButtonStyle,
                width: "100%",
                marginTop: 14,
                opacity: completed ? 0.92 : 1,
              }}
            >
              {completed ? "Пройти снова" : "Начать"}
            </button>
          </div>
        );
      })}

      
      <button onClick={onBack} style={secondaryButtonStyle}>
        Назад в меню
      </button>
    </div>
  );
}

  if (finished && activePoll) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ ...cardBaseStyle(), padding: 20 }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: "#1f1d3a" }}>
            Готово 🎉
          </div>
          <div style={{ marginTop: 10, color: "#3a345c", lineHeight: 1.5 }}>
            Ты завершил опрос <b>{activePoll.title}</b> и получаешь{" "}
            <b>+{activePoll.reward} очков</b>.
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

  if (!activePoll || !currentQuestion) return null;

  const selected = answers[currentQuestionIndex];

  return (
    <div style={{ padding: 16, display: "grid", gap: 14 }}>
      <div style={{ ...cardBaseStyle(), padding: 18 }}>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#1f1d3a" }}>
          {activePoll.title}
        </div>
        <div style={{ marginTop: 8, color: "#4b446a" }}>
          Вопрос {currentQuestionIndex + 1} из {activePoll.questions.length}
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
  const isSelected = selected === index;

  return (
    <button
      key={option}
      onClick={() => handleSelect(index)}
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
          disabled={!selected}
          style={{
            ...primaryButtonStyle,
            width: "100%",
            marginTop: 16,
            opacity: selected ? 1 : 0.55,
            cursor: selected ? "pointer" : "not-allowed",
          }}
        >
          {currentQuestionIndex === activePoll.questions.length - 1
            ? "Завершить"
            : "Дальше"}
        </button>

        <button onClick={() => setActivePollId(null)} style={secondaryButtonStyle}>
          Выйти из опроса
        </button>
      </div>
    </div>
  );
}


function GamesScreen({
  completedGameIds,
  onBack,
  onCompleteGame,
}: {
  completedGameIds: string[];
  onBack: () => void;
  onCompleteGame: (game: Game, score: number) => void;
}) {
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [finished, setFinished] = useState(false);
  const [bottleRewardGiven, setBottleRewardGiven] = useState(false);

  const activeGame = GAMES.find((game) => game.id === activeGameId) || null;
  const currentQuestion = activeGame?.questions[currentQuestionIndex] || null;

  function startGame(gameId: string) {
    setActiveGameId(gameId);
    setCurrentQuestionIndex(0);
    setSelectedOptionIndex(null);
    setCorrectAnswers(0);
    setFinished(false);
    setBottleRewardGiven(false);
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
    setActiveGameId(null);
    setCurrentQuestionIndex(0);
    setSelectedOptionIndex(null);
    setCorrectAnswers(0);
    setFinished(false);
  }

  function handleBottleFinish() {
    if (!activeGame || bottleRewardGiven) return;
    onCompleteGame(activeGame, 1);
    setBottleRewardGiven(true);
  }

  if (!activeGameId) {
    return (
      <div style={{ padding: 16, display: "grid", gap: 14 }}>
        <div style={{ ...cardBaseStyle(), padding: 18 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#1f1d3a" }}>
            Игры
          </div>
          <div style={{ marginTop: 8, color: "#3a345c", fontSize: 15 }}>
            Здесь можно играть вдвоём и зарабатывать очки.
          </div>
        </div>

        {GAMES.map((game) => {
          const completed = completedGameIds.includes(game.id);

          return (
            <div key={game.id} style={{ ...cardBaseStyle(), padding: 18 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#1f1d3a" }}>
                {game.title}
              </div>
              <div style={{ marginTop: 8, color: "#40395f", lineHeight: 1.45 }}>
                {game.description}
              </div>

              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  color: "#4d466c",
                  fontSize: 14,
                }}
              >
                <span>
                  {game.id === "bottle"
                    ? "Формат: раунд"
                    : `Вопросов: ${game.questions.length}`}
                </span>
                <span>Награда: +{game.reward}</span>
              </div>

              <button
                onClick={() => startGame(game.id)}
                style={{
                  ...primaryButtonStyle,
                  width: "100%",
                  marginTop: 14,
                  opacity: completed ? 0.92 : 1,
                }}
              >
                {completed ? "Сыграть снова" : "Начать игру"}
              </button>
            </div>
          );
        })}

        <button onClick={onBack} style={secondaryButtonStyle}>
          Назад в меню
        </button>
      </div>
    );
  }

  if (activeGame?.id === "bottle") {
    return (
      <BottleGameScreen
        reward={activeGame.reward}
        onBack={() => setActiveGameId(null)}
        onFinish={handleBottleFinish}
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
    </div>
  );
}

function BottleGameScreen({
  reward,
  onBack,
  onFinish,
}: {
  reward: number;
  onBack: () => void;
  onFinish: () => void;
}) {
  const [rotation, setRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<"boy" | "girl" | null>(null);
  const [selectedTask, setSelectedTask] = useState<BottleTask | null>(null);
  const [completed, setCompleted] = useState(false);

  function spinBottle() {
    if (isSpinning) return;

    window.navigator.vibrate?.(80);
    setCompleted(false);
    setSelectedTask(null);
    setSelectedTarget(null);
    setIsSpinning(true);

    const targets: Array<"boy" | "girl"> = ["boy", "girl"];
    const chosenTarget = targets[Math.floor(Math.random() * targets.length)];

    const extraTurns = 5 * 360;
    const targetAngle = chosenTarget === "boy" ? 90 : 270;
    const randomOffset = Math.floor(Math.random() * 30) - 15;
    const finalRotation = extraTurns + targetAngle + randomOffset;

    setRotation((prev) => {
      const normalizedPrev = ((prev % 360) + 360) % 360;
      return prev - normalizedPrev + finalRotation;
    });

    setTimeout(() => {
      const tasks = BOTTLE_TASKS.filter((task) => task.target === chosenTarget);
      const task = tasks[Math.floor(Math.random() * tasks.length)];

      window.navigator.vibrate?.([120, 60, 120]);
      setSelectedTarget(chosenTarget);
      setSelectedTask(task);
      setIsSpinning(false);
    }, 3200);
  }

  function handleDone() {
    setCompleted(true);
    onFinish();
  }

  function handleNewTask() {
    if (!selectedTarget) return;
    const tasks = BOTTLE_TASKS.filter((task) => task.target === selectedTarget);
    const task = tasks[Math.floor(Math.random() * tasks.length)];
    setSelectedTask(task);
    setCompleted(false);
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 14 }}>
      <div style={{ ...cardBaseStyle(), padding: 18 }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: "#1f1d3a" }}>
          Бутылочка
        </div>
        <div style={{ marginTop: 8, color: "#3a345c", fontSize: 15, lineHeight: 1.45 }}>
          Крути бутылку — она выберет, кто ходит: <b>парень</b> или <b>девушка</b>.
          После этого выпадет задание для выбранного игрока.
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
          Награда за раунд: +{reward} очков
        </div>
      </div>

 <div style={{ ...cardBaseStyle(), padding: 18 }}>
  <div
    style={{
      position: "relative",
      width: 300,
      height: 300,
      margin: "0 auto",
      maxWidth: "100%",
    }}
  >
   <div
  style={{
    position: "absolute",
    top: "50%",
    left: 0,
    transform: "translateY(-50%)",
    fontSize: 18,
    fontWeight: 900,
    color: "#1f1d3a",
    background:
      selectedTarget === "boy"
        ? "rgba(255,255,255,0.55)"
        : "rgba(255,255,255,0.28)",
    borderRadius: 14,
    padding: "8px 10px",
    boxShadow:
      selectedTarget === "boy"
        ? "0 0 18px rgba(255,255,255,0.9)"
        : "none",
    transition: "all 0.3s",
  }}
>
  👦 Парень
</div>

    <div
  style={{
    position: "absolute",
    top: "50%",
    right: 0,
    transform: "translateY(-50%)",
    fontSize: 18,
    fontWeight: 900,
    color: "#1f1d3a",
    background:
      selectedTarget === "girl"
        ? "rgba(255,255,255,0.55)"
        : "rgba(255,255,255,0.28)",
    borderRadius: 14,
    padding: "8px 10px",
    boxShadow:
      selectedTarget === "girl"
        ? "0 0 18px rgba(255,255,255,0.9)"
        : "none",
    transition: "all 0.3s",
  }}
>
  👧 Девушка
</div>

    <div
      style={{
        position: "absolute",
        inset: 40,
        borderRadius: "50%",
        border: "2px dashed rgba(255,255,255,0.55)",
        background: "rgba(255,255,255,0.08)",
      }}
    />

    <img
      src="/bottle.png"
      alt="Бутылка"
      style={{
        width: 130,
        height: "auto",
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        transition: isSpinning
          ? "transform 3.2s cubic-bezier(0.22, 1, 0.36, 1)"
          : "none",
        transformOrigin: "center center",
        filter: "drop-shadow(0 12px 20px rgba(0,0,0,0.25))",
      }}
    />

    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: 42,
        height: 42,
        borderRadius: "50%",
        background: "rgba(255,255,255,0.95)",
        border: "3px solid rgba(255,255,255,0.8)",
        zIndex: 2,
      }}
    />
  </div>

  <button
    onClick={spinBottle}
    disabled={isSpinning}
    style={{
      ...primaryButtonStyle,
      width: "100%",
      marginTop: 16,
      opacity: isSpinning ? 0.65 : 1,
      cursor: isSpinning ? "not-allowed" : "pointer",
    }}
  >
    {isSpinning ? "Крутим..." : "Крутить бутылку"}
  </button>
</div>
        
      {selectedTarget && selectedTask && (
        <div style={{ ...cardBaseStyle(), padding: 18 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#1f1d3a" }}>
            Ходит: {selectedTarget === "boy" ? "Парень 👦" : "Девушка 👧"}
          </div>

          <div
            style={{
              marginTop: 14,
              padding: "14px 16px",
              borderRadius: 18,
              background: "rgba(255,255,255,0.26)",
              color: "#241b40",
              fontSize: 18,
              fontWeight: 800,
              lineHeight: 1.45,
            }}
          >
            {selectedTask.text}
          </div>

          {!completed ? (
            <>
              <button
                onClick={handleDone}
                style={{ ...primaryButtonStyle, width: "100%", marginTop: 16 }}
              >
                Выполнено
              </button>

              <button
                onClick={handleNewTask}
                style={secondaryButtonStyle}
              >
                Другое задание
              </button>
            </>
          ) : (
            <div
              style={{
                marginTop: 14,
                padding: "12px 14px",
                borderRadius: 16,
                background: "rgba(255,255,255,0.24)",
                color: "#2c2647",
                fontWeight: 800,
              }}
            >
              Готово. Очки начислены ✅
            </div>
          )}
        </div>
      )}

      <button onClick={onBack} style={secondaryButtonStyle}>
        Назад в игры
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

  const activeTest = TESTS.find((item) => item.id === activeTestId) || null;
  const currentQuestion = activeTest?.questions[currentQuestionIndex] || null;

  function startTest(testId: string) {
    setActiveTestId(testId);
    setCurrentQuestionIndex(0);
    setAnswers([]);
    setFinished(false);
  }

  function selectOption(optionIndex: number) {
    setAnswers((prev) => {
      const next = [...prev];
      next[currentQuestionIndex] = optionIndex;
      return next;
    });
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
      <div style={{ padding: 16, display: "grid", gap: 14 }}>
        <div style={{ ...cardBaseStyle(), padding: 18 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#1f1d3a" }}>
            Тесты
          </div>
          <div style={{ marginTop: 8, color: "#3a345c", fontSize: 15 }}>
            Пройди тест и узнай о себе и своих отношениях чуть больше.
          </div>
        </div>

        {TESTS.map((test) => {
          const completed = completedTestIds.includes(test.id);

          return (
            <div key={test.id} style={{ ...cardBaseStyle(), padding: 18 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#1f1d3a" }}>
                {test.title}
              </div>
              <div style={{ marginTop: 8, color: "#40395f", lineHeight: 1.45 }}>
                {test.description}
              </div>

              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  color: "#4d466c",
                  fontSize: 14,
                }}
              >
                <span>Вопросов: {test.questions.length}</span>
                <span>Награда: +{test.reward}</span>
              </div>

              <button
                onClick={() => startTest(test.id)}
                style={{
                  ...primaryButtonStyle,
                  width: "100%",
                  marginTop: 14,
                  opacity: completed ? 0.92 : 1,
                }}
              >
                {completed ? "Пройти снова" : "Начать тест"}
              </button>
            </div>
          );
        })}

        <button onClick={onBack} style={secondaryButtonStyle}>
          Назад в меню
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

        <button
          onClick={handleNext}
          disabled={selectedIndex === undefined}
          style={{
            ...primaryButtonStyle,
            width: "100%",
            marginTop: 16,
            opacity: selectedIndex !== undefined ? 1 : 0.55,
            cursor: selectedIndex !== undefined ? "pointer" : "not-allowed",
          }}
        >
          {currentQuestionIndex === activeTest.questions.length - 1
            ? "Посмотреть результат"
            : "Дальше"}
        </button>

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
  onSpin: (categoryIndex: number) => WonReward | null;
}) {
  const [rotation, setRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedRewardId, setSelectedRewardId] = useState<string | null>(null);

  const size = 320;
  const radius = 150;
  const center = size / 2;
  const count = REWARD_CATEGORIES.length;
  const segmentAngle = 360 / count;

  function handleSpin() {
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

    setTimeout(() => {
      const result = onSpin(targetIndex);
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
    <div style={{ padding: 16, display: "grid", gap: 14 }}>
      <div style={{ ...cardBaseStyle(), padding: 18 }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: "#1f1d3a" }}>
          Колесо призов
        </div>
        <div style={{ marginTop: 8, color: "#3a345c", fontSize: 15, lineHeight: 1.45 }}>
          Крути колесо категорий. После остановки выпадет категория, а внутри неё —
          случайный реальный приз. Одно вращение стоит <b>{WHEEL_SPIN_COST}</b> очков.
        </div>

        <div
          style={{
            marginTop: 14,
            padding: "14px 16px",
            borderRadius: 18,
            background: "rgba(255,255,255,0.26)",
            fontSize: 20,
            fontWeight: 900,
            color: "#241b40",
          }}
        >
          ⭐ Доступно очков: {points}
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
            marginTop: 18,
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
        Назад в меню
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
  pollAnswers,
  onBack,
}: {
  user: TgUser | null;
  points: number;
  stats: AppStats;
  bonusState: DailyBonusState;
  wonRewards: WonReward[];
  pollAnswers: Record<string, number[]>;
  onBack: () => void;
}) {
  
  const fullName =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    "Пользователь";
  const username = user?.username ? `@${user.username}` : "@telegram_user";
  const match = calculateMatch(
  pollAnswers["girl-romance"],
  pollAnswers["boy-romance"]
);

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
            <div style={{ marginTop: 4, color: "#4d466c", fontSize: 15 }}>
              {username}
            </div>
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
          Статистика
        </div>
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          <StatRow label="Опросов пройдено" value={stats.pollsCompleted} />
          <StatRow label="Игр сыграно" value={stats.gamesPlayed} />
          <StatRow label="Тестов пройдено" value={stats.testsCompleted} />
          <StatRow label="Выиграно призов" value={stats.rewardsRedeemed} />
          <StatRow label="Всего очков" value={points} />
          <StatRow label="Текущий день бонуса" value={bonusState.streakDay} />
          <StatRow
            label="Очков из бонусов"
            value={bonusState.totalPointsEarnedFromBonus}
          />
        </div>
      </div>

       <div
  style={{
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.25)",
    fontWeight: 800,
    textAlign: "center",
    color: "#1f1d3a",
  }}
>
  Совпадение ответов: {match !== null ? `${match}%` : "—"}
</div>
      

      <div style={{ ...cardBaseStyle(), padding: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#1f1d3a" }}>
          Последние призы
        </div>

        {wonRewards.length === 0 ? (
          <div style={{ marginTop: 10, color: "#4a4468", lineHeight: 1.5 }}>
            Пока призов нет.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {[...wonRewards]
              .reverse()
              .slice(0, 3)
              .map((reward, index) => (
                <div
                  key={`${reward.id}-${index}-${reward.wonAt}`}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 16,
                    background: "rgba(255,255,255,0.24)",
                  }}
                >
                  <div style={{ fontWeight: 900, color: "#241b40" }}>
                    {reward.title}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 14, color: "#4d466c" }}>
                    Категория: {reward.categoryTitle}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      <button onClick={onBack} style={secondaryButtonStyle}>
        Назад в меню
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
  borderRadius: 18,
  padding: "16px 18px",
  fontSize: 18,
  fontWeight: 900,
  cursor: "pointer",
  color: "white",
  background: "linear-gradient(135deg, #8f6bff, #ff76ba)",
  boxShadow: "0 14px 30px rgba(126, 75, 255, 0.28)",
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.34)",
  borderRadius: 18,
  padding: "15px 18px",
  fontSize: 16,
  fontWeight: 900,
  cursor: "pointer",
  color: "#201b39",
  background: "rgba(255,255,255,0.22)",
  marginTop: 14,
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
async function loadPairStateForUser(telegramId: number): Promise<PairState> {
  const emptyState: PairState = {
    pairId: null,
    inviteCode: null,
    partner: null,
    createdByTelegramId: null,
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

  const partnerTelegramId =
    pair.partner_1_telegram_id === telegramId
      ? pair.partner_2_telegram_id
      : pair.partner_1_telegram_id;

      console.log("LOAD PAIR:", pair);
console.log("PARTNER TELEGRAM ID:", partnerTelegramId);

 let partner: PairMember | null = null;
let partnerProfile: any = null;

if (partnerTelegramId) {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("telegram_id", partnerTelegramId)
    .maybeSingle();

  partnerProfile = data;

  if (partnerProfile) {
    partner = {
      telegramId: partnerProfile.telegram_id,
      firstName: partnerProfile.first_name ?? undefined,
      lastName: partnerProfile.last_name ?? undefined,
      username: partnerProfile.username ?? undefined,
      photoUrl: partnerProfile.photo_url ?? undefined,
    };
  }
}

console.log("PARTNER PROFILE:", partnerProfile);

  return {
    pairId: pair.id,
    inviteCode: pair.invite_code,
    partner,
    createdByTelegramId: pair.created_by_telegram_id,
  };
}



async function joinPairByInviteCode(
  telegramId: number,
  inviteCode: string
): Promise<PairState | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("pair_id")
    .eq("telegram_id", telegramId)
    .maybeSingle();

    console.log("joinPairByInviteCode called", { telegramId, inviteCode });

  if (profile?.pair_id) {
    return loadPairStateForUser(telegramId);
  }

  const { data: pair, error: pairError } = await supabase
    .from("pairs")
    .select("*")
    .eq("invite_code", inviteCode)
    .maybeSingle();

  if (pairError || !pair) {
    console.error("joinPairByInviteCode: pair not found", pairError);
    return null;
  }

  if (
    pair.partner_1_telegram_id === telegramId ||
    pair.partner_2_telegram_id === telegramId
  ) {
    return loadPairStateForUser(telegramId);
  }

  console.log("PAIR FOUND:", pair);

  if (pair.partner_2_telegram_id) {
    console.error("joinPairByInviteCode: pair already full");
    return null;
  }

 const { error: updatePairError } = await supabase
  .from("pairs")
  .update({ partner_2_telegram_id: telegramId })
  .eq("id", pair.id);

if (updatePairError) {
  console.error("joinPairByInviteCode update pair error:", updatePairError);
  return null;
}

const { data: joinedProfileBefore } = await supabase
  .from("profiles")
  .select("*")
  .eq("telegram_id", telegramId)
  .maybeSingle();

console.log("JOINER PROFILE BEFORE UPDATE:", joinedProfileBefore);

const { error: updateProfileError } = await supabase
  .from("profiles")
  .update({ pair_id: pair.id })
  .eq("telegram_id", telegramId);

if (updateProfileError) {
  console.error("joinPairByInviteCode update profile error:", updateProfileError);
  return null;
}

  console.log("PAIR UPDATED");

  return loadPairStateForUser(telegramId);
}

export default function Page() {
  const handleCreateInvite = () => {
  const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();

  setAppState((prev) => ({
    ...prev,
    pair: {
      ...prev.pair,
      inviteCode,
      createdByTelegramId: user?.id ?? null,
    },
  }));
};



  const [mounted, setMounted] = useState(false);
  const [screen, setScreen] = useState<Screen>("welcome");
  const [appState, setAppState] = useState<AppState>(DEFAULT_STATE);
  const [user, setUser] = useState<TgUser | null>(null);
  const [showDailyBonus, setShowDailyBonus] = useState(true);
  const [claimableDay, setClaimableDay] = useState(1);
  const [bonusClaimAvailable, setBonusClaimAvailable] = useState(true);

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
    tg?.ready?.();
    tg?.expand?.();

    const telegramUser = tg?.initDataUnsafe?.user;
    const startParam = tg?.initDataUnsafe?.start_param;
    


    const saved = loadState();
    setAppState(saved);

    const alreadyClaimed = hasClaimedToday(saved.dailyBonus.lastClaimDate);
    const nextDay = getNextStreakDay(
      saved.dailyBonus.lastClaimDate,
      saved.dailyBonus.streakDay
    );

    setClaimableDay(nextDay);
    setBonusClaimAvailable(!alreadyClaimed);
    setShowDailyBonus(true);

    if (!telegramUser?.id) {
      setUser({
        first_name: "Гость",
        username: "guest",
      });
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

    await upsertTelegramProfile(currentUser);

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

    setAppState((prev) => ({
      ...prev,
      pair: nextPairState,
    }));

  }

  bootstrap();
}, []);


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

 const handleCompletePoll = (poll: Poll, answers: number[]) => {
  setAppState((prev) => {
    const alreadyCompleted = prev.completedPollIds.includes(poll.id);

    return {
      ...prev,
      points: prev.points + poll.reward,
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

  setScreen("menu");
};

  const handleCompleteGame = (game: Game, score: number) => {
    setAppState((prev) => {
      const alreadyCompleted = prev.completedGameIds.includes(game.id);

      return {
        ...prev,
        points: prev.points + game.reward,
        stats: {
          ...prev.stats,
          gamesPlayed: prev.stats.gamesPlayed + 1,
        },
        completedGameIds: alreadyCompleted
          ? prev.completedGameIds
          : [...prev.completedGameIds, game.id],
      };
    });

      setScreen("menu");
  };

      const handleCompleteTest = (test: TestDefinition) => {
    setAppState((prev) => {
      const alreadyCompleted = prev.completedTestIds.includes(test.id);

      return {
        ...prev,
        points: prev.points + test.reward,
        stats: {
          ...prev.stats,
          testsCompleted: prev.stats.testsCompleted + 1,
        },
        completedTestIds: alreadyCompleted
          ? prev.completedTestIds
          : [...prev.completedTestIds, test.id],
      };
    });


    setScreen("menu");
  };

  const handleSpinReward = (categoryIndex: number) => {
    let result: WonReward | null = null;

    setAppState((prev) => {
      if (prev.points < WHEEL_SPIN_COST) return prev;

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

      return {
        ...prev,
        points: prev.points - WHEEL_SPIN_COST,
        stats: {
          ...prev.stats,
          rewardsRedeemed: prev.stats.rewardsRedeemed + 1,
        },
        wonRewards: result ? [...prev.wonRewards, result] : prev.wonRewards,
      };
    });

    return result;
  };

  if (!mounted) return null;

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle, rgba(238, 174, 202, 1) 0%, rgba(148, 187, 233, 1) 100%)",
        paddingBottom: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 520, margin: "0 auto" }}>
        {showDailyBonus && (
          <DailyBonusModal
            currentDay={claimableDay}
            canClaim={bonusClaimAvailable}
            onClaim={handleClaimBonus}
            onClose={() => setShowDailyBonus(false)}
          />
        )}

        {screen === "welcome" && <WelcomeScreen onStart={() => setScreen("menu")} />}

        {screen === "menu" && (
          <MainMenu
            points={appState.points}
            user={user}
            onNavigate={(next) => setScreen(next)}
          />
        )}

        {screen === "polls" && (
  <PollsEntryScreen
    onBack={() => setScreen("menu")}
    onSelect={(target) =>
      setScreen(target === "boy" ? "polls-boy" : "polls-girl")
    }
  />
)}

{screen === "polls-boy" && (
  <PollsScreen
    genderFilter="boy"
    completedPollIds={appState.completedPollIds}
    onBack={() => setScreen("polls")}
    onCompletePoll={handleCompletePoll}
  />
)}

{screen === "polls-girl" && (
  <PollsScreen
    genderFilter="girl"
    completedPollIds={appState.completedPollIds}
    onBack={() => setScreen("polls")}
    onCompletePoll={handleCompletePoll}
  />
)}

        {screen === "games" && (
          <GamesScreen
            completedGameIds={appState.completedGameIds}
            onBack={() => setScreen("menu")}
            onCompleteGame={handleCompleteGame}
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

        {screen === "profile" && (
        <ProfileAndStatsScreen
          user={user}
          points={appState.points}
          stats={appState.stats}
          bonusState={appState.dailyBonus}
          wonRewards={appState.wonRewards}
          pollAnswers={appState.pollAnswers}
          onBack={() => setScreen("menu")}
  />
)}

{screen === "pair" && (
  <PairScreen
    user={user}
    pair={appState.pair}
    points={appState.points}
    onBack={() => setScreen("menu")}
    onCreateInvite={handleCreateInvite}
  />
)}

        {!showDailyBonus && screen === "welcome" && totalActivities > 999999 && <div />}
      </div>
    </main>
  );
}