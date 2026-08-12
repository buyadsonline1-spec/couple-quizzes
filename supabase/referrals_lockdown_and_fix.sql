-- SECURITY FIX + BUG FIX (security-pass, referrals table):
--
-- 1) BUG: claim_referral_reward_points() has been inserting into the
--    legacy nullable column `referrer_telegram_id` instead of the
--    actual NOT NULL column `inviter_telegram_id` — every single
--    referral claim has been failing with a not-null-constraint error
--    in production. Confirmed live (direct RPC call via service_role
--    reproduced the exact error). Fixed to insert into
--    inviter_telegram_id.
--
-- 2) SECURITY: public.referrals was directly insert-able AND fully
--    readable (no row filter) with the public anon key — confirmed
--    live with a disposable test row (insert succeeded with status
--    201, arbitrary reward_points accepted; immediately deleted, no
--    real data touched). Anyone could fabricate fake referral rows or
--    read the full "who invited whom" table. Revoking all direct
--    anon/authenticated access — the only legitimate write path is
--    already the validated claim_referral_reward_points RPC via
--    /api/referral/claim, and reads now go through a new
--    /api/referral/stats server route (service_role, filtered to the
--    calling user's own telegram_id) instead of a direct client query.
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

create or replace function public.claim_referral_reward_points(
  p_referrer_telegram_id bigint,
  p_invited_telegram_id bigint,
  p_week_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_referral_id uuid;

  v_solo_points integer := 0;
  v_solo_weekly_points integer := 0;
begin

  if p_referrer_telegram_id is null
     or p_invited_telegram_id is null then
    raise exception 'Telegram id is required';
  end if;

  if p_referrer_telegram_id = p_invited_telegram_id then
    return jsonb_build_object(
      'ok', false,
      'reason', 'self-referral'
    );
  end if;


  /*
   * Приглашённый пользователь должен реально существовать.
   */
  if not exists (
    select 1
    from public.profiles
    where telegram_id = p_invited_telegram_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'reason', 'invited-profile-not-found'
    );
  end if;


  /*
   * И пригласивший тоже должен существовать.
   */
  if not exists (
    select 1
    from public.profiles
    where telegram_id = p_referrer_telegram_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'reason', 'referrer-profile-not-found'
    );
  end if;


  /*
   * Один приглашённый пользователь может
   * принести награду только один раз.
   *
   * ИСПРАВЛЕНО: раньше писали в referrer_telegram_id (nullable,
   * легаси-колонка) — это всегда падало с not-null constraint на
   * реальной обязательной колонке inviter_telegram_id, которая
   * оставалась NULL. Теперь пишем в правильную колонку.
   */
  insert into public.referrals (
    inviter_telegram_id,
    invited_telegram_id,
    reward_points
  )
  values (
    p_referrer_telegram_id,
    p_invited_telegram_id,
    200
  )
  on conflict (invited_telegram_id)
  do nothing
  returning id into v_referral_id;


  if v_referral_id is null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'already-claimed'
    );
  end if;


  /*
   * +200 только пригласившему.
   *
   * PAIR points не затрагиваем.
   */
  update public.profiles
  set
    solo_points =
      coalesce(solo_points, 0) + 200,

    solo_weekly_points =
      case
        when solo_weekly_points_week = p_week_key
          then coalesce(solo_weekly_points, 0) + 200
        else 200
      end,

    solo_weekly_points_week =
      p_week_key

  where telegram_id =
    p_referrer_telegram_id

  returning
    solo_points,
    solo_weekly_points
  into
    v_solo_points,
    v_solo_weekly_points;


  return jsonb_build_object(
    'ok', true,
    'reason', 'rewarded',
    'reward', 200,
    'soloPoints', v_solo_points,
    'soloWeeklyPoints', v_solo_weekly_points
  );

end;
$function$;

revoke all on function public.claim_referral_reward_points(bigint, bigint, text)
  from public, anon, authenticated;
grant execute on function public.claim_referral_reward_points(bigint, bigint, text)
  to service_role;

-- ============================================================
-- Закрываем прямой доступ анону/authenticated к таблице целиком.
-- ============================================================

revoke all on public.referrals from anon, authenticated;
