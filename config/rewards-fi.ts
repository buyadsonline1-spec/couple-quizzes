// Финский призовой каталог для колеса — id категорий/призов совпадают
// с market='fi' в wheel_reward_categories/wheel_reward_items
// (supabase/wheel_reward_wheel_fi.sql). Этот файл рисует визуальные
// сегменты колеса; реальный выбор приза решает сервер (RPC
// spin_reward_wheel) — см. комментарий у REWARD_CATEGORIES в app/page.tsx.
export const REWARD_CATEGORIES_FI = [
  {
    id: "normal",
    title: "Normal",
    emoji: "🏷️",
    weight: 1,
    items: [
      { id: "normal-5", title: "Normal-lahjakortti 5€", weight: 389 },
      { id: "normal-10", title: "Normal-lahjakortti 10€", weight: 100 },
      { id: "normal-20", title: "Normal-lahjakortti 20€", weight: 10 },
      { id: "normal-50", title: "Normal-lahjakortti 50€", weight: 1 },
    ],
  },
  {
    id: "finnkino",
    title: "Finnkino",
    emoji: "🎬",
    weight: 1,
    items: [
      { id: "finnkino-10", title: "Finnkino-lahjakortti 10€", weight: 484 },
      { id: "finnkino-20", title: "Finnkino-lahjakortti 20€", weight: 15 },
      { id: "finnkino-50", title: "Finnkino-lahjakortti 50€", weight: 1 },
    ],
  },
  {
    id: "s-market",
    title: "S-market",
    emoji: "🛒",
    weight: 1,
    items: [
      { id: "s-market-10", title: "S-ryhmän lahjakortti 10€", weight: 484 },
      { id: "s-market-20", title: "S-ryhmän lahjakortti 20€", weight: 15 },
      { id: "s-market-50", title: "S-ryhmän lahjakortti 50€", weight: 1 },
    ],
  },
  {
    id: "kicks",
    title: "Kicks",
    emoji: "💄",
    weight: 1,
    items: [
      { id: "kicks-10", title: "Kicks-lahjakortti 10€", weight: 284 },
      { id: "kicks-20", title: "Kicks-lahjakortti 20€", weight: 15 },
      { id: "kicks-50", title: "Kicks-lahjakortti 50€", weight: 1 },
    ],
  },
  {
    id: "hesburger",
    title: "Hesburger",
    emoji: "🍔",
    weight: 1,
    items: [
      { id: "hesburger-10", title: "Hesburger-lahjakortti 10€", weight: 95 },
      { id: "hesburger-20", title: "Hesburger-lahjakortti 20€", weight: 5 },
    ],
  },
];
