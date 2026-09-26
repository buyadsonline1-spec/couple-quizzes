-- Вещи для питомца за Stars теперь продаются и через Apple IAP (см.
-- app/api/payments/apple-iap-verify-pet-item) — один и тот же товар
-- com.couplequizzes.app.pet_item в App Store Connect на ВСЕ такие
-- вещи, itemId выбирает сам клиент, а сервер только проверяет его по
-- общему списку (lib/server/pet-items.ts) и выдаёт через
-- grant_pair_pet_item.
--
-- В отличие от Premium-подписки (там verify просто пере-upsert'ит то
-- же состояние — безопасно проверять один и тот же JWS сколько
-- угодно раз), выдача вещи питомцу — одноразовое потребляемое
-- действие. Без этой таблицы один и тот же оплаченный signedTransaction
-- можно было бы прислать повторно с ДРУГИМ itemId и бесплатно
-- получить все 10 вещей за одну реальную покупку. Таблица —
-- простой "уже обработан?" леджер: первая вставка с данным
-- transaction_id проходит и разрешает выдачу, повторная — падает на
-- unique constraint, и API отвечает "уже использовано", ничего не
-- выдавая второй раз.
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

create table if not exists public.apple_iap_pet_item_transactions (
  transaction_id text primary key,
  telegram_id bigint not null,
  item_id text not null,
  created_at timestamptz not null default now()
);

revoke all on table public.apple_iap_pet_item_transactions from public, anon, authenticated;
grant select, insert on table public.apple_iap_pet_item_transactions to service_role;
