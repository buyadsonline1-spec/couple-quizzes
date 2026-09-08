-- Суперлайк, буст анкеты и фильтры поиска для "Знакомств".
--   * Суперлайк (⭐, платно через Telegram Stars) — сильный лайк:
--     не тратит дневной бесплатный лимит свайпов, получатель видит
--     анкету первой в "Лайках мне" с отметкой и получает отдельное,
--     заметно выделенное уведомление.
--   * Буст (⚡, платно через Stars, 3 тарифа + 1 бесплатный в неделю
--     для Premium) — на время поднимает анкету в начало чужой ленты
--     кандидатов.
--   * Фильтры поиска — диапазон возраста, хранится на самой анкете
--     (dating_profiles), т.к. это персональная настройка показа, а не
--     отдельная сущность. Пол уже задаётся полем seeking_gender —
--     экран фильтров просто даёт менять его без похода в редактирование
--     анкеты целиком.
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

-- ============================================================
-- 1. Новые колонки
-- ============================================================

alter table public.dating_swipes
  add column if not exists is_superlike boolean not null default false;

alter table public.dating_profiles
  add column if not exists boosted_until timestamptz,
  add column if not exists last_free_boost_at timestamptz,
  add column if not exists filter_min_age integer,
  add column if not exists filter_max_age integer;

-- ============================================================
-- 2. record_dating_swipe — + p_is_superlike. Суперлайк не тратит
--    дневной бесплатный лимит (это отдельная платная штука — не
--    смысла душить лимитом то, что уже оплачено отдельно) и
--    сохраняется отдельным флагом на строке свайпа.
-- ============================================================

create or replace function public.record_dating_swipe(
  p_from_telegram_id bigint,
  p_to_telegram_id bigint,
  p_action text,
  p_is_premium boolean default false,
  p_is_superlike boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reverse_like boolean;
  v_match_id uuid;
  v_low bigint;
  v_high bigint;
  v_today date;
  v_swipes_today integer;
  v_already_swiped boolean;
begin
  if p_action not in ('like', 'pass') then
    return jsonb_build_object('ok', false, 'reason', 'invalid-action');
  end if;

  if p_from_telegram_id = p_to_telegram_id then
    return jsonb_build_object('ok', false, 'reason', 'self-swipe');
  end if;

  select exists (
    select 1 from public.dating_swipes
    where from_telegram_id = p_from_telegram_id
      and to_telegram_id = p_to_telegram_id
  ) into v_already_swiped;

  if not v_already_swiped and not p_is_premium and not p_is_superlike then
    v_today := (now() at time zone 'Europe/Helsinki')::date;

    select count(*) into v_swipes_today
      from public.dating_swipes
      where from_telegram_id = p_from_telegram_id
        and (created_at at time zone 'Europe/Helsinki')::date = v_today;

    if v_swipes_today >= 5 then
      return jsonb_build_object('ok', false, 'reason', 'daily-limit-reached');
    end if;
  end if;

  insert into public.dating_swipes (from_telegram_id, to_telegram_id, action, is_superlike)
  values (p_from_telegram_id, p_to_telegram_id, p_action, p_is_superlike)
  on conflict (from_telegram_id, to_telegram_id) do nothing;

  if p_action = 'pass' then
    return jsonb_build_object('ok', true, 'matched', false);
  end if;

  select exists (
    select 1 from public.dating_swipes
    where from_telegram_id = p_to_telegram_id
      and to_telegram_id = p_from_telegram_id
      and action = 'like'
  ) into v_reverse_like;

  if not v_reverse_like then
    return jsonb_build_object('ok', true, 'matched', false);
  end if;

  v_low := least(p_from_telegram_id, p_to_telegram_id);
  v_high := greatest(p_from_telegram_id, p_to_telegram_id);

  insert into public.dating_matches (user_low_telegram_id, user_high_telegram_id)
  values (v_low, v_high)
  on conflict (user_low_telegram_id, user_high_telegram_id) do nothing
  returning id into v_match_id;

  if v_match_id is null then
    select id into v_match_id
      from public.dating_matches
      where user_low_telegram_id = v_low and user_high_telegram_id = v_high;
  end if;

  return jsonb_build_object('ok', true, 'matched', true, 'matchId', v_match_id);
end;
$$;

-- Старая 4-аргументная сигнатура убирается явно.
drop function if exists public.record_dating_swipe(bigint, bigint, text, boolean);

revoke all on function public.record_dating_swipe(bigint, bigint, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.record_dating_swipe(bigint, bigint, text, boolean, boolean)
  to service_role;

-- ============================================================
-- 3. get_dating_candidates — + фильтр по возрасту (из настроек
--    вызывающего) и флаг isBoosted у каждого кандидата (сортировку
--    "бустнутые сначала" делает API route вместе со скорингом
--    совместимости — тут только сырые данные).
-- ============================================================

create or replace function public.get_dating_candidates(
  p_telegram_id bigint,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self record;
begin
  select gender, seeking_gender, filter_min_age, filter_max_age
    into v_self
    from public.dating_profiles
    where telegram_id = p_telegram_id and is_active = true;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no-profile');
  end if;

  return jsonb_build_object(
    'ok', true,
    'candidates', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'telegramId', dp.telegram_id,
            'displayName', dp.display_name,
            'age', dp.age,
            'bio', dp.bio,
            'photoUrl', dp.photo_url,
            'gender', dp.gender,
            'personalitySummary', dp.personality_summary,
            'isBoosted', (dp.boosted_until is not null and dp.boosted_until > now())
          )
          -- ORDER BY должен быть ВНУТРИ jsonb_agg(), не снаружи — без
          -- GROUP BY внешний ORDER BY по колонке из dp невалиден
          -- (ловится только в рантайме: "column must appear in the
          -- GROUP BY clause"). См. fix_dating_candidates_order_by.sql.
          order by (dp.boosted_until is not null and dp.boosted_until > now()) desc
        )
        from public.dating_profiles dp
        where dp.telegram_id <> p_telegram_id
          and dp.is_active = true
          and (v_self.seeking_gender = 'any' or dp.gender = v_self.seeking_gender)
          and (dp.seeking_gender = 'any' or dp.seeking_gender = v_self.gender)
          and dp.age >= coalesce(v_self.filter_min_age, 18)
          and dp.age <= coalesce(v_self.filter_max_age, 120)
          and not exists (
            select 1 from public.dating_swipes s
            where s.from_telegram_id = p_telegram_id
              and s.to_telegram_id = dp.telegram_id
          )
          and not exists (
            select 1 from public.dating_blocks b
            where (b.blocker_telegram_id = p_telegram_id and b.blocked_telegram_id = dp.telegram_id)
               or (b.blocker_telegram_id = dp.telegram_id and b.blocked_telegram_id = p_telegram_id)
          )
        limit greatest(1, least(p_limit, 50))
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.get_dating_candidates(bigint, integer)
  from public, anon, authenticated;
grant execute on function public.get_dating_candidates(bigint, integer)
  to service_role;

-- ============================================================
-- 4. get_dating_incoming_likes — + isSuperlike, суперлайки первыми.
-- ============================================================

create or replace function public.get_dating_incoming_likes(
  p_telegram_id bigint,
  p_limit integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.dating_profiles
    where telegram_id = p_telegram_id and is_active = true
  ) then
    return jsonb_build_object('ok', false, 'reason', 'no-profile');
  end if;

  return jsonb_build_object(
    'ok', true,
    'candidates', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'telegramId', dp.telegram_id,
            'displayName', dp.display_name,
            'age', dp.age,
            'bio', dp.bio,
            'photoUrl', dp.photo_url,
            'gender', dp.gender,
            'personalitySummary', dp.personality_summary,
            'likedAt', s.created_at,
            'isSuperlike', s.is_superlike
          )
          order by s.is_superlike desc, s.created_at desc
        )
        from public.dating_swipes s
        join public.dating_profiles dp
          on dp.telegram_id = s.from_telegram_id
        where s.to_telegram_id = p_telegram_id
          and s.action = 'like'
          and dp.telegram_id <> p_telegram_id
          and dp.is_active = true
          and not exists (
            select 1 from public.dating_swipes s2
            where s2.from_telegram_id = p_telegram_id
              and s2.to_telegram_id = dp.telegram_id
          )
          and not exists (
            select 1 from public.dating_blocks b
            where (b.blocker_telegram_id = p_telegram_id and b.blocked_telegram_id = dp.telegram_id)
               or (b.blocker_telegram_id = dp.telegram_id and b.blocked_telegram_id = p_telegram_id)
          )
        limit greatest(1, least(p_limit, 50))
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.get_dating_incoming_likes(bigint, integer)
  from public, anon, authenticated;
grant execute on function public.get_dating_incoming_likes(bigint, integer)
  to service_role;

-- ============================================================
-- 5. set_dating_filters — сохранить диапазон возраста показа.
-- ============================================================

create or replace function public.set_dating_filters(
  p_telegram_id bigint,
  p_min_age integer,
  p_max_age integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_min_age is null or p_max_age is null or p_min_age < 18 or p_max_age > 120 or p_min_age > p_max_age then
    return jsonb_build_object('ok', false, 'reason', 'invalid-range');
  end if;

  update public.dating_profiles
    set filter_min_age = p_min_age,
        filter_max_age = p_max_age,
        updated_at = now()
    where telegram_id = p_telegram_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no-profile');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.set_dating_filters(bigint, integer, integer)
  from public, anon, authenticated;
grant execute on function public.set_dating_filters(bigint, integer, integer)
  to service_role;

-- ============================================================
-- 6. activate_dating_boost — вызывается ботом после успешной оплаты
--    Stars (см. bot/bot.ts, successful_payment). Не суммирует буст —
--    новая покупка просто ставит новый boosted_until от текущего
--    момента (проще и предсказуемее пользователю, чем стек таймеров).
-- ============================================================

create or replace function public.activate_dating_boost(
  p_telegram_id bigint,
  p_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_boosted_until timestamptz;
begin
  if p_minutes is null or p_minutes <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-duration');
  end if;

  v_boosted_until := now() + (p_minutes || ' minutes')::interval;

  update public.dating_profiles
    set boosted_until = v_boosted_until,
        updated_at = now()
    where telegram_id = p_telegram_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no-profile');
  end if;

  return jsonb_build_object('ok', true, 'boostedUntil', v_boosted_until);
end;
$$;

revoke all on function public.activate_dating_boost(bigint, integer)
  from public, anon, authenticated;
grant execute on function public.activate_dating_boost(bigint, integer)
  to service_role;

-- ============================================================
-- 7. claim_free_dating_boost — 1 бесплатный 30-минутный буст в
--    неделю, только для Premium (p_is_premium проверяется в API route
--    так же, как и everywhere else в этом проекте — единое место
--    бизнес-правила).
-- ============================================================

create or replace function public.claim_free_dating_boost(
  p_telegram_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last timestamptz;
  v_boosted_until timestamptz;
begin
  select last_free_boost_at into v_last
    from public.dating_profiles
    where telegram_id = p_telegram_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no-profile');
  end if;

  if v_last is not null and v_last > now() - interval '7 days' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'not-eligible',
      'nextAvailableAt', v_last + interval '7 days'
    );
  end if;

  v_boosted_until := now() + interval '30 minutes';

  update public.dating_profiles
    set boosted_until = v_boosted_until,
        last_free_boost_at = now(),
        updated_at = now()
    where telegram_id = p_telegram_id;

  return jsonb_build_object('ok', true, 'boostedUntil', v_boosted_until);
end;
$$;

revoke all on function public.claim_free_dating_boost(bigint)
  from public, anon, authenticated;
grant execute on function public.claim_free_dating_boost(bigint)
  to service_role;

-- ============================================================
-- 8. get_own_dating_profile — + фильтры и статус буста, чтобы клиент
--    мог показать текущие значения на экране фильтров и таймер буста
--    без отдельного запроса.
-- ============================================================

create or replace function public.get_own_dating_profile(
  p_telegram_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.dating_profiles%rowtype;
begin
  select * into v_profile
    from public.dating_profiles
    where telegram_id = p_telegram_id
      and is_active = true;

  if not found then
    return jsonb_build_object('ok', true, 'profile', null);
  end if;

  return jsonb_build_object(
    'ok', true,
    'profile', jsonb_build_object(
      'displayName', v_profile.display_name,
      'age', v_profile.age,
      'bio', v_profile.bio,
      'photoUrl', v_profile.photo_url,
      'gender', v_profile.gender,
      'seekingGender', v_profile.seeking_gender,
      'personalitySummary', coalesce(v_profile.personality_summary, '{}'::jsonb),
      'filterMinAge', coalesce(v_profile.filter_min_age, 18),
      'filterMaxAge', coalesce(v_profile.filter_max_age, 60),
      'boostedUntil',
        case
          when v_profile.boosted_until is not null and v_profile.boosted_until > now()
            then v_profile.boosted_until
          else null
        end,
      'freeBoostAvailable',
        v_profile.last_free_boost_at is null
        or v_profile.last_free_boost_at < now() - interval '7 days'
    )
  );
end;
$$;

revoke all on function public.get_own_dating_profile(bigint)
  from public, anon, authenticated;
grant execute on function public.get_own_dating_profile(bigint)
  to service_role;
