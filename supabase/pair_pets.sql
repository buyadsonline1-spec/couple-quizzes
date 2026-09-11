-- Питомец пары — новая фича (см. обсуждение в сессии). Растёт не от
-- отдельного счётчика опыта, а как ПРОИЗВОДНОЕ значение от суммы
-- delta во всех activity_point_claims этой пары (activity_point_claims
-- уже пишет pair_id на каждую запись — см. app/api/activity/award/route.ts
-- и supabase/daily_bonus_server_side.sql). Это значит:
--   1) не нужна отдельная мутирующая RPC "начислить опыт питомцу" —
--      никакого риска рассинхронизации/дублирования опыта;
--   2) опыт автоматически растёт от ВСЕГО, что уже даёт очки паре —
--      опросы, тесты, шаги игр, бонус за полное прохождение, дневной
--      бонус — ровно то самое "растёт от прогресса", без правки уже
--      работающего award_activity_points.
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

create table if not exists public.pair_pets (
  pair_id uuid primary key references public.pairs(id) on delete cascade,
  species text not null check (species in ('dog', 'cat', 'rabbit', 'cow', 'hippo', 'owl')),
  gender text not null check (gender in ('boy', 'girl')),
  name text not null check (char_length(trim(name)) between 1 and 20),
  created_by_telegram_id bigint not null,
  created_at timestamptz not null default now()
);

alter table public.pair_pets enable row level security;
-- Тот же подход, что и у profiles/pairs/activity_point_claims в этом
-- проекте — доступ только через service_role (API-роуты сами делают
-- validateRequestAuth), anon/authenticated не имеют прямого доступа.
revoke all on public.pair_pets from anon;
revoke all on public.pair_pets from authenticated;
grant all on public.pair_pets to service_role;

-- Заводит питомца для пары. Один питомец на пару — навсегда (пока нет
-- отдельной фичи "завести нового"/сменить). Требует полностью
-- укомплектованную пару (оба партнёра подключены) — как и на клиенте
-- (см. hasPair в MainMenu).
create or replace function public.create_pair_pet(
  p_telegram_id bigint,
  p_species text,
  p_gender text,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pair_id uuid;
  v_partner_2 bigint;
  v_clean_name text;
  v_pet record;
begin
  select pair_id into v_pair_id
    from public.profiles
    where telegram_id = p_telegram_id;

  if v_pair_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no-pair');
  end if;

  select partner_2_telegram_id into v_partner_2
    from public.pairs
    where id = v_pair_id;

  if v_partner_2 is null then
    return jsonb_build_object('ok', false, 'reason', 'pair-incomplete');
  end if;

  if p_species not in ('dog', 'cat', 'rabbit', 'cow', 'hippo', 'owl') then
    return jsonb_build_object('ok', false, 'reason', 'invalid-species');
  end if;

  if p_gender not in ('boy', 'girl') then
    return jsonb_build_object('ok', false, 'reason', 'invalid-gender');
  end if;

  v_clean_name := trim(coalesce(p_name, ''));

  if char_length(v_clean_name) < 1 or char_length(v_clean_name) > 20 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-name');
  end if;

  if exists (select 1 from public.pair_pets where pair_id = v_pair_id) then
    return jsonb_build_object('ok', false, 'reason', 'already-exists');
  end if;

  insert into public.pair_pets (pair_id, species, gender, name, created_by_telegram_id)
  values (v_pair_id, p_species, p_gender, v_clean_name, p_telegram_id)
  returning * into v_pet;

  return jsonb_build_object(
    'ok', true,
    'pet', jsonb_build_object(
      'species', v_pet.species,
      'gender', v_pet.gender,
      'name', v_pet.name,
      'createdAt', v_pet.created_at
    )
  );
end;
$$;

revoke all on function public.create_pair_pet(bigint, text, text, text) from public;
revoke all on function public.create_pair_pet(bigint, text, text, text) from anon;
revoke all on function public.create_pair_pet(bigint, text, text, text) from authenticated;
grant execute on function public.create_pair_pet(bigint, text, text, text) to service_role;

-- Возвращает питомца пары (или pet: null, если ещё не заведён) вместе
-- с посчитанным уровнем/опытом. Уровень считается по нарастающему
-- порогу: до 2 уровня нужно 100 очков, до 3-го — ещё 150, до 4-го —
-- ещё 200 и т.д. (+50 за каждый следующий уровень) — то есть кривая
-- роста та же идея, что и у уровня пары (getPairLevelInfo на клиенте),
-- просто отдельная шкала под питомца.
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
      'totalXp', v_total_xp
    )
  );
end;
$$;

revoke all on function public.get_pair_pet_state(bigint) from public;
revoke all on function public.get_pair_pet_state(bigint) from anon;
revoke all on function public.get_pair_pet_state(bigint) from authenticated;
grant execute on function public.get_pair_pet_state(bigint) to service_role;
