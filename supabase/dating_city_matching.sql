-- Заменяем ручные фильтры (диапазон возраста) на автоматический подбор
-- по городу + возрасту ±6 лет. Город указывается один раз при создании
-- анкеты (как имя/возраст), дальше ничего вручную настраивать не нужно.
-- filter_min_age/filter_max_age (из dating_superlike_boost.sql) больше
-- не используются — колонки оставлены как есть (не трогаем схему лишний
-- раз), просто get_dating_candidates их больше не читает.
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

-- ============================================================
-- 1. Новая колонка city
-- ============================================================

alter table public.dating_profiles
  add column if not exists city text;

-- ============================================================
-- 2. upsert_dating_profile — + p_city
-- ============================================================

create or replace function public.upsert_dating_profile(
  p_telegram_id bigint,
  p_display_name text,
  p_age integer,
  p_bio text,
  p_photo_url text,
  p_gender text,
  p_seeking_gender text,
  p_personality_summary jsonb,
  p_city text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_display_name is null or length(trim(p_display_name)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-name');
  end if;

  if p_age is null or p_age < 18 then
    return jsonb_build_object('ok', false, 'reason', 'underage');
  end if;

  if p_gender not in ('boy', 'girl') then
    return jsonb_build_object('ok', false, 'reason', 'invalid-gender');
  end if;

  if p_seeking_gender not in ('boy', 'girl', 'any') then
    return jsonb_build_object('ok', false, 'reason', 'invalid-seeking-gender');
  end if;

  if p_city is null or length(trim(p_city)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-city');
  end if;

  insert into public.dating_profiles (
    telegram_id, display_name, age, bio, photo_url,
    gender, seeking_gender, personality_summary, city, updated_at
  ) values (
    p_telegram_id, trim(p_display_name), p_age, p_bio, p_photo_url,
    p_gender, p_seeking_gender, coalesce(p_personality_summary, '{}'::jsonb), trim(p_city), now()
  )
  on conflict (telegram_id) do update set
    display_name = excluded.display_name,
    age = excluded.age,
    bio = excluded.bio,
    photo_url = coalesce(excluded.photo_url, public.dating_profiles.photo_url),
    gender = excluded.gender,
    seeking_gender = excluded.seeking_gender,
    personality_summary = excluded.personality_summary,
    city = excluded.city,
    is_active = true,
    updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

drop function if exists public.upsert_dating_profile(
  bigint, text, integer, text, text, text, text, jsonb
);

revoke all on function public.upsert_dating_profile(
  bigint, text, integer, text, text, text, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.upsert_dating_profile(
  bigint, text, integer, text, text, text, text, jsonb, text
) to service_role;

-- ============================================================
-- 3. get_dating_candidates — тот же город (без учёта регистра) +
--    возраст в пределах ±6 лет от своего. Если у вызывающего почему-то
--    нет города (старые анкеты до этой миграции) — не фильтруем по
--    городу вообще, чтобы не обнулить ленту резко; такие анкеты
--    предложат обновить город на клиенте.
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
  select gender, seeking_gender, age, city
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
          order by (dp.boosted_until is not null and dp.boosted_until > now()) desc
        )
        from public.dating_profiles dp
        where dp.telegram_id <> p_telegram_id
          and dp.is_active = true
          and (v_self.seeking_gender = 'any' or dp.gender = v_self.seeking_gender)
          and (dp.seeking_gender = 'any' or dp.seeking_gender = v_self.gender)
          and dp.age between (v_self.age - 6) and (v_self.age + 6)
          and (
            v_self.city is null
            or dp.city is null
            or lower(trim(dp.city)) = lower(trim(v_self.city))
          )
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
-- 4. get_own_dating_profile — + city, убраны filterMinAge/filterMaxAge
--    (фильтров больше нет на клиенте).
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
      'city', v_profile.city,
      'personalitySummary', coalesce(v_profile.personality_summary, '{}'::jsonb),
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

-- ============================================================
-- 5. Фильтров по клику больше нет — убираем RPC, которым больше
--    некому пользоваться (grant был только service_role, revoke не
--    нужен).
-- ============================================================

drop function if exists public.set_dating_filters(bigint, integer, integer);
