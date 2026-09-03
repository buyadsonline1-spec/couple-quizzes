-- Знакомства открываются всем пользователям (раньше был Premium-only
-- вход целиком). Свободный тариф:
--   * 5 свайпов (анкет) в день без Premium — дальше пэйвол;
--   * общение (переписка) после взаимного лайка — только Premium,
--     независимо от лимита свайпов (проверяется в TS, checkIsPremium,
--     см. app/api/dating/messages/send и /list).
-- Premium снимает дневной лимит свайпов полностью.
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

-- ============================================================
-- 1. record_dating_swipe — добавлен p_is_premium + проверка дневного
--    лимита ДО записи свайпа. Уже свайпнутая ранее пара не считается
--    повторно (idempotent-ретраи с клиента не должны съедать лимит).
--    Дата — по Europe/Helsinki, как и everywhere else в этом проекте
--    (wheel_spins, daily_bonus и т.д.).
-- ============================================================

create or replace function public.record_dating_swipe(
  p_from_telegram_id bigint,
  p_to_telegram_id bigint,
  p_action text,
  p_is_premium boolean default false
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

  if not v_already_swiped and not p_is_premium then
    v_today := (now() at time zone 'Europe/Helsinki')::date;

    select count(*) into v_swipes_today
      from public.dating_swipes
      where from_telegram_id = p_from_telegram_id
        and (created_at at time zone 'Europe/Helsinki')::date = v_today;

    if v_swipes_today >= 5 then
      return jsonb_build_object('ok', false, 'reason', 'daily-limit-reached');
    end if;
  end if;

  insert into public.dating_swipes (from_telegram_id, to_telegram_id, action)
  values (p_from_telegram_id, p_to_telegram_id, p_action)
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

-- Старая 3-аргументная сигнатура убирается явно — иначе она осталась
-- бы висеть без проверки лимита как обходной путь.
drop function if exists public.record_dating_swipe(bigint, bigint, text);

revoke all on function public.record_dating_swipe(bigint, bigint, text, boolean)
  from public, anon, authenticated;
grant execute on function public.record_dating_swipe(bigint, bigint, text, boolean)
  to service_role;

create index if not exists dating_swipes_from_created_idx
  on public.dating_swipes (from_telegram_id, created_at);

-- ============================================================
-- 2. get_dating_swipes_today — сколько анкет уже свайпнуто сегодня,
--    той же логикой день/таймзона, что и в самом лимите выше. Нужна
--    клиенту только для отображения "осталось X сегодня" в UI —
--    источник истины при реальном свайпе всё равно RPC выше.
-- ============================================================

create or replace function public.get_dating_swipes_today(
  p_telegram_id bigint
)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
    from public.dating_swipes
    where from_telegram_id = p_telegram_id
      and (created_at at time zone 'Europe/Helsinki')::date =
          (now() at time zone 'Europe/Helsinki')::date;
$$;

revoke all on function public.get_dating_swipes_today(bigint)
  from public, anon, authenticated;
grant execute on function public.get_dating_swipes_today(bigint)
  to service_role;
