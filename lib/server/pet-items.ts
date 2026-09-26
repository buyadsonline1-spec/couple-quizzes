// Единый список вещей для питомца, продающихся только за реальные
// деньги (не за очки) — общий источник истины для Telegram-инвойса
// (app/api/payments/create-stars-invoice) и Apple IAP (app/api/
// payments/apple-iap-verify-pet-item), чтобы наборы валидных item_id
// не расходились между платформами. amount — цена в Telegram Stars,
// для Apple не используется (там фиксированная цена самого IAP-товара
// в App Store Connect, см. lib/applePurchase.ts).
// Список id должен совпадать с grant_pair_pet_item
// (supabase/pair_pets_unlocks.sql/pair_pets_jackets.sql/
// pair_pets_nine_items.sql) — иначе оплата пройдёт, а выдать вещь
// будет нечего.
export const PET_ITEM_STARS: Record<string, { title: string; amount: number }> = {
  hat_crown: { title: "Корона для питомца", amount: 40 },
  hat_unicorn: { title: "Рог единорога для питомца", amount: 35 },
  hat_astro: { title: "Шлем космонавта для питомца", amount: 45 },
  acc_medal: { title: "Медаль для питомца", amount: 35 },
  acc_monocle: { title: "Монокль для питомца", amount: 30 },
  acc_bling: { title: "Золотая цепь для питомца", amount: 40 },
  jacket_puffer: { title: "Пуховик для питомца", amount: 45 },
  jacket_tux: { title: "Смокинг для питомца", amount: 55 },
  jacket_superhero: { title: "Плащ супергероя для питомца", amount: 50 },
  room_space: { title: "Комната «Космос» для питомца", amount: 60 },
};
