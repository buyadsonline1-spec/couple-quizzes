-- READ-ONLY: ничего не меняет, только показывает текущее состояние.
-- Выполнить все три блока по очереди в Supabase SQL Editor и прислать результат.

-- 1) Табличные права anon/authenticated
select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

-- 2) Права на вызов функций (RPC) для anon/authenticated/PUBLIC
select
  routine_schema,
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by routine_name, grantee;

-- 3) На каких таблицах вообще включён RLS
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
