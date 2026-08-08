-- Weekly Pair Top Reward — atomic, server-computed claim.
-- Согласовано с ChatGPT (чат "Couple Quizzes") и Claude: сервер сам
-- считает неделю (в том же наивном формате, что и клиентский
-- getCurrentWeekKey()/getPreviousWeekKey() в app/page.tsx: dayOfYear/7,
-- без ведущего нуля, напр. "2026-W31") и сам знает размер награды (500).
-- Клиент не передаёт ни week key, ни reward — иначе их можно подделать.
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

/*
 * ============================================================
 * Couple Quizzes — текущий production week format
 *
 * ВАЖНО:
 * Это НЕ ISO week.
 *
 * Формат полностью повторяет текущий JS:
 *
 *   dayOfYear = floor((date - Jan 1) / 1 day) + 1
 *   week      = ceil(dayOfYear / 7)
 *
 * result: 2026-W1, 2026-W5, 2026-W31 (без ведущего нуля).
 * ============================================================
 */

create or replace function public.cq_week_key(
  p_date date
)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select
    extract(year from p_date)::integer::text
    || '-W'
    ||
    ceil(
      (
        (
          p_date
          -
          make_date(
            extract(year from p_date)::integer,
            1,
            1
          )
        ) + 1
      )::numeric / 7
    )::integer::text;
$$;

-- Sanity-check (можно выполнить отдельно после накатки):
--   select public.cq_week_key(date '2026-01-01');
--   select public.cq_week_key(date '2026-02-01');
--   select public.cq_week_key(date '2026-08-07');

/*
 * ============================================================
 * Храним неделю последнего weekly top claim.
 * ============================================================
 */

alter table public.pairs
  add column if not exists weekly_top_reward_claimed_week text;

/*
 * ============================================================
 * WEEKLY PAIR TOP REWARD
 *
 * TOP-3 прошлой недели:
 *   +500 lifetime PAIR
 *   +500 current-week PAIR
 *
 * SOLO не затрагивается.
 *
 * Клиент НЕ передаёт: reward, current week, previous week.
 * Всё определяется сервером.
 * ============================================================
 */

create or replace function public.claim_weekly_pair_top_reward(
  p_pair_id uuid,
  p_telegram_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward constant integer := 500;

  v_today date;

  v_current_week_key text;
  v_previous_week_key text;

  v_partner_1_telegram_id bigint;
  v_partner_2_telegram_id bigint;

  v_claimed_week text;

  v_place integer;

  v_total_points integer;
  v_weekly_points integer;
  v_weekly_points_week text;
begin

  /*
   * Единая серверная дата. Couple Quizzes сейчас ориентирован на
   * финское время, поэтому не полагаемся на UTC current_date Supabase.
   */
  v_today := (now() at time zone 'Europe/Helsinki')::date;

  v_current_week_key := public.cq_week_key(v_today);
  v_previous_week_key := public.cq_week_key(v_today - 7);

  /*
   * Блокируем строку пары. Если два партнёра одновременно нажмут
   * Claim, один запрос дождётся другого и увидит, что награда уже
   * получена — задвоение исключено.
   */
  select
    partner_1_telegram_id,
    partner_2_telegram_id,
    weekly_top_reward_claimed_week,
    coalesce(total_points, 0),
    coalesce(weekly_points, 0),
    weekly_points_week
  into
    v_partner_1_telegram_id,
    v_partner_2_telegram_id,
    v_claimed_week,
    v_total_points,
    v_weekly_points,
    v_weekly_points_week
  from public.pairs
  where id = p_pair_id
  for update;

  if not found then
    return jsonb_build_object('awarded', false, 'reason', 'pair-not-found');
  end if;

  -- Пользователь должен действительно быть членом пары.
  if
    p_telegram_id is distinct from v_partner_1_telegram_id
    and
    p_telegram_id is distinct from v_partner_2_telegram_id
  then
    return jsonb_build_object('awarded', false, 'reason', 'not-pair-member');
  end if;

  -- За эту прошлую неделю пара уже получила награду.
  if v_claimed_week = v_previous_week_key then
    return jsonb_build_object(
      'awarded', false,
      'reason', 'already-claimed',
      'previousWeekKey', v_previous_week_key,
      'currentWeekKey', v_current_week_key,
      'weeklyTopRewardClaimedWeek', v_claimed_week,
      'pairTotalPoints', v_total_points,
      'pairWeeklyPoints',
        case when v_weekly_points_week = v_current_week_key
             then v_weekly_points else 0 end
    );
  end if;

  /*
   * Реальное место пары в weekly_pair_leaderboard прошлой недели.
   * Детерминированный порядок (совпадает с loadWeeklyPairLeaderboard
   * во фронтенде): total_points desc, updated_at asc, pair_id asc.
   */
  select ranked.place
  into v_place
  from (
    select
      pair_id,
      row_number() over (
        order by total_points desc, updated_at asc, pair_id asc
      )::integer as place
    from public.weekly_pair_leaderboard
    where week_key = v_previous_week_key
  ) as ranked
  where ranked.pair_id = p_pair_id;

  if v_place is null then
    return jsonb_build_object(
      'awarded', false,
      'reason', 'not-in-previous-leaderboard',
      'previousWeekKey', v_previous_week_key
    );
  end if;

  if v_place > 3 then
    return jsonb_build_object(
      'awarded', false,
      'reason', 'not-top-three',
      'place', v_place,
      'previousWeekKey', v_previous_week_key
    );
  end if;

  /*
   * Начисление: total_points — lifetime PAIR, weekly_points —
   * current-week PAIR. Если weekly_points_week ещё от старой недели,
   * текущая неделя начинается с 500.
   */
  update public.pairs
  set
    total_points = coalesce(total_points, 0) + v_reward,
    weekly_points =
      case
        when weekly_points_week = v_current_week_key
          then coalesce(weekly_points, 0) + v_reward
        else v_reward
      end,
    weekly_points_week = v_current_week_key,
    weekly_top_reward_claimed_week = v_previous_week_key
  where id = p_pair_id
  returning total_points, weekly_points, weekly_points_week, weekly_top_reward_claimed_week
    into v_total_points, v_weekly_points, v_weekly_points_week, v_claimed_week;

  return jsonb_build_object(
    'awarded', true,
    'reason', 'rewarded',
    'reward', v_reward,
    'place', v_place,
    'previousWeekKey', v_previous_week_key,
    'currentWeekKey', v_current_week_key,
    'pairTotalPoints', v_total_points,
    'pairWeeklyPoints', v_weekly_points,
    'weeklyTopRewardClaimedWeek', v_claimed_week
  );
end;
$$;

-- Не оставляем EXECUTE роли PUBLIC.
revoke all on function public.claim_weekly_pair_top_reward(uuid, bigint) from public;
grant execute on function public.claim_weekly_pair_top_reward(uuid, bigint) to anon, authenticated;
