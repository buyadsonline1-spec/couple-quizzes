-- Daily Bonus — переносим "какой сейчас день серии" на сервер.
-- Согласовано с ChatGPT: раньше appState.dailyBonus.streakDay/lastClaimDate
-- жили ТОЛЬКО в localStorage — сервер не знал реальную серию пользователя,
-- поэтому award_activity_points("daily-bonus:<date>", delta) мог принять
-- любую сумму (до 500) каждый день, независимо от настоящего прогресса.
--
-- После этой миграции frontend-поля dailyBonus.streakDay/lastClaimDate
-- становятся только кэшем для UI, а не источником истины.

alter table public.profiles
  add column if not exists daily_bonus_streak_day integer not null default 0,
  add column if not exists daily_bonus_last_claim_date date;

create or replace function public.claim_daily_bonus(
  p_telegram_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rewards constant integer[] := array[25, 50, 75, 100, 150, 200, 300, 400, 500];

  v_today date;
  v_profile record;
  v_next_day integer;
  v_reward integer;
  v_week_key text;
  v_next_solo_points integer;
  v_next_solo_weekly integer;
begin
  v_today := (now() at time zone 'Europe/Helsinki')::date;

  select
    telegram_id,
    solo_points,
    solo_weekly_points,
    solo_weekly_points_week,
    coalesce(daily_bonus_streak_day, 0) as daily_bonus_streak_day,
    daily_bonus_last_claim_date
  into v_profile
  from public.profiles
  where telegram_id = p_telegram_id
  for update;

  if not found then
    return jsonb_build_object('awarded', false, 'reason', 'profile-not-found');
  end if;

  if v_profile.daily_bonus_last_claim_date = v_today then
    return jsonb_build_object(
      'awarded', false,
      'reason', 'already-claimed',
      'streakDay', v_profile.daily_bonus_streak_day,
      'soloPoints', coalesce(v_profile.solo_points, 0)
    );
  end if;

  -- Та же логика, что раньше была в клиентском getNextStreakDay():
  -- lastClaimDate = null -> день 1
  -- lastClaimDate = вчера -> +1 (цикл 9 -> 1)
  -- иначе (пропущенный день) -> сброс на 1
  if v_profile.daily_bonus_last_claim_date is null then
    v_next_day := 1;
  elsif v_profile.daily_bonus_last_claim_date = v_today - 1 then
    v_next_day :=
      case
        when v_profile.daily_bonus_streak_day >= 9 then 1
        else v_profile.daily_bonus_streak_day + 1
      end;
  else
    v_next_day := 1;
  end if;

  v_reward := v_rewards[least(greatest(v_next_day, 1), 9)];
  v_week_key := public.cq_week_key(v_today);

  v_next_solo_points := coalesce(v_profile.solo_points, 0) + v_reward;
  v_next_solo_weekly :=
    case
      when v_profile.solo_weekly_points_week = v_week_key
        then coalesce(v_profile.solo_weekly_points, 0) + v_reward
      else v_reward
    end;

  update public.profiles
  set
    solo_points = v_next_solo_points,
    solo_weekly_points = v_next_solo_weekly,
    solo_weekly_points_week = v_week_key,
    daily_bonus_streak_day = v_next_day,
    daily_bonus_last_claim_date = v_today
  where telegram_id = p_telegram_id;

  -- Доп. запись для аудита/идемпотентности — тот же механизм, что уже
  -- используется в award_activity_points (UNIQUE(telegram_id, reward_key)
  -- не даст задвоить, даже если RPC вызовут дважды почти одновременно).
  insert into public.activity_point_claims (
    telegram_id, pair_id, reward_key, delta, week_key
  ) values (
    p_telegram_id, null, 'daily-bonus:' || v_today::text, v_reward, v_week_key
  )
  on conflict (telegram_id, reward_key) do nothing;

  return jsonb_build_object(
    'awarded', true,
    'reward', v_reward,
    'streakDay', v_next_day,
    'soloPoints', v_next_solo_points,
    'soloWeeklyPoints', v_next_solo_weekly
  );
end;
$$;

revoke all on function public.claim_daily_bonus(bigint) from public, anon, authenticated;
grant execute on function public.claim_daily_bonus(bigint) to service_role;
