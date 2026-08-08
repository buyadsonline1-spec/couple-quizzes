-- Subscriptions (Premium-статус) — экстренная блокировка прямой записи.
-- Согласовано с ChatGPT: сейчас anon-ключ может PATCH-запросом выставить
-- себе Premium бесплатно, в обход оплаты (Stars/Tribute).
--
-- Проверено по коду (app/page.tsx): клиент читает subscriptions только
-- через loadPremiumStatus (SELECT). Реальная запись уже и так идёт
-- server-side через app/api/check-free-premium/route.ts (supabaseAdmin,
-- service_role). Значит закрыть WRITE можно без риска что-то сломать.
--
-- ВАЖНО: TRUNCATE не регулируется RLS вообще (это отдельная табличная
-- привилегия) — поэтому убираем опасные права явно, а не полагаемся
-- только на policy.

alter table public.subscriptions enable row level security;

revoke insert, update, delete, truncate
  on public.subscriptions
  from anon, authenticated;

grant select on public.subscriptions to anon, authenticated;

-- Временная policy: чтение остаётся открытым (loadPremiumStatus всё ещё
-- читает напрямую с клиента). Когда его перенесут в защищённый API
-- (/api/bootstrap или аналог), эту policy и сам grant select можно
-- будет убрать вообще.
drop policy if exists "subscriptions_client_select" on public.subscriptions;
create policy "subscriptions_client_select"
  on public.subscriptions
  for select
  to anon, authenticated
  using (true);
