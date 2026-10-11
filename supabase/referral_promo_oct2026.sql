-- Акция "Пригласи 3 друзей — получи Premium на месяц" — разовая,
-- 11-25 октября 2026 (Europe/Helsinki, оба дня включительно).
-- Опирается на существующую реферальную систему (public.referrals,
-- см. referrals_lockdown_and_fix.sql): друг уже считается
-- "приглашённым" в этой таблице, как только откроет приложение по
-- ссылке/введёт код. Для акции этого мало — нужно, чтобы приглашённый
-- реально прошёл хотя бы один тест или опрос, иначе любой мог бы
-- получить Premium, просто попросив 3 человек once ткнуть по ссылке и
-- сразу выйти. Проверяем это через public.activity_point_claims
-- (reward_key вида 'test:%'/'poll:%' — пишется в award_activity_points
-- при реальном прохождении, см. app/api/activity/award).
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

-- ============================================================
-- 1. referral_promo_claims — идемпотентность: эта акция выдаётся
--    каждому пользователю РОВНО один раз (одна PK-строка на
--    telegram_id). Сам грант Premium (апдейт public.subscriptions)
--    делает API route после успешного вызова claim-функции ниже —
--    так же, как уже устроено в app/api/check-free-premium.
-- ============================================================

create table if not exists public.referral_promo_claims (
  telegram_id bigint primary key,
  qualified_count integer not null,
  claimed_at timestamptz not null default now()
);

alter table public.referral_promo_claims enable row level security;
-- Без policy: deny-by-default, как и у остальных claims-таблиц в
-- проекте. Читать/писать только через RPC.

-- ============================================================
-- 2. get_referral_promo_progress — read-only, сколько друзей уже
--    "засчитались" (приглашены в окне акции И прошли тест/опрос) и
--    забрана ли уже награда.
-- ============================================================

create or replace function public.get_referral_promo_progress(
  p_telegram_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qualified_count integer;
  v_claimed boolean;
begin
  select count(*) into v_qualified_count
    from public.referrals r
    where r.inviter_telegram_id = p_telegram_id
      and (r.created_at at time zone 'Europe/Helsinki')::date
        between date '2026-10-11' and date '2026-10-25'
      and exists (
        select 1 from public.activity_point_claims apc
        where apc.telegram_id = r.invited_telegram_id
          and (apc.reward_key like 'test:%' or apc.reward_key like 'poll:%')
      );

  select exists (
    select 1 from public.referral_promo_claims
    where telegram_id = p_telegram_id
  ) into v_claimed;

  return jsonb_build_object(
    'ok', true,
    'qualifiedCount', v_qualified_count,
    'requiredCount', 3,
    'claimed', v_claimed,
    'promoStart', '2026-10-11',
    'promoEnd', '2026-10-25'
  );
end;
$$;

revoke all on function public.get_referral_promo_progress(bigint) from public, anon, authenticated;
grant execute on function public.get_referral_promo_progress(bigint) to service_role;

-- ============================================================
-- 3. claim_referral_promo_premium — проверяет условие ещё раз
--    (никогда не доверяем клиенту) и атомарно фиксирует клейм через
--    PK referral_promo_claims(telegram_id). Сам грант Premium делает
--    API route ПОСЛЕ успешного 'ok':true отсюда.
-- ============================================================

create or replace function public.claim_referral_promo_premium(
  p_telegram_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qualified_count integer;
  v_claim_id bigint;
begin
  if not exists (select 1 from public.profiles where telegram_id = p_telegram_id) then
    return jsonb_build_object('ok', false, 'reason', 'profile-not-found');
  end if;

  select count(*) into v_qualified_count
    from public.referrals r
    where r.inviter_telegram_id = p_telegram_id
      and (r.created_at at time zone 'Europe/Helsinki')::date
        between date '2026-10-11' and date '2026-10-25'
      and exists (
        select 1 from public.activity_point_claims apc
        where apc.telegram_id = r.invited_telegram_id
          and (apc.reward_key like 'test:%' or apc.reward_key like 'poll:%')
      );

  if v_qualified_count < 3 then
    return jsonb_build_object(
      'ok', false,
      'reason', 'not-enough',
      'qualifiedCount', v_qualified_count,
      'requiredCount', 3
    );
  end if;

  insert into public.referral_promo_claims (telegram_id, qualified_count)
  values (p_telegram_id, v_qualified_count)
  on conflict (telegram_id) do nothing
  returning telegram_id into v_claim_id;

  if v_claim_id is null then
    return jsonb_build_object('ok', false, 'reason', 'already-claimed');
  end if;

  return jsonb_build_object('ok', true, 'qualifiedCount', v_qualified_count);
end;
$$;

revoke all on function public.claim_referral_promo_premium(bigint) from public, anon, authenticated;
grant execute on function public.claim_referral_promo_premium(bigint) to service_role;
