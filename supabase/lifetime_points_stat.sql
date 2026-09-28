-- "Статистика: очки за всё время" — отдельная метрика от solo_points,
-- который является ТЕКУЩИМ балансом (может уменьшаться — например,
-- вещи для питомца покупаются за очки, см. /api/pet/buy). Раньше
-- карточка "Статистика" в Профиле показывала под "Всего очков" именно
-- solo_points, что не отвечает на вопрос "сколько я вообще заработал",
-- если хоть что-то уже потрачено.
--
-- Подход: новая колонка solo_points_lifetime, которую ведёт ТРИГГЕР на
-- profiles — при любом UPDATE, где solo_points вырос, прибавляем ровно
-- дельту роста. Это работает для ЛЮБОГО источника начисления очков
-- (activity/award, daily bonus, referral claim, heart clicker,
-- spin reward, weekly top reward и т.д.) без необходимости трогать
-- каждую из этих RPC по отдельности — все они просто обновляют
-- solo_points, а триггер уже сам считает дельту.
--
-- Бэкафилл: для уже существующих пользователей стартовое значение —
-- их текущий solo_points (единственное, что мы реально знаем "задним
-- числом" — история уже потраченных очков нигде не логировалась).
-- Это занижает лайфтайм-очки тем, кто что-то уже потратил, но это
-- лучшее доступное приближение без полного лога транзакций.
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

alter table public.profiles
  add column if not exists solo_points_lifetime bigint not null default 0;

update public.profiles
   set solo_points_lifetime = coalesce(solo_points, 0)
 where solo_points_lifetime = 0;

create or replace function public.track_solo_points_lifetime()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.solo_points > coalesce(old.solo_points, 0) then
    new.solo_points_lifetime :=
      coalesce(old.solo_points_lifetime, 0) + (new.solo_points - coalesce(old.solo_points, 0));
  end if;
  return new;
end;
$$;

drop trigger if exists track_solo_points_lifetime_trigger on public.profiles;

create trigger track_solo_points_lifetime_trigger
before update of solo_points on public.profiles
for each row
execute function public.track_solo_points_lifetime();

-- ============================================================
-- bootstrap_profile / bootstrap_profile_from_auth — донабиваем ответ
-- полем soloPointsLifetime (тела функций без изменений, см. последнюю
-- версию в fix_display_name_persistence.sql), чтобы /api/bootstrap
-- мог отдать его клиенту сразу при старте.
-- ============================================================

create or replace function public.bootstrap_profile(
  p_telegram_id bigint,
  p_first_name text,
  p_last_name text,
  p_username text,
  p_photo_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if p_telegram_id is null or p_telegram_id <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-telegram-id');
  end if;

  insert into public.profiles (
    telegram_id, first_name, last_name, username, photo_url
  ) values (
    p_telegram_id, p_first_name, p_last_name, p_username, p_photo_url
  )
  on conflict (telegram_id) do update
    set first_name = case
          when public.profiles.display_name_custom then public.profiles.first_name
          else excluded.first_name
        end,
        last_name = case
          when public.profiles.display_name_custom then public.profiles.last_name
          else excluded.last_name
        end,
        username = excluded.username,
        photo_url = excluded.photo_url
  returning * into v_profile;

  return jsonb_build_object(
    'ok', true,
    'telegramId', v_profile.telegram_id,
    'pairId', v_profile.pair_id,
    'soloPoints', coalesce(v_profile.solo_points, 0),
    'soloPointsLifetime', coalesce(v_profile.solo_points_lifetime, 0),
    'soloWeeklyPoints', coalesce(v_profile.solo_weekly_points, 0),
    'soloWeeklyPointsWeek', v_profile.solo_weekly_points_week,
    'firstName', v_profile.first_name,
    'lastName', v_profile.last_name,
    'displayNameCustom', v_profile.display_name_custom
  );
end;
$$;

create or replace function public.bootstrap_profile_from_auth(
  p_auth_user_id uuid,
  p_display_name text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_synthetic_id bigint;
begin
  if p_auth_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid-auth-user-id');
  end if;

  select * into v_profile
    from public.profiles
    where auth_user_id = p_auth_user_id;

  if found then
    return jsonb_build_object(
      'ok', true,
      'telegramId', v_profile.telegram_id,
      'pairId', v_profile.pair_id,
      'soloPoints', coalesce(v_profile.solo_points, 0),
      'soloPointsLifetime', coalesce(v_profile.solo_points_lifetime, 0),
      'soloWeeklyPoints', coalesce(v_profile.solo_weekly_points, 0),
      'soloWeeklyPointsWeek', v_profile.solo_weekly_points_week,
      'firstName', v_profile.first_name,
      'lastName', v_profile.last_name,
      'displayNameCustom', v_profile.display_name_custom
    );
  end if;

  v_synthetic_id := -(nextval('public.ios_synthetic_telegram_id_seq'));

  insert into public.profiles (
    telegram_id, auth_user_id, first_name, username
  ) values (
    v_synthetic_id,
    p_auth_user_id,
    coalesce(nullif(trim(p_display_name), ''), split_part(coalesce(p_email, ''), '@', 1), 'Player'),
    null
  )
  returning * into v_profile;

  return jsonb_build_object(
    'ok', true,
    'telegramId', v_profile.telegram_id,
    'pairId', v_profile.pair_id,
    'soloPoints', coalesce(v_profile.solo_points, 0),
    'soloPointsLifetime', coalesce(v_profile.solo_points_lifetime, 0),
    'soloWeeklyPoints', coalesce(v_profile.solo_weekly_points, 0),
    'soloWeeklyPointsWeek', v_profile.solo_weekly_points_week,
    'firstName', v_profile.first_name,
    'lastName', v_profile.last_name,
    'displayNameCustom', v_profile.display_name_custom
  );
end;
$$;
