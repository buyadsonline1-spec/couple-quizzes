-- Экономика колеса призов была слишком щедрой на "разбавочные" бонусы:
-- 35% всех прокрутов давали +500 очков, ещё 35% — +1 бесплатный
-- прокрут (который только раздувает число прокрутов, не давая ничего
-- ценного). Меняем оба:
--
-- 1) "bonus_points" вместо фиксированных +500 теперь случайно даёт
--    +100 (часто) или +250 (реже) — тот же слот в колесе, просто
--    меньше очков в среднем.
-- 2) "bonus_spin" заменён на "bonus_item" — вместо лишнего прокрута
--    игрок получает случайную ещё не купленную вещь для питомца
--    (шапка/аксессуар/куртка/предмет в руке) бесплатно. Если у
--    игрока нет пары/питомца, или он уже владеет всеми вещами из
--    пула — откатываемся на +100 очков, чтобы прокрут не пропал
--    впустую.
--
-- wheel_bonus_spins (банк старых бесплатных прокруток) не трогаем —
-- у кого уже накоплены кредиты, продолжают ими пользоваться, просто
-- новые больше не начисляются.
--
-- Копия spin_reward_wheel из fix_wheel_spin_cost.sql (последней
-- применённой версии) с этими двумя изменениями. Применять в
-- Supabase → SQL Editor, целиком, одним запуском.

-- wheel_spins.outcome_type раньше разрешал только 3 значения — новый
-- 'bonus_item' надо явно добавить, иначе insert ниже упадёт на check-е.
alter table public.wheel_spins drop constraint if exists wheel_spins_outcome_type_check;
alter table public.wheel_spins add constraint wheel_spins_outcome_type_check
  check (outcome_type in ('prize', 'bonus_points', 'bonus_spin', 'bonus_item'));

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
  v_spin_cost constant integer := 1500;
  v_daily_limit constant integer := 3;

  v_bonus_points_threshold constant numeric := 0.35;
  v_bonus_spin_threshold constant numeric := 0.70;
  -- +100 очков выпадает намного чаще, чем +250 — общая вероятность
  -- "очкового" бонуса не изменилась (v_bonus_points_threshold), просто
  -- сам приз внутри этого слота теперь дешевле в среднем, чем +500.
  v_bonus_points_low constant integer := 100;
  v_bonus_points_high constant integer := 250;
  v_bonus_points_high_chance constant numeric := 0.25;

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
  v_bonus_points_value integer;

  v_pair_id uuid;
  v_gift_item_id text;
  v_gift_item_title text;

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
    v_outcome_type := 'bonus_item';
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

  elsif v_outcome_type = 'bonus_item' then
    -- Пробуем подарить случайную ещё не купленную вещь для питомца —
    -- тот же каталог "за очки", что и в buy_pair_pet_item, минус то,
    -- чем игрок уже владеет. Нужна пара с питомцем; если её нет или
    -- пул исчерпан — откатываемся на +100 очков ниже.
    select pair_id into v_pair_id from public.profiles where telegram_id = p_telegram_id;

    if v_pair_id is not null and exists (select 1 from public.pair_pets where pair_id = v_pair_id) then
      select t.id, t.title into v_gift_item_id, v_gift_item_title
        from (values
          ('hat_cap', 'Кепка'),
          ('hat_top', 'Цилиндр'),
          ('hat_beanie', 'Шапка'),
          ('hat_flower', 'Веночек'),
          ('hat_party', 'Колпак'),
          ('acc_bow', 'Бантик'),
          ('acc_glasses', 'Очки-нёрд'),
          ('acc_collar', 'Ошейник'),
          ('acc_sunglasses', 'Очки'),
          ('acc_scarf', 'Шарф'),
          ('jacket_hoodie', 'Худи'),
          ('jacket_bomber', 'Бомбер'),
          ('jacket_denim', 'Джинсовка'),
          ('held_icecream', 'Мороженое'),
          ('held_coffee', 'Кофе'),
          ('held_flowers', 'Букет'),
          ('held_ball', 'Мяч')
        ) as t(id, title)
        where not exists (
          select 1 from public.pair_pet_items
          where pair_id = v_pair_id and item_id = t.id
        )
        order by random()
        limit 1;
    end if;

    if v_gift_item_id is not null then
      insert into public.pair_pet_items (pair_id, item_id)
      values (v_pair_id, v_gift_item_id)
      on conflict (pair_id, item_id) do nothing;

      v_category_id := 'bonus';
      v_category_title := 'Бонус';
      v_item_id := v_gift_item_id;
      v_item_title := '🎁 ' || v_gift_item_title;
      v_bonus_value := null;
    else
      -- Нет пары/питомца или пул подарков исчерпан — откат на очки,
      -- чтобы прокрут не пропал впустую.
      v_outcome_type := 'bonus_points';
    end if;
  end if;

  if v_outcome_type = 'bonus_points' then
    v_bonus_points_value :=
      case
        when
          (('x' || encode(gen_random_bytes(6), 'hex'))::bit(48)::bigint)::numeric
          / 281474976710656.0 < v_bonus_points_high_chance
        then v_bonus_points_high
        else v_bonus_points_low
      end;

    v_category_id := 'bonus';
    v_category_title := 'Бонус';
    v_item_id := 'bonus-points';
    v_item_title := '+' || v_bonus_points_value || ' очков';
    v_bonus_value := v_bonus_points_value;
  end if;

  v_next_solo_points :=
    coalesce(v_profile.solo_points, 0)
    - v_actual_cost
    + case when v_outcome_type = 'bonus_points' then v_bonus_points_value else 0 end;

  v_next_bonus_spins :=
    v_profile.wheel_bonus_spins
    - case when v_spin_source = 'bonus_credit' then 1 else 0 end;

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
