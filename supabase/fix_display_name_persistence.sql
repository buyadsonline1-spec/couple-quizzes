-- Баг, найденный при проверке "сохраняется ли изменённый ник":
--
-- 1) bootstrap_profile (вызывается при КАЖДОМ открытии приложения,
--    см. /api/bootstrap) безусловно перезаписывает profiles.first_name
--    значением из Telegram initData. Значит любой ник, сохранённый
--    через update_display_name, откатывается на исходное имя из
--    Telegram при следующем же запуске приложения — то есть ник
--    фактически никогда не сохраняется дольше одной сессии.
--
-- 2) weekly_user_leaderboard.display_name синхронизируется триггером,
--    который срабатывает только на UPDATE OF solo_weekly_points /
--    solo_weekly_points_week — то есть на смену first_name НЕ
--    реагирует. Новый ник не попадёт в "Топ игроков" (соло), пока
--    пользователю не начислят очки заново.
--
-- 3) То же самое для парного топа: weekly_pair_leaderboard.pair_title
--    синхронизируется триггером НА ТАБЛИЦЕ pairs (по weekly_points/
--    weekly_points_week), который читает profiles.first_name в
--    момент срабатывания — но смена ника в profiles сама по себе
--    ничего на pairs не триггерит.
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

-- ============================================================
-- 0. Метка "ник задан пользователем вручную" — без неё нет способа
--    отличить "имя ещё ни разу не меняли" от "юзер намеренно
--    переименовался", а значит bootstrap_profile не может решить,
--    можно ли синкать имя из Telegram или нет.
-- ============================================================

alter table public.profiles
  add column if not exists display_name_custom boolean not null default false;

-- ============================================================
-- 1. update_display_name — помечает имя как заданное вручную и
--    очищает last_name (ник — единая замена отображаемого имени,
--    иначе после переименования кое-где будет видно
--    "НовыйНик Фамилия" пополам с Telegram-фамилией).
-- ============================================================

create or replace function public.update_display_name(
  p_telegram_id bigint,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trimmed text;
begin
  v_trimmed := trim(coalesce(p_display_name, ''));

  if length(v_trimmed) = 0 or length(v_trimmed) > 60 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-name');
  end if;

  update public.profiles
     set first_name = v_trimmed,
         last_name = null,
         display_name_custom = true
   where telegram_id = p_telegram_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'profile-not-found');
  end if;

  return jsonb_build_object('ok', true, 'displayName', v_trimmed);
end;
$$;

-- ============================================================
-- 2. bootstrap_profile — больше не трогает first_name/last_name,
--    если пользователь уже задал ник вручную. username/photo_url
--    по-прежнему всегда синкаются из Telegram — их пользователь
--    нигде в приложении не редактирует.
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
    'soloWeeklyPoints', coalesce(v_profile.solo_weekly_points, 0),
    'soloWeeklyPointsWeek', v_profile.solo_weekly_points_week,
    -- Отдаём имя обратно клиенту: если ник задан вручную, клиент
    -- должен показывать ЕГО везде вместо живого имени из Telegram
    -- initData (иначе кастомный ник виден только на бэкенде и в
    -- профилях, которые смотрят на человека другие пользователи —
    -- сам себя в приложении он продолжит видеть под старым именем).
    'firstName', v_profile.first_name,
    'lastName', v_profile.last_name,
    'displayNameCustom', v_profile.display_name_custom
  );
end;
$$;

-- ============================================================
-- 3. Соло-лидерборд — триггер теперь реагирует и на смену
--    имени/юзернейма/фото, не только на очки.
-- ============================================================

drop trigger if exists sync_user_weekly_leaderboard_trigger on public.profiles;

create trigger sync_user_weekly_leaderboard_trigger
after insert or update of
  solo_weekly_points, solo_weekly_points_week,
  first_name, last_name, username, photo_url
on public.profiles
for each row
execute function public.sync_user_weekly_leaderboard();

-- ============================================================
-- 4. Парный лидерборд — sync_pair_weekly_leaderboard() висит на
--    pairs, а не на profiles, поэтому смена ника его не будит.
--    Заводим отдельный триггер на profiles, который при смене
--    имени/юзернейма делает no-op UPDATE на pairs.weekly_points —
--    этого достаточно, чтобы существующий триггер на pairs
--    перечитал имена и пересобрал pair_title, без дублирования
--    его логики.
-- ============================================================

create or replace function public.touch_pair_on_profile_name_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pair_id is not null then
    update public.pairs
       set weekly_points = weekly_points
     where id = new.pair_id
       and weekly_points_week is not null;
  end if;

  return new;
end;
$$;

drop trigger if exists touch_pair_on_profile_name_change_trigger on public.profiles;

create trigger touch_pair_on_profile_name_change_trigger
after update of first_name, last_name, username, photo_url
on public.profiles
for each row
execute function public.touch_pair_on_profile_name_change();

-- ============================================================
-- 5. bootstrap_profile_from_auth (standalone iOS-путь) сам по себе
--    не имеет бага перезаписи — он идемпотентен и трогает first_name
--    только при создании профиля. Но он не возвращал имя обратно
--    клиенту, поэтому донабиваем ответ теми же полями, что и
--    bootstrap_profile выше — иначе клиентская синхронизация
--    "показывать сохранённый ник вместо живого Telegram/Apple имени"
--    (следующий шаг, в app/page.tsx) на iOS просто не сработает.
-- ============================================================

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
    'soloWeeklyPoints', coalesce(v_profile.solo_weekly_points, 0),
    'soloWeeklyPointsWeek', v_profile.solo_weekly_points_week,
    'firstName', v_profile.first_name,
    'lastName', v_profile.last_name,
    'displayNameCustom', v_profile.display_name_custom
  );
end;
$$;

-- ============================================================
-- 6. Бэкафилл: у всех, кто когда-либо уже фигурировал в лидербордах,
--    перечитываем актуальное имя из profiles прямо сейчас (no-op
--    апдейт, просто перетриггеривает синк) — иначе фикс подействует
--    только на будущие изменения, а уже расхлебавшиеся расхождения
--    (если они есть) останутся висеть до следующего начисления очков.
-- ============================================================

update public.profiles
   set solo_weekly_points_week = solo_weekly_points_week
 where solo_weekly_points_week is not null;

update public.pairs
   set weekly_points_week = weekly_points_week
 where weekly_points_week is not null;
