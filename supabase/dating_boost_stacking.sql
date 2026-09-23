-- Буст анкеты (Знакомства) не суммировался: activate_dating_boost и
-- claim_free_dating_boost всегда ставили boosted_until = now() + N
-- минут, ПЕРЕЗАПИСЫВАЯ уже активный буст — если у пользователя было
-- 2 часа буста и он покупал ещё 30 минут, оставшееся время не
-- прибавлялось, а СГОРАЛО до 30 минут. Теперь новая покупка (платная
-- или бесплатная еженедельная) продлевает буст от МАКСИМУМА(сейчас,
-- уже стоящий boosted_until) — то есть honestly суммируется в часах
-- при нескольких тарифах подряд, а не просто "продлевает" от текущего
-- момента, если буст уже активен.
-- Применять в Supabase → SQL Editor, целиком, одним запуском. Требует
-- уже применённого dating_superlike_boost.sql.

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
  v_current_boosted_until timestamptz;
  v_base timestamptz;
  v_boosted_until timestamptz;
begin
  if p_minutes is null or p_minutes <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-duration');
  end if;

  select boosted_until into v_current_boosted_until
    from public.dating_profiles
    where telegram_id = p_telegram_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no-profile');
  end if;

  -- Если буст уже активен — новая покупка добавляется СВЕРХУ него, а
  -- не от текущего момента (иначе можно было бы "потерять" уже
  -- оплаченное время, купив ещё один тариф). Если буста нет или он
  -- уже истёк — считаем от now(), как и раньше.
  v_base := greatest(now(), coalesce(v_current_boosted_until, now()));
  v_boosted_until := v_base + (p_minutes || ' minutes')::interval;

  update public.dating_profiles
    set boosted_until = v_boosted_until,
        updated_at = now()
    where telegram_id = p_telegram_id;

  return jsonb_build_object('ok', true, 'boostedUntil', v_boosted_until);
end;
$$;

revoke all on function public.activate_dating_boost(bigint, integer)
  from public, anon, authenticated;
grant execute on function public.activate_dating_boost(bigint, integer)
  to service_role;

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
  v_current_boosted_until timestamptz;
  v_base timestamptz;
  v_boosted_until timestamptz;
begin
  select last_free_boost_at, boosted_until
    into v_last, v_current_boosted_until
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

  -- Тот же принцип, что и в activate_dating_boost: бесплатный
  -- еженедельный буст добавляется поверх уже активного платного/
  -- бесплатного буста, а не сбрасывает его.
  v_base := greatest(now(), coalesce(v_current_boosted_until, now()));
  v_boosted_until := v_base + interval '30 minutes';

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
