-- Apple IAP support (roadmap item after Phase 2 iOS auth). Добавляет
-- колонку для хранения originalTransactionId от Apple — нужна, чтобы
-- при желании можно было сверить/найти подписку по конкретной
-- транзакции (например, при обращении в поддержку или споре о
-- возврате), тот же смысл, что уже есть у provider для Tribute.
-- checkIsPremium() и upsert-логика в app/api/payments/
-- apple-iap-verify/route.ts эту колонку не требуют строго — просто
-- дополнительный трекинг, ничего не ломает для существующих строк
-- (Stars/Tribute), они останутся с provider_transaction_id = null.

alter table public.subscriptions
  add column if not exists provider_transaction_id text null;

comment on column public.subscriptions.provider_transaction_id is
  'originalTransactionId (Apple) / внешний ID транзакции у провайдера оплаты — для трекинга/поддержки, не используется в бизнес-логике.';
