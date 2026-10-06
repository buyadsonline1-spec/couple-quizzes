-- Раньше при отсутствии анкет с точным совпадением города лента
-- Знакомств была просто пустой ("No more profiles") — это и словил
-- Apple Review на demo-аккаунте без совпадений, но проблема реальна и
-- для обычных пользователей из городов с малым числом анкет. Теперь
-- get_dating_candidates сперва пробует строгий city-match (как раньше),
-- а если по нему пусто — тот же запрос без фильтра по городу вообще
-- (пол/возраст/блокировки/уже свайпнутые по-прежнему учитываются).
-- Схема хранит только city, отдельного поля country нет.
--
-- Копия get_dating_candidates из dating_city_matching.sql (последней
-- применённой версии) с этим единственным изменением. Применять в
-- Supabase → SQL Editor, целиком, одним запуском.

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
  v_candidates jsonb;
begin
  select gender, seeking_gender, age, city
    into v_self
    from public.dating_profiles
    where telegram_id = p_telegram_id and is_active = true;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no-profile');
  end if;

  -- Попытка 1: строгое совпадение города (без учёта регистра/пробелов).
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
    into v_candidates
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
    limit greatest(1, least(p_limit, 50));

  -- Попытка 2: тот же запрос, но совсем без фильтра по городу — лучше
  -- показать анкету не из своего города, чем пустую ленту.
  if v_candidates is null then
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
      into v_candidates
      from public.dating_profiles dp
      where dp.telegram_id <> p_telegram_id
        and dp.is_active = true
        and (v_self.seeking_gender = 'any' or dp.gender = v_self.seeking_gender)
        and (dp.seeking_gender = 'any' or dp.seeking_gender = v_self.gender)
        and dp.age between (v_self.age - 6) and (v_self.age + 6)
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
      limit greatest(1, least(p_limit, 50));
  end if;

  return jsonb_build_object('ok', true, 'candidates', coalesce(v_candidates, '[]'::jsonb));
end;
$$;

revoke all on function public.get_dating_candidates(bigint, integer)
  from public, anon, authenticated;
grant execute on function public.get_dating_candidates(bigint, integer)
  to service_role;
