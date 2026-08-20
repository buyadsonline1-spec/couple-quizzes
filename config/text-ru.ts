export const TEXT_RU = {
  appName: "Couple Quizzes",

  menu: {
  polls: "Опросы",
  games: "Игры",
  tests: "Тесты",
  rewards: "Очки и призы",
  pair: "Пара",
  top: "Топ игроков",
  topPlayers: "Топ игроков",
  profile: "Профиль и статистика",
},

  common: {
    back: "Назад",
    start: "Старт",
    next: "Далее",
    finish: "Завершить",
    continue: "Продолжить",
    save: "Сохранить",
    cancel: "Отмена",
    close: "Закрыть",
    claim: "Получить",
    play: "Играть",
    open: "Открыть",
    loading: "Загрузка...",
    noData: "Пока нет данных",
    done: "Готово",
  },

  home: {
    pairLevel: "Уровень пары",
    toNextLevel: "До следующего уровня",
    yourPoints: "Ваши очки",
    newbies: "Новички",
  },

  bonus: {
    title: "Ежедневный бонус",
    subtitle: "Заходи каждый день и забирай награду",
    day: "День",
    claim: "Получить",
    claimed: "Получено",
    available: "Доступно",
    soon: "Скоро",
    pointsWord: "очков",
  },

  polls: {
    title: "Опросы",
    subtitle: "Узнайте друг друга лучше",
    empty: "Опросы пока недоступны",
    completed: "Пройдено",
    reward: "Награда",
  },

  tests: {
    title: "Тесты",
    subtitle: "Проверьте, насколько хорошо вы знаете друг друга",
    empty: "Тесты пока недоступны",
    completed: "Пройдено",
    reward: "Награда",
  },

  games: {
    title: "Игры",
    subtitle: "Играй и зарабатывай очки",
    empty: "Игры пока недоступны",
    completed: "Пройдено",
    reward: "Награда",
    bottle: "Бутылочка",
    whoFirst: "Кто идет первым?",
    spin: "Крутить",
    neverHaveIEver: "Я никогда не...",
    neverHaveIEverDesc:
      "Скажите что-то, чего вы никогда в жизни не делали, и если ваш партнёр делал это, он выполняет задание с карточки.",
    bottleDesc:
      "Крути бутылку и получай романтичные и дерзкие задания для пары.",
    questions90: "90 вопросов",
    questions90Desc:
      "Случайные глубокие вопросы про любовь, чувства и отношения.",
    start: "Начать",
  },

  rewards: {
    title: "Очки и призы",
    subtitle: "Обменивайте очки на призы",
    wheel: "Колесо призов",
    prizes: "Призы",
    spin: "Крутить колесо",
    notEnoughPoints: "Недостаточно очков",
    yourBalance: "Ваш баланс",
  },

 pair: {
  title: "Пара",
  subtitle: "Ваш прогресс как пары",
  level: "Уровень",
  compatibility: "Совместимость",
  totalPoints: "Всего очков пары",
  nextLevel: "До следующего уровня",
  noPairYet: "Пара еще не подключена",

  // Используются на экране "Пара", когда пары ещё нет / партнёр не
  // подключился (см. PairScreen в app/page.tsx).
  statusNotConnected: "Пара не подключена",
  noPairTitle: "Создай пару",
  noPairText:
    "Пригласи партнёра, чтобы вместе проходить опросы, тесты и игры.",
  invitePartner: "Пригласить партнёра",

  inPair: "Вы в паре",
  you: "Ты",
  partner: "Партнёр",
  currentLevel: "Текущий уровень",
  untilNext: "До следующего",
  dailyQuestion: "Вопрос дня",
  streakInfo: "Серия",
  pairInvite: "Пригласить партнёра",
  pairConnected: "Пара подключена",
  maxLevel: "Макс. уровень",

  dailyQuestionHint: "Отвечайте вместе каждый день и получайте бонусы 💞",
  streakDaysLabel: "Серия",
  streakDaysWord: "дней",
  youAreInPair: "Вы в паре 💕",
  youCreatedPair: "Вы создали пару 💞",
  keepGettingToKnow: "Продолжайте узнавать друг друга 💫",
  sendCodeOrLink:
    "Отправь код или ссылку партнёру, чтобы он подключился к вашей паре.",
  defaultUserName: "Пользователь",
  connectedFallback: "Подключён",
  partnerNotConnectedYet: "Партнёр ещё не подключился",
  partnerNotJoinedYet: "Партнёр ещё не присоединился",
  compatibilityCalculatedPrefix: "Рассчитано по ",
  compatibilityCalculatedMid: " из ",
  compatibilityCalculatedSuffix: " тем",
  takePollsPrompt:
    "Пройдите парные опросы и узнайте, насколько вы подходите друг другу 💞",
  takePollsButton: "Пройти опросы",
  themesCompletedPrefix: "Тем пройдено: ",

  compatibilityInfo: {
    notCalculatedTitle: "Совместимость пока не рассчитана",
    notCalculatedText:
      "Пройдите вместе хотя бы один общий парный опрос — и здесь появится процент совместимости, тип пары и разбор по темам.",
    headerLabel: "Совместимость пары",
    strongSides: "Сильные стороны пары",
    growthZones: "На что стоит обратить внимание",
    byThemes: "Совместимость по темам",
  },

  invite: {
    subtitle:
      "Сначала создай код приглашения, потом отправь ссылку или дай код партнёру.",
    enterCodeAlert: "Введите код приглашения",
    createFirstAlert: "Сначала создай код приглашения",
    linkCopiedAlert: "Ссылка скопирована",
    copyFailedAlert: "Не удалось скопировать ссылку",
    createStepTitle: "1. Создать код приглашения",
    createStepText: "Это создаст твоё приглашение для подключения пары.",
    creating: "Создаём...",
    createCode: "Создать код приглашения",
    linkTitle: "Ссылка-приглашение",
    copy: "Копировать",
    shareLink: "Отправить ссылку",
    joinByCode: "Добавить по коду",
    enterCodeTitle: "Ввести код приглашения",
    enterCodeText: "Если тебе отправили код, введи его здесь.",
    codePlaceholder: "Например: AB12CD",
    joining: "Подключаем...",
    join: "Подключиться",
  },

  streakInfoScreen: {
    title: "Серия пары",
    daysShort: "дн.",
    description:
      "Вы оба отвечаете на вопрос дня подряд и прокачиваете серию пары.",
    nextBonus: "Следующий бонус",
    maxReached: "Максимальный рубеж достигнут 👑",
    milestonesTitle: "Рубежи серии",
    milestonesDesc:
      "Чем длиннее серия, тем больше бонусных очков получает ваша пара.",
    reached: "получено",
    next: "следующий",
    daysInARow: "дней подряд",
  },
},

  referrals: {
    title: "Пригласить друзей",
    subtitle:
      "Приглашай друзей в Couple Quizzes и получай +200 очков за каждого нового пользователя, который зашел по твоей ссылке.",
    invitedFriends: "Приглашено друзей",
    earnedPoints: "Заработано очков",
    yourLink: "Твоя ссылка",
    inviteButton: "Пригласить друзей",
    cardText:
      "Получай +200 очков за каждого друга, который откроет приложение по твоей ссылке.",
  },

  top: {
    title: "Топ игроков",
    subtitle: "Лучшие пары этого рейтинга",
    place: "Место",
    points: "Очки",
    empty: "Рейтинг пока пуст",
    leaderboard: "Рейтинг",
    leadersOfWeek: "Лидеры недели",
    weeklyReward: "Награда недели",
    topPairsReward: "Пары из топа получают +500 очков",
    weeklyRewardHint:
      "Награда появляется только после завершения недели и только для пар из топ-3 прошлой недели",
  },

  profile: {
    title: "Профиль и статистика",
    name: "Имя",
    username: "Имя пользователя",
    stats: "Статистика",
    pollsCompleted: "Опросов пройдено",
    testsCompleted: "Тестов пройдено",
    gamesPlayed: "Игр сыграно",
    currentBonusDay: "Текущий день бонуса",
    bonusPoints: "Очков из бонусов",
    noPrizes: "Пока призов нет",
    recentPrizes: "Выиграно призов",
    totalPoints: "Всего очков",
  },

  notifications: {
    newLevel: "Новый уровень!",
    rewardReceived: "Награда получена!",
    sectionCompleted: "Раздел полностью пройден!",
    bonusReceived: "Бонус получен!",
  },

  genderSelect: {
    title: "Выбери свой пол",
    subtitle:
      "Это нужно только один раз, чтобы показывать тебе подходящие тесты и опросы!",
    boy: "Я парень",
    girl: "Я девушка",
  },

  auth: {
    signInTitle: "Войдите в аккаунт",
    signUpTitle: "Создайте аккаунт",
    emailPlaceholder: "Email",
    passwordPlaceholder: "Пароль",
    submit: "Войти",
    submitSignUp: "Создать аккаунт",
    submitLoading: "Подождите...",
    or: "или",
    appleSignIn: "Войти через Apple ID",
    switchToSignIn: "У меня уже есть аккаунт",
    switchToSignUp: "Создать новый аккаунт",
    checkEmailTitle: "Проверьте почту",
    checkEmailPrefix: "Мы отправили письмо со ссылкой подтверждения на ",
    checkEmailSuffix: ". Перейдите по ней, а затем войдите в аккаунт.",
    gotIt: "Понятно",
    emailPasswordRequired: "Введите email и пароль",
    genericError: "Что-то пошло не так, попробуйте ещё раз",
    appleSignInError: "Не удалось войти через Apple ID, попробуйте ещё раз",
  },
} as const;