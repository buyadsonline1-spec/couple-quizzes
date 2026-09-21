-- Ещё 9 вещей (по 3 новых на шапки/аксессуары/куртки), чтобы в каждой
-- категории было по 3 по-настоящему бесплатных (по уровню), 3+ за очки
-- и 3 за Telegram Stars:
--   бесплатные (уровень 3): hat_cowboy, acc_daisy, jacket_tshirt
--   за Stars: hat_unicorn (35⭐), hat_astro (45⭐), acc_monocle (30⭐),
--             acc_bling (40⭐), jacket_tux (55⭐), jacket_superhero (50⭐)
-- Применять в Supabase → SQL Editor, целиком, одним запуском. Требует
-- уже применённых pair_pets.sql, pair_pets_shop.sql,
-- pair_pets_unlocks.sql, pair_pets_jackets.sql, pair_pets_more_items.sql.

-- buy_pair_pet_item — та же RPC, плюс 3 новые бесплатные вещи.
create or replace function public.buy_pair_pet_item(
  p_telegram_id bigint,
  p_item_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pair_id uuid;
  v_price integer;
  v_slot text;
  v_unlock_pet_level integer;
  v_unlock_pair_points integer;
  v_unlock_streak_days integer;
  v_solo_points integer;
  v_current_pet_level integer;
  v_pair_total_points integer;
  v_streak_days integer;
begin
  select
    case p_item_id
      when 'hat_wizard' then 0
      when 'hat_cowboy' then 0
      when 'hat_bandana' then 0
      when 'hat_top' then 300
      when 'hat_cap' then 250
      when 'hat_beanie' then 150
      when 'hat_flower' then 300
      when 'hat_party' then 200
      when 'acc_necklace' then 0
      when 'acc_daisy' then 0
      when 'acc_headphones' then 0
      when 'acc_sunglasses' then 250
      when 'acc_bow' then 200
      when 'acc_scarf' then 300
      when 'acc_glasses' then 200
      when 'acc_collar' then 220
      when 'jacket_raincoat' then 0
      when 'jacket_tshirt' then 0
      when 'jacket_vest' then 0
      when 'jacket_bomber' then 280
      when 'jacket_denim' then 280
      when 'jacket_hoodie' then 250
      when 'room_meadow' then 400
      when 'room_night' then 400
      when 'room_beach' then 500
      when 'room_forest' then 450
      when 'room_candy' then 450
      -- Stars-only вещи — цены в очках нет, покупка через эту функцию
      -- для них запрещена ниже (см. grant_pair_pet_item).
      else null
    end,
    case p_item_id
      when 'hat_wizard' then 'hat'
      when 'hat_cowboy' then 'hat'
      when 'hat_bandana' then 'hat'
      when 'hat_top' then 'hat'
      when 'hat_cap' then 'hat'
      when 'hat_crown' then 'hat'
      when 'hat_unicorn' then 'hat'
      when 'hat_astro' then 'hat'
      when 'hat_beanie' then 'hat'
      when 'hat_flower' then 'hat'
      when 'hat_party' then 'hat'
      when 'acc_necklace' then 'accessory'
      when 'acc_daisy' then 'accessory'
      when 'acc_headphones' then 'accessory'
      when 'acc_sunglasses' then 'accessory'
      when 'acc_bow' then 'accessory'
      when 'acc_scarf' then 'accessory'
      when 'acc_glasses' then 'accessory'
      when 'acc_collar' then 'accessory'
      when 'acc_medal' then 'accessory'
      when 'acc_monocle' then 'accessory'
      when 'acc_bling' then 'accessory'
      when 'jacket_raincoat' then 'jacket'
      when 'jacket_tshirt' then 'jacket'
      when 'jacket_vest' then 'jacket'
      when 'jacket_bomber' then 'jacket'
      when 'jacket_denim' then 'jacket'
      when 'jacket_hoodie' then 'jacket'
      when 'jacket_puffer' then 'jacket'
      when 'jacket_tux' then 'jacket'
      when 'jacket_superhero' then 'jacket'
      when 'room_meadow' then 'room'
      when 'room_night' then 'room'
      when 'room_beach' then 'room'
      when 'room_forest' then 'room'
      when 'room_space' then 'room'
      when 'room_candy' then 'room'
      else null
    end,
    -- Разблокировка по уровню питомца.
    case p_item_id
      when 'hat_wizard' then 2
      when 'hat_cowboy' then 3
      when 'hat_bandana' then 5
      when 'acc_necklace' then 2
      when 'acc_daisy' then 3
      when 'acc_headphones' then 5
      when 'jacket_raincoat' then 2
      when 'jacket_tshirt' then 3
      when 'jacket_vest' then 5
      when 'hat_top' then 3
      when 'acc_sunglasses' then 4
      when 'jacket_denim' then 3
      when 'room_night' then 5
      else null
    end,
    -- Разблокировка по суммарным очкам пары (pairs.total_points).
    case p_item_id
      when 'acc_scarf' then 1500
      when 'room_candy' then 3000
      else null
    end,
    -- Разблокировка по дневному стрику покупающего (profiles.daily_bonus_streak_day).
    case p_item_id
      when 'hat_flower' then 3
      when 'room_forest' then 5
      else null
    end
  into v_price, v_slot, v_unlock_pet_level, v_unlock_pair_points, v_unlock_streak_days;

  if v_slot is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid-item');
  end if;

  if v_price is null then
    return jsonb_build_object('ok', false, 'reason', 'stars-only');
  end if;

  select pair_id into v_pair_id from public.profiles where telegram_id = p_telegram_id;

  if v_pair_id is null or not exists (select 1 from public.pair_pets where pair_id = v_pair_id) then
    return jsonb_build_object('ok', false, 'reason', 'no-pet');
  end if;

  if exists (select 1 from public.pair_pet_items where pair_id = v_pair_id and item_id = p_item_id) then
    return jsonb_build_object('ok', false, 'reason', 'already-owned');
  end if;

  if v_unlock_pet_level is not null then
    v_current_pet_level := public.pair_pet_current_level(v_pair_id);
    if v_current_pet_level < v_unlock_pet_level then
      return jsonb_build_object(
        'ok', false, 'reason', 'locked-pet-level',
        'required', v_unlock_pet_level, 'current', v_current_pet_level
      );
    end if;
  end if;

  if v_unlock_pair_points is not null then
    select total_points into v_pair_total_points from public.pairs where id = v_pair_id;
    if coalesce(v_pair_total_points, 0) < v_unlock_pair_points then
      return jsonb_build_object(
        'ok', false, 'reason', 'locked-pair-points',
        'required', v_unlock_pair_points, 'current', coalesce(v_pair_total_points, 0)
      );
    end if;
  end if;

  if v_unlock_streak_days is not null then
    select daily_bonus_streak_day into v_streak_days from public.profiles where telegram_id = p_telegram_id;
    if coalesce(v_streak_days, 0) < v_unlock_streak_days then
      return jsonb_build_object(
        'ok', false, 'reason', 'locked-streak',
        'required', v_unlock_streak_days, 'current', coalesce(v_streak_days, 0)
      );
    end if;
  end if;

  select solo_points into v_solo_points from public.profiles where telegram_id = p_telegram_id for update;

  if coalesce(v_solo_points, 0) < v_price then
    return jsonb_build_object('ok', false, 'reason', 'insufficient-points', 'price', v_price, 'soloPoints', v_solo_points);
  end if;

  update public.profiles set solo_points = solo_points - v_price where telegram_id = p_telegram_id;

  insert into public.pair_pet_items (pair_id, item_id) values (v_pair_id, p_item_id);

  return jsonb_build_object(
    'ok', true,
    'itemId', p_item_id,
    'slot', v_slot,
    'soloPoints', v_solo_points - v_price
  );
end;
$$;

revoke all on function public.buy_pair_pet_item(bigint, text) from public;
revoke all on function public.buy_pair_pet_item(bigint, text) from anon;
revoke all on function public.buy_pair_pet_item(bigint, text) from authenticated;
grant execute on function public.buy_pair_pet_item(bigint, text) to service_role;

-- grant_pair_pet_item — та же RPC, плюс 6 новых Stars-вещей.
create or replace function public.grant_pair_pet_item(
  p_telegram_id bigint,
  p_item_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pair_id uuid;
  v_slot text;
begin
  v_slot := case p_item_id
    when 'hat_crown' then 'hat'
    when 'hat_unicorn' then 'hat'
    when 'hat_astro' then 'hat'
    when 'acc_medal' then 'accessory'
    when 'acc_monocle' then 'accessory'
    when 'acc_bling' then 'accessory'
    when 'jacket_puffer' then 'jacket'
    when 'jacket_tux' then 'jacket'
    when 'jacket_superhero' then 'jacket'
    when 'room_space' then 'room'
    else null
  end;

  if v_slot is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid-item');
  end if;

  select pair_id into v_pair_id from public.profiles where telegram_id = p_telegram_id;

  if v_pair_id is null or not exists (select 1 from public.pair_pets where pair_id = v_pair_id) then
    return jsonb_build_object('ok', false, 'reason', 'no-pet');
  end if;

  insert into public.pair_pet_items (pair_id, item_id)
  values (v_pair_id, p_item_id)
  on conflict (pair_id, item_id) do nothing;

  return jsonb_build_object('ok', true, 'itemId', p_item_id, 'slot', v_slot);
end;
$$;

revoke all on function public.grant_pair_pet_item(bigint, text) from public;
revoke all on function public.grant_pair_pet_item(bigint, text) from anon;
revoke all on function public.grant_pair_pet_item(bigint, text) from authenticated;
grant execute on function public.grant_pair_pet_item(bigint, text) to service_role;
