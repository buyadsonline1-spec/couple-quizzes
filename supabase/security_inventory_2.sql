-- READ-ONLY, продолжение инвентаризации. Тоже ничего не меняет.

-- 4) Сами RLS-политики (почему anon мог читать/писать pairs/profiles,
--    несмотря на rowsecurity=true) — это самое важное.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 5) Права anon/authenticated на таблицы, которые не поместились
--    в предыдущий экспорт (обрезался на 100 строках)
select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and table_name in (
    'profiles',
    'referrals',
    'subscriptions',
    'weekly_pair_leaderboard',
    'weekly_user_leaderboard',
    'wheel_reward_categories',
    'wheel_reward_items',
    'wheel_spins'
  )
order by table_name, grantee, privilege_type;
