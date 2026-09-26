-- Кликер с сердечком — заменяет "Я никогда не..." в списке игр
-- (Premium-only, см. app/api/games/heart-clicker/play). Раунд: игрок
-- тапает сердце P_TAPS раз за отведённое на клиенте время, сервер сам
-- клэмпит присланное количество тапов и сам считает очки — клиенту
-- никогда не доверяем ни количество тапов как есть (можно прислать
-- миллион), ни тем более готовую сумму очков.
--
-- heart_clicker_rounds — история раундов, только для подсчёта дневного
-- лимита (3/день, как у колеса) — служебная, сервис-роль only.
-- heart_clicker_leaderboard — публичный "внутренний лидерборд" по
-- накопленным очкам кликера, тот же паттерн денормализации display_name/
-- username/photo_url, что и у weekly_user_leaderboard (см.
-- weekly_leaderboard_lockdown.sql) — читается клиентом напрямую по
-- анонимному/authenticated ключу, ПИШЕТСЯ только изнутри
-- play_heart_clicker_round (service_role), никогда напрямую с клиента —
-- та же дыра с "клиент сам себе пишет очки" уже была найдена и закрыта
-- для weekly-лидербордов, не повторяем её здесь.
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

create table if not exists public.heart_clicker_rounds (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null,
  taps integer not null,
  points_awarded integer not null,
  round_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists heart_clicker_rounds_telegram_date_idx
  on public.heart_clicker_rounds (telegram_id, round_date);

revoke all on public.heart_clicker_rounds from public, anon, authenticated;
grant select, insert on public.heart_clicker_rounds to service_role;

create table if not exists public.heart_clicker_leaderboard (
  telegram_id bigint primary key,
  display_name text not null,
  username text,
  photo_url text,
  total_points integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.heart_clicker_leaderboard enable row level security;

drop policy if exists heart_clicker_leaderboard_select on public.heart_clicker_leaderboard;
create policy heart_clicker_leaderboard_select
  on public.heart_clicker_leaderboard
  for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on public.heart_clicker_leaderboard from public, anon, authenticated;
grant select on public.heart_clicker_leaderboard to anon, authenticated;
grant all on public.heart_clicker_leaderboard to service_role;

create or replace function public.play_heart_clicker_round(
  p_telegram_id bigint,
  p_taps integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_taps constant integer := 50;
  v_points_per_tap constant integer := 2;
  v_daily_limit constant integer := 3;
  v_today date;
  v_profile record;
  v_rounds_today integer;
  v_clamped_taps integer;
  v_points integer;
  v_next_points integer;
  v_display_name text;
  v_total_points integer;
begin
  v_today := (now() at time zone 'Europe/Helsinki')::date;

  select telegram_id, coalesce(solo_points, 0) as solo_points,
         first_name, last_name, username, photo_url
    into v_profile
    from public.profiles
    where telegram_id = p_telegram_id
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'profile-not-found');
  end if;

  select count(*) into v_rounds_today
    from public.heart_clicker_rounds
    where telegram_id = p_telegram_id and round_date = v_today;

  if v_rounds_today >= v_daily_limit then
    return jsonb_build_object(
      'ok', false,
      'reason', 'daily-limit-reached',
      'roundsUsedToday', v_rounds_today,
      'roundsRemainingToday', 0
    );
  end if;

  v_clamped_taps := greatest(0, least(coalesce(p_taps, 0), v_max_taps));
  v_points := v_clamped_taps * v_points_per_tap;
  v_next_points := v_profile.solo_points + v_points;

  update public.profiles
     set solo_points = v_next_points
   where telegram_id = p_telegram_id;

  insert into public.heart_clicker_rounds (telegram_id, taps, points_awarded, round_date)
  values (p_telegram_id, v_clamped_taps, v_points, v_today);

  -- Тот же вывод display_name, что и в weekly_leaderboard_lockdown.sql:
  -- имя+фамилия -> @username -> "Игрок <id>".
  v_display_name := coalesce(
    nullif(trim(concat_ws(' ', v_profile.first_name, v_profile.last_name)), ''),
    case when v_profile.username is not null then '@' || v_profile.username else null end,
    'Игрок ' || p_telegram_id::text
  );

  insert into public.heart_clicker_leaderboard (
    telegram_id, display_name, username, photo_url, total_points, updated_at
  )
  values (
    p_telegram_id, v_display_name, v_profile.username, v_profile.photo_url, v_points, now()
  )
  on conflict (telegram_id) do update
    set display_name = excluded.display_name,
        username = excluded.username,
        photo_url = excluded.photo_url,
        total_points = public.heart_clicker_leaderboard.total_points + excluded.total_points,
        updated_at = now()
  returning total_points into v_total_points;

  return jsonb_build_object(
    'ok', true,
    'taps', v_clamped_taps,
    'pointsAwarded', v_points,
    'soloPoints', v_next_points,
    'totalClickerPoints', v_total_points,
    'roundsUsedToday', v_rounds_today + 1,
    'roundsRemainingToday', v_daily_limit - (v_rounds_today + 1)
  );
end;
$$;

revoke all on function public.play_heart_clicker_round(bigint, integer)
  from public, anon, authenticated;
grant execute on function public.play_heart_clicker_round(bigint, integer)
  to service_role;
