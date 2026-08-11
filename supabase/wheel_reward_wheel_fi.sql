-- Добавляет 'fi' как полноценный третий призовой рынок колеса (был
-- только 'ru'/'en', см. wheel_reward_wheel.sql). Финский пул — реально
-- покупаемые в Финляндии подарочные карты: Normal, Finnkino, S-market.
-- Как только у пользователя рынок 'fi', сервер уже НЕ подставляет ему
-- EN-каталог — колесо крутит по-настоящему финские призы.
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском, ПОСЛЕ
-- wheel_reward_wheel.sql (таблицы/функция должны уже существовать).

-- ============================================================
-- 1. Расширяем check-констрейнты market/reward_market до 'ru'/'en'/'fi'.
--    Имена констрейнтов — стандартные автосгенерированные Postgres
--    (<таблица>_<колонка>_check) для инлайновых check(...) без явного
--    имени, как раз наш случай в wheel_reward_wheel.sql/ai_psychologist.sql.
-- ============================================================

alter table public.profiles
  drop constraint if exists profiles_reward_market_check;
alter table public.profiles
  add constraint profiles_reward_market_check
  check (reward_market in ('ru', 'en', 'fi'));

alter table public.wheel_reward_categories
  drop constraint if exists wheel_reward_categories_market_check;
alter table public.wheel_reward_categories
  add constraint wheel_reward_categories_market_check
  check (market in ('ru', 'en', 'fi'));

alter table public.wheel_reward_items
  drop constraint if exists wheel_reward_items_market_check;
alter table public.wheel_reward_items
  add constraint wheel_reward_items_market_check
  check (market in ('ru', 'en', 'fi'));

alter table public.wheel_spins
  drop constraint if exists wheel_spins_market_check;
alter table public.wheel_spins
  add constraint wheel_spins_market_check
  check (market in ('ru', 'en', 'fi'));

-- ============================================================
-- 2. seed: FI — три категории. Веса откалиброваны вместе с ChatGPT
--    (тот же процесс, что и для RU/EN — целевая абсолютная вероятность
--    с учётом 30%-го "приз, не бонус" фильтра). Категории равные
--    (1/1/1), редкость задаётся весами ВНУТРИ категории:
--      5€/10€ (младший номинал)  — основная масса реальных призов;
--      20€                       — ощутимо реже, ~1 из 125-500;
--      50€                       — редкий "верхний" приз, ~1 из 5000
--                                   на каждый бренд (~1 из 1667 суммарно
--                                   по всем трём).
--    Можно поправить позже тем же on conflict update.
-- ============================================================

insert into public.wheel_reward_categories (id, market, title, emoji, weight, sort_order) values
  ('normal',   'fi', 'Normal',   '🏷️', 1, 1),
  ('finnkino', 'fi', 'Finnkino', '🎬', 1, 2),
  ('s-market', 'fi', 'S-market', '🛒', 1, 3)
on conflict (market, id) do update set
  title = excluded.title,
  emoji = excluded.emoji,
  weight = excluded.weight,
  sort_order = excluded.sort_order;

insert into public.wheel_reward_items (id, market, category_id, title, weight) values
  ('normal-5',    'fi', 'normal',   'Normal-lahjakortti 5€',    389),
  ('normal-10',   'fi', 'normal',   'Normal-lahjakortti 10€',   100),
  ('normal-20',   'fi', 'normal',   'Normal-lahjakortti 20€',   10),
  ('normal-50',   'fi', 'normal',   'Normal-lahjakortti 50€',   1),
  ('finnkino-10', 'fi', 'finnkino', 'Finnkino-lahjakortti 10€', 484),
  ('finnkino-20', 'fi', 'finnkino', 'Finnkino-lahjakortti 20€', 15),
  ('finnkino-50', 'fi', 'finnkino', 'Finnkino-lahjakortti 50€', 1),
  ('s-market-10', 'fi', 's-market', 'S-ryhmän lahjakortti 10€', 484),
  ('s-market-20', 'fi', 's-market', 'S-ryhmän lahjakortti 20€', 15),
  ('s-market-50', 'fi', 's-market', 'S-ryhmän lahjakortti 50€', 1)
on conflict (market, id) do update set
  category_id = excluded.category_id,
  title = excluded.title,
  weight = excluded.weight;

-- ============================================================
-- 3. RPC spin_reward_wheel — те же изменения, что и в
--    wheel_reward_wheel.sql, плюс 'fi' в обоих местах, где раньше был
--    захардкожен список ('ru','en'). Полная copy-paste функция,
--    CREATE OR REPLACE замещает её целиком.
-- ============================================================

create or replace function public.spin_reward_wheel(
  p_telegram_id bigint,
  p_suggested_market text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_spin_cost constant integer := 2000;
  v_daily_limit constant integer := 3;

  v_bonus_points_threshold constant numeric := 0.35;
  v_bonus_spin_threshold constant numeric := 0.70;
  v_bonus_points_value constant integer := 500;

  v_today date;
  v_profile record;
  v_market text;

  v_spin_source text;
  v_actual_cost integer;

  v_paid_spins_today integer;
  v_total_spins_today integer;
  v_spin_number integer;

  v_outcome_roll numeric;
  v_outcome_type text;

  v_total_category_weight numeric;
  v_category_pick numeric;
  v_category_id text;
  v_category_title text;
  v_running_category numeric;
  v_cat_row record;

  v_total_item_weight numeric;
  v_item_pick numeric;
  v_item_id text;
  v_item_title text;
  v_running_item numeric;
  v_item_row record;
  v_bonus_value integer;

  v_next_solo_points integer;
  v_next_bonus_spins integer;
  v_next_paid_spins integer;
  v_spin_id uuid;
  v_locked_at timestamptz;
begin
  v_today := (now() at time zone 'Europe/Helsinki')::date;

  select telegram_id, solo_points, reward_market, reward_market_locked_at,
         coalesce(wheel_bonus_spins, 0) as wheel_bonus_spins
    into v_profile
    from public.profiles
    where telegram_id = p_telegram_id
    for update;

  if not found then
    return jsonb_build_object('awarded', false, 'reason', 'profile-not-found');
  end if;

  if
    v_profile.reward_market_locked_at is not null
    and v_profile.reward_market not in ('ru', 'en', 'fi')
  then
    return jsonb_build_object('awarded', false, 'reason', 'invalid-locked-market');
  end if;

  if v_profile.reward_market_locked_at is not null then
    v_market := v_profile.reward_market;
  else
    v_market :=
      case
        when p_suggested_market in ('ru', 'en', 'fi') then p_suggested_market
        else coalesce(v_profile.reward_market, 'ru')
      end;
  end if;

  select count(*) filter (where spin_source = 'paid'), count(*)
    into v_paid_spins_today, v_total_spins_today
    from public.wheel_spins
    where telegram_id = p_telegram_id
      and spin_date = v_today;

  v_paid_spins_today := coalesce(v_paid_spins_today, 0);
  v_total_spins_today := coalesce(v_total_spins_today, 0);

  if v_profile.wheel_bonus_spins > 0 then
    v_spin_source := 'bonus_credit';
    v_actual_cost := 0;
  else
    v_spin_source := 'paid';
    v_actual_cost := v_spin_cost;

    if v_paid_spins_today >= v_daily_limit then
      return jsonb_build_object(
        'awarded', false,
        'reason', 'daily-limit-reached',
        'spinsUsedToday', v_paid_spins_today,
        'spinsRemainingToday', 0,
        'bonusSpinCredits', v_profile.wheel_bonus_spins
      );
    end if;

    if coalesce(v_profile.solo_points, 0) < v_spin_cost then
      return jsonb_build_object(
        'awarded', false,
        'reason', 'insufficient-points',
        'soloPoints', coalesce(v_profile.solo_points, 0),
        'spinsUsedToday', v_paid_spins_today,
        'spinsRemainingToday', v_daily_limit - v_paid_spins_today,
        'bonusSpinCredits', v_profile.wheel_bonus_spins
      );
    end if;
  end if;

  v_outcome_roll :=
    (('x' || encode(gen_random_bytes(6), 'hex'))::bit(48)::bigint)::numeric
    / 281474976710656.0;

  if v_outcome_roll < v_bonus_points_threshold then
    v_outcome_type := 'bonus_points';
  elsif v_outcome_roll < v_bonus_spin_threshold then
    v_outcome_type := 'bonus_spin';
  else
    v_outcome_type := 'prize';
  end if;

  if v_outcome_type = 'prize' then
    select coalesce(sum(weight), 0) into v_total_category_weight
      from public.wheel_reward_categories
      where market = v_market and active;

    if v_total_category_weight is null or v_total_category_weight <= 0 then
      return jsonb_build_object('awarded', false, 'reason', 'no-categories');
    end if;

    v_category_pick :=
      (('x' || encode(gen_random_bytes(6), 'hex'))::bit(48)::bigint)::numeric
      / 281474976710656.0
      * v_total_category_weight;

    v_running_category := 0;
    for v_cat_row in
      select id, title, weight
      from public.wheel_reward_categories
      where market = v_market and active
      order by id
    loop
      v_running_category := v_running_category + v_cat_row.weight;
      if v_category_pick < v_running_category then
        v_category_id := v_cat_row.id;
        v_category_title := v_cat_row.title;
        exit;
      end if;
    end loop;

    if v_category_id is null then
      return jsonb_build_object('awarded', false, 'reason', 'category-pick-failed');
    end if;

    select coalesce(sum(weight), 0) into v_total_item_weight
      from public.wheel_reward_items
      where market = v_market and category_id = v_category_id and active;

    if v_total_item_weight is null or v_total_item_weight <= 0 then
      return jsonb_build_object('awarded', false, 'reason', 'no-items');
    end if;

    v_item_pick :=
      (('x' || encode(gen_random_bytes(6), 'hex'))::bit(48)::bigint)::numeric
      / 281474976710656.0
      * v_total_item_weight;

    v_running_item := 0;
    for v_item_row in
      select id, title, weight
      from public.wheel_reward_items
      where market = v_market and category_id = v_category_id and active
      order by id
    loop
      v_running_item := v_running_item + v_item_row.weight;
      if v_item_pick < v_running_item then
        v_item_id := v_item_row.id;
        v_item_title := v_item_row.title;
        exit;
      end if;
    end loop;

    if v_item_id is null then
      return jsonb_build_object('awarded', false, 'reason', 'item-pick-failed');
    end if;

    v_bonus_value := null;

  elsif v_outcome_type = 'bonus_points' then
    v_category_id := 'bonus';
    v_category_title := 'Бонус';
    v_item_id := 'bonus-points';
    v_item_title := '+' || v_bonus_points_value || ' очков';
    v_bonus_value := v_bonus_points_value;

  else -- bonus_spin
    v_category_id := 'bonus';
    v_category_title := 'Бонус';
    v_item_id := 'bonus-spin';
    v_item_title := '+1 прокрут колеса';
    v_bonus_value := 1;
  end if;

  v_next_solo_points :=
    coalesce(v_profile.solo_points, 0)
    - v_actual_cost
    + case when v_outcome_type = 'bonus_points' then v_bonus_points_value else 0 end;

  v_next_bonus_spins :=
    v_profile.wheel_bonus_spins
    - case when v_spin_source = 'bonus_credit' then 1 else 0 end
    + case when v_outcome_type = 'bonus_spin' then 1 else 0 end;

  v_next_paid_spins :=
    v_paid_spins_today + case when v_spin_source = 'paid' then 1 else 0 end;

  v_locked_at := coalesce(v_profile.reward_market_locked_at, now());

  update public.profiles
     set solo_points = v_next_solo_points,
         reward_market = v_market,
         reward_market_locked_at = v_locked_at,
         wheel_bonus_spins = v_next_bonus_spins
   where telegram_id = p_telegram_id;

  v_spin_number := v_total_spins_today + 1;

  insert into public.wheel_spins (
    telegram_id, market, outcome_type, spin_source,
    category_id, category_title,
    item_id, item_title, bonus_value,
    spent_points, spin_date, spin_number
  ) values (
    p_telegram_id, v_market, v_outcome_type, v_spin_source,
    v_category_id, v_category_title,
    v_item_id, v_item_title, v_bonus_value,
    v_actual_cost, v_today, v_spin_number
  )
  returning id into v_spin_id;

  return jsonb_build_object(
    'awarded', true,
    'reason', 'rewarded',
    'spinId', v_spin_id,
    'market', v_market,
    'outcomeType', v_outcome_type,
    'spinSource', v_spin_source,
    'categoryId', v_category_id,
    'categoryTitle', v_category_title,
    'itemId', v_item_id,
    'itemTitle', v_item_title,
    'bonusValue', v_bonus_value,
    'spentPoints', v_actual_cost,
    'soloPoints', v_next_solo_points,
    'bonusSpinCredits', v_next_bonus_spins,
    'spinsUsedToday', v_next_paid_spins,
    'spinsRemainingToday', v_daily_limit - v_next_paid_spins
  );
end;
$$;

revoke all on function public.spin_reward_wheel(bigint, text) from public;
revoke all on function public.spin_reward_wheel(bigint, text) from anon;
revoke all on function public.spin_reward_wheel(bigint, text) from authenticated;
grant execute on function public.spin_reward_wheel(bigint, text) to service_role;
