export type Market = "ru" | "en" | "fi";

// Определяет язык контента. Порядок приоритета:
// 1) явный выбор пользователя (localStorage, ставится на экране выбора
//    языка или переключателем в настройках) — самый надёжный сигнал,
//    сохраняется навсегда, пока пользователь не поменяет вручную;
// 2) язык самого Telegram-клиента пользователя (initDataUnsafe.user.
//    language_code) — доступно только внутри Telegram Mini App;
// 3) язык устройства/браузера (navigator.language) — работает и вне
//    Telegram, например если приложение когда-нибудь будет открываться
//    как обычный сайт/PWA (App Store обёртка);
// 4) если ничего не удалось определить — английский, а не русский:
//    раньше тут был жёстко "ru" для абсолютно всех новых пользователей
//    в любой стране, что было ошибкой для международной аудитории —
//    для реальных RU-пользователей это ничего не меняет, потому что их
//    Telegram-клиент и так репортит language_code "ru".
function detectMarketFromCode(code: string | undefined | null): Market | null {
  if (!code) return null;
  const normalized = code.toLowerCase();
  if (normalized.startsWith("ru")) return "ru";
  if (normalized.startsWith("fi")) return "fi";
  if (normalized.startsWith("en")) return "en";
  return null;
}

export function getMarket(): Market {
  if (typeof window !== "undefined") {
    // ?lang=en в URL — явный оверрайд (используется, например, для
    // ссылок поддержки на конкретном языке или для снятия скриншотов
    // App Store на разных языках без смены системных настроек).
    // Сохраняем в localStorage, чтобы выбор держался и после перехода
    // на другой экран/перезагрузки.
    const fromQuery = new URLSearchParams(window.location.search).get(
      "lang"
    );
    if (fromQuery === "ru" || fromQuery === "en" || fromQuery === "fi") {
      window.localStorage.setItem("couple-quizzes-lang", fromQuery);
      return fromQuery;
    }

    const saved = window.localStorage.getItem("couple-quizzes-lang");
    if (saved === "ru" || saved === "en" || saved === "fi") {
      return saved;
    }

    const telegramCode = window.Telegram?.WebApp?.initDataUnsafe?.user
      ?.language_code as string | undefined;
    const fromTelegram = detectMarketFromCode(telegramCode);
    if (fromTelegram) return fromTelegram;

    const fromNavigator = detectMarketFromCode(
      typeof navigator !== "undefined" ? navigator.language : undefined
    );
    if (fromNavigator) return fromNavigator;
  }

  return "en";
}
