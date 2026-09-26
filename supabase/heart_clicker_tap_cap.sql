-- Жалоба: "в лидерборд вписывается +100 автоматически за каждый
-- раунд". Сама логика (см. heart_clicker_game.sql) и так считает
-- РЕАЛЬНЫЕ очки раунда (clamped_taps * 2) и прибавляет именно их к
-- накопленной сумме — не хардкод. Но потолок был v_max_taps = 50
-- (~3.3 тапа/сек за 15 секунд) — это легко выбивает почти любой
-- игрок, поэтому очки почти всегда упирались в максимум (100) и
-- выглядели как фиксированное число, а не как реальный результат.
-- Подняли потолок до 90 тапов (~6/сек) — достать его теперь требует
-- настоящей скорости, у обычных игроков результат будет заметно
-- различаться раунд от раунда и между игроками. Максимум за раунд
-- стал 180 очков (было 100), 3 раунда/день — до 540 (было 300).
--
-- Копия play_heart_clicker_round из heart_clicker_game.sql один-в-один,
-- с единственным изменением — v_max_taps.
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

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
  v_max_taps constant integer := 90;
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
