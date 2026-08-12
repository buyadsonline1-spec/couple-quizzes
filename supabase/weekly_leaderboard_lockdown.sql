-- SECURITY FIX (найдено и подтверждено живым тестом во время security-pass):
-- weekly_pair_leaderboard и weekly_user_leaderboard были напрямую
-- insert/upsert-able с anon-ключом (тем самым публичным ключом, что
-- лежит в клиентском бандле). Любой человек с devtools мог отправить
-- произвольный total_points для произвольного pair_id/telegram_id и:
--   1) нарисовать себе фальшивое #1 место в лидерборде;
--   2) на следующей неделе реально забрать награду за топ-3 через
--      /api/rewards/claim-weekly-top — claim_weekly_pair_top_reward
--      считает место ИМЕННО по weekly_pair_leaderboard, то есть доверяет
--      этой таблице как источнику истины.
-- Живой тест (вставка/чтение/удаление тестовой строки с anon-ключом,
-- сразу подчищено) подтвердил: INSERT прошёл (status 201) для обеих
-- таблиц.
--
-- Корневая причина такая же, как и во всех прошлых security-hardening
-- проходах в этой репе: клиент писал очки напрямую в Supabase вместо
-- того, чтобы вызывать server-validated RPC.
--
-- Хорошая новость: для ПАРНОГО лидерборда уже существует правильный
-- механизм — триггер sync_pair_weekly_leaderboard() на public.pairs
-- (см. fix_sync_pair_weekly_leaderboard_type_mismatch.sql), который
-- САМ пишет в weekly_pair_leaderboard при каждом обновлении
-- pairs.weekly_points через любую легитимную server-side RPC
-- (award_activity_points, submit_daily_pair_answer, claim_daily_bonus
-- и т.д.). Клиентский upsert был чистой дырой без единой пользы —
-- убираем прямой доступ, оставляем триггер как единственный источник.
--
-- Для СОЛО-лидерборда такого триггера не было вообще — заводим его
-- по образу и подобию, на profiles.solo_weekly_points/
-- solo_weekly_points_week.
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

-- ============================================================
-- 1. Закрываем прямую запись анону/authenticated. SELECT оставляем —
--    лидерборд по продукту публичный, читать его должен любой клиент.
-- ============================================================

revoke insert, update, delete on public.weekly_pair_leaderboard
  from anon, authenticated;
revoke insert, update, delete on public.weekly_user_leaderboard
  from anon, authenticated;

-- ============================================================
-- 2. Новый триггер для СОЛО-лидерборда — зеркало
--    sync_pair_weekly_leaderboard(), но на profiles.
-- ============================================================

create or replace function public.sync_user_weekly_leaderboard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_name text;
begin

  if new.solo_weekly_points_week is null then
    return new;
  end if;

  v_name :=
    coalesce(
      nullif(
        trim(
          concat_ws(
            ' ',
            new.first_name,
            new.last_name
          )
        ),
        ''
      ),
      case
        when new.username is not null
          then '@' || new.username
        else null
      end,
      'Игрок ' || new.telegram_id::text
    );

  insert into public.weekly_user_leaderboard (
    week_key,
    telegram_id,
    display_name,
    username,
    photo_url,
    total_points,
    updated_at
  )
  values (
    new.solo_weekly_points_week,
    new.telegram_id,
    v_name,
    new.username,
    new.photo_url,
    coalesce(new.solo_weekly_points, 0),
    now()
  )

  on conflict (week_key, telegram_id)

  do update set
    display_name = excluded.display_name,
    username = excluded.username,
    photo_url = excluded.photo_url,
    total_points = excluded.total_points,
    updated_at = now();

  return new;
end;
$function$;

drop trigger if exists sync_user_weekly_leaderboard_trigger on public.profiles;

create trigger sync_user_weekly_leaderboard_trigger
after insert or update of solo_weekly_points, solo_weekly_points_week
on public.profiles
for each row
execute function public.sync_user_weekly_leaderboard();

-- ============================================================
-- 3. Бэкафилл: подтягиваем текущие значения для уже существующих
--    профилей/пар, у которых solo_weekly_points_week/weekly_points_week
--    уже заполнены, но соответствующей строки в лидерборде могло не
--    быть (например, если раньше туда писал только клиент и мог что-то
--    пропустить). no-op апдейт, который просто заново триггерит sync.
-- ============================================================

update public.profiles
   set solo_weekly_points_week = solo_weekly_points_week
 where solo_weekly_points_week is not null;

update public.pairs
   set weekly_points_week = weekly_points_week
 where weekly_points_week is not null;
