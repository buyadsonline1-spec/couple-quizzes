-- Магазин для питомца — шапки/аксессуары + фоны комнаты. Покупка
-- списывает solo_points у того, кто покупает (тот же принцип, что и
-- у прокрута рулетки — платит тот, кто нажал кнопку, не общий пул
-- пары). Каталог (id/цена/слот) зашит в саму RPC — клиент передаёт
-- только item_id, сумму и допустимость определяет сервер, как и
-- везде в проекте (см. award_activity_points).
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.
-- Требует уже применённый supabase/pair_pets.sql.

alter table public.pair_pets
  add column if not exists equipped_hat text,
  add column if not exists equipped_accessory text,
  add column if not exists equipped_room text;

create table if not exists public.pair_pet_items (
  pair_id uuid not null references public.pairs(id) on delete cascade,
  item_id text not null,
  acquired_at timestamptz not null default now(),
  primary key (pair_id, item_id)
);

alter table public.pair_pet_items enable row level security;
revoke all on public.pair_pet_items from anon;
revoke all on public.pair_pet_items from authenticated;
grant all on public.pair_pet_items to service_role;

-- Покупка. p_item_id должен быть одним из ключей ниже — цена и слот
-- сервер определяет сам, клиент их не присылает. Идемпотентно: если
-- уже куплено, возвращает already-owned и НЕ списывает очки повторно.
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
  v_solo_points integer;
begin
  select case p_item_id
    when 'hat_top' then 300
    when 'hat_cap' then 250
    when 'hat_crown' then 800
    when 'hat_beanie' then 150
    when 'hat_flower' then 300
    when 'hat_party' then 200
    when 'acc_sunglasses' then 250
    when 'acc_bow' then 200
    when 'acc_scarf' then 300
    when 'acc_glasses' then 200
    when 'acc_collar' then 220
    when 'acc_medal' then 350
    when 'room_meadow' then 400
    when 'room_night' then 400
    when 'room_beach' then 500
    when 'room_forest' then 450
    when 'room_space' then 600
    when 'room_candy' then 450
    else null
  end,
  case p_item_id
    when 'hat_top' then 'hat'
    when 'hat_cap' then 'hat'
    when 'hat_crown' then 'hat'
    when 'hat_beanie' then 'hat'
    when 'hat_flower' then 'hat'
    when 'hat_party' then 'hat'
    when 'acc_sunglasses' then 'accessory'
    when 'acc_bow' then 'accessory'
    when 'acc_scarf' then 'accessory'
    when 'acc_glasses' then 'accessory'
    when 'acc_collar' then 'accessory'
    when 'acc_medal' then 'accessory'
    when 'room_meadow' then 'room'
    when 'room_night' then 'room'
    when 'room_beach' then 'room'
    when 'room_forest' then 'room'
    when 'room_space' then 'room'
    when 'room_candy' then 'room'
    else null
  end
  into v_price, v_slot;

  if v_price is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid-item');
  end if;

  select pair_id into v_pair_id from public.profiles where telegram_id = p_telegram_id;

  if v_pair_id is null or not exists (select 1 from public.pair_pets where pair_id = v_pair_id) then
    return jsonb_build_object('ok', false, 'reason', 'no-pet');
  end if;

  if exists (select 1 from public.pair_pet_items where pair_id = v_pair_id and item_id = p_item_id) then
    return jsonb_build_object('ok', false, 'reason', 'already-owned');
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

-- Надеть/снять купленную вещь. p_item_id = null снимает текущую вещь
-- в этом слоте. Требует владения вещью (кроме снятия).
create or replace function public.equip_pair_pet_item(
  p_telegram_id bigint,
  p_slot text,
  p_item_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pair_id uuid;
begin
  if p_slot not in ('hat', 'accessory', 'room') then
    return jsonb_build_object('ok', false, 'reason', 'invalid-slot');
  end if;

  select pair_id into v_pair_id from public.profiles where telegram_id = p_telegram_id;

  if v_pair_id is null or not exists (select 1 from public.pair_pets where pair_id = v_pair_id) then
    return jsonb_build_object('ok', false, 'reason', 'no-pet');
  end if;

  if p_item_id is not null and not exists (
    select 1 from public.pair_pet_items where pair_id = v_pair_id and item_id = p_item_id
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not-owned');
  end if;

  if p_slot = 'hat' then
    update public.pair_pets set equipped_hat = p_item_id where pair_id = v_pair_id;
  elsif p_slot = 'accessory' then
    update public.pair_pets set equipped_accessory = p_item_id where pair_id = v_pair_id;
  else
    update public.pair_pets set equipped_room = p_item_id where pair_id = v_pair_id;
  end if;

  return jsonb_build_object('ok', true, 'slot', p_slot, 'itemId', p_item_id);
end;
$$;

revoke all on function public.equip_pair_pet_item(bigint, text, text) from public;
revoke all on function public.equip_pair_pet_item(bigint, text, text) from anon;
revoke all on function public.equip_pair_pet_item(bigint, text, text) from authenticated;
grant execute on function public.equip_pair_pet_item(bigint, text, text) to service_role;

-- get_pair_pet_state — теперь возвращает ещё и купленные/надетые вещи.
create or replace function public.get_pair_pet_state(p_telegram_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pair_id uuid;
  v_pet record;
  v_total_xp integer;
  v_level integer := 1;
  v_need integer;
  v_remaining integer;
  v_xp_to_next integer;
  v_owned text[];
begin
  select pair_id into v_pair_id
    from public.profiles
    where telegram_id = p_telegram_id;

  if v_pair_id is null then
    return jsonb_build_object('ok', true, 'pet', null);
  end if;

  select * into v_pet from public.pair_pets where pair_id = v_pair_id;

  if not found then
    return jsonb_build_object('ok', true, 'pet', null);
  end if;

  select coalesce(sum(delta), 0) into v_total_xp
    from public.activity_point_claims
    where pair_id = v_pair_id;

  v_remaining := v_total_xp;

  loop
    v_need := 100 + (v_level - 1) * 50;
    exit when v_remaining < v_need;
    v_remaining := v_remaining - v_need;
    v_level := v_level + 1;
  end loop;

  v_xp_to_next := 100 + (v_level - 1) * 50;

  select coalesce(array_agg(item_id), array[]::text[]) into v_owned
    from public.pair_pet_items
    where pair_id = v_pair_id;

  return jsonb_build_object(
    'ok', true,
    'pet', jsonb_build_object(
      'species', v_pet.species,
      'gender', v_pet.gender,
      'name', v_pet.name,
      'createdAt', v_pet.created_at,
      'level', v_level,
      'xp', v_remaining,
      'xpToNext', v_xp_to_next,
      'totalXp', v_total_xp,
      'equippedHat', v_pet.equipped_hat,
      'equippedAccessory', v_pet.equipped_accessory,
      'equippedRoom', v_pet.equipped_room,
      'ownedItems', to_jsonb(v_owned)
    )
  );
end;
$$;

revoke all on function public.get_pair_pet_state(bigint) from public;
revoke all on function public.get_pair_pet_state(bigint) from anon;
revoke all on function public.get_pair_pet_state(bigint) from authenticated;
grant execute on function public.get_pair_pet_state(bigint) to service_role;
