-- Account deletion for standalone iOS (Supabase Auth) users.
--
-- Apple App Review Guideline 5.1.1(v): any app that lets a user create
-- an account must also let them delete it from within the app. The
-- Capacitor build supports email/password and Sign in with Apple
-- account creation (see AuthScreen in app/page.tsx), so this closes
-- that gap.
--
-- Telegram Mini App users never hit this at all — they don't have a
-- Supabase Auth account to delete (see lib/server/telegram-auth.ts,
-- authMethod "telegram" vs "supabase").
--
-- Design: don't hard-delete the profiles row. If the account is
-- paired, hard-deleting could either cascade in ways that damage the
-- partner's side of the pair or violate foreign keys we don't fully
-- control from this migration file (pairs/pair_id relationships were
-- created before this repo's incremental-migration convention
-- started, so their exact FK actions aren't visible here). Instead:
-- anonymize the identifying fields and detach auth_user_id, then the
-- caller deletes the actual auth.users row via the admin API — that's
-- the real "account", the thing that lets someone sign back in. The
-- partner (if any) keeps seeing a pair with an anonymized ex-member
-- instead of a broken reference.
create or replace function public.delete_own_account(
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_telegram_id bigint;
begin
  if p_auth_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid-auth-user-id');
  end if;

  select telegram_id into v_telegram_id
    from public.profiles
    where auth_user_id = p_auth_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'profile-not-found');
  end if;

  update public.profiles
    set
      auth_user_id = null,
      first_name = 'Deleted user',
      username = null,
      photo_url = null
    where auth_user_id = p_auth_user_id;

  return jsonb_build_object('ok', true, 'telegramId', v_telegram_id);
end;
$$;

revoke all on function public.delete_own_account(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_own_account(uuid)
  to service_role;
