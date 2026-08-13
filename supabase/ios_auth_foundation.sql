-- Phase 1 of the standalone iOS app: auth foundation.
--
-- Design decision (see plan): don't re-key any existing RPC/table to a
-- new identity system — every RPC in this repo takes p_telegram_id
-- bigint and every RLS policy assumes telegram_id is the identity.
-- Instead, non-Telegram (iOS/Supabase Auth) users get a SYNTHETIC
-- NEGATIVE telegram_id. Real Telegram ids are always positive, so a
-- negative bigint can never collide with a real one — every existing
-- RPC, table, and security policy keeps working completely unchanged
-- for both Telegram and iOS users alike.
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском. Требует
-- Supabase Auth включённого в проекте (email/password или magic link,
-- Sign in with Apple, phone OTP — включаются в Supabase Dashboard →
-- Authentication → Providers, отдельно от этого SQL).

-- ============================================================
-- 1. Профиль теперь можно завести двумя способами: через Telegram
--    (telegram_id) или через Supabase Auth (auth_user_id). Ровно один
--    из двух обязателен — второй остаётся null.
-- ============================================================

alter table public.profiles
  add column if not exists auth_user_id uuid null
  references auth.users(id) on delete cascade;

create unique index if not exists profiles_auth_user_id_unique
  on public.profiles (auth_user_id)
  where auth_user_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_identity_present'
  ) then
    alter table public.profiles
      add constraint profiles_identity_present
      check (telegram_id is not null or auth_user_id is not null);
  end if;
end $$;

-- ============================================================
-- 2. Счётчик для минтинга синтетических отрицательных telegram_id —
--    гарантированно уникальные, гарантированно никогда не совпадут с
--    реальным Telegram id (те всегда положительные).
-- ============================================================

create sequence if not exists public.ios_synthetic_telegram_id_seq
  start with 1
  increment by 1;

-- ============================================================
-- 3. bootstrap_profile_from_auth — аналог bootstrap_profile, но для
--    пользователей без Telegram. Идемпотентна: повторный вызов для
--    того же auth_user_id просто возвращает уже существующий профиль,
--    не создаёт новый и не минтит новый synthetic id повторно.
-- ============================================================

create or replace function public.bootstrap_profile_from_auth(
  p_auth_user_id uuid,
  p_display_name text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_synthetic_id bigint;
begin
  if p_auth_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid-auth-user-id');
  end if;

  select * into v_profile
    from public.profiles
    where auth_user_id = p_auth_user_id;

  if found then
    return jsonb_build_object(
      'ok', true,
      'telegramId', v_profile.telegram_id,
      'pairId', v_profile.pair_id,
      'soloPoints', coalesce(v_profile.solo_points, 0),
      'soloWeeklyPoints', coalesce(v_profile.solo_weekly_points, 0),
      'soloWeeklyPointsWeek', v_profile.solo_weekly_points_week
    );
  end if;

  v_synthetic_id := -(nextval('public.ios_synthetic_telegram_id_seq'));

  insert into public.profiles (
    telegram_id, auth_user_id, first_name, username
  ) values (
    v_synthetic_id,
    p_auth_user_id,
    coalesce(nullif(trim(p_display_name), ''), split_part(coalesce(p_email, ''), '@', 1), 'Player'),
    null
  )
  returning * into v_profile;

  return jsonb_build_object(
    'ok', true,
    'telegramId', v_profile.telegram_id,
    'pairId', v_profile.pair_id,
    'soloPoints', coalesce(v_profile.solo_points, 0),
    'soloWeeklyPoints', coalesce(v_profile.solo_weekly_points, 0),
    'soloWeeklyPointsWeek', v_profile.solo_weekly_points_week
  );
end;
$$;

revoke all on function public.bootstrap_profile_from_auth(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.bootstrap_profile_from_auth(uuid, text, text)
  to service_role;
