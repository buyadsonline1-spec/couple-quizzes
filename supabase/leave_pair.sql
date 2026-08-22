-- "Leave pair" — lets a user dissolve their current pair from the app
-- (Pair screen), requested alongside account deletion while polishing
-- the standalone iOS build.
--
-- Design: does NOT hard-delete the pairs row. Several tables
-- reference pairs(id) with "on delete cascade" that are visible in
-- this repo's incremental migrations (ai_psychologist,
-- daily_pair_question_server_side), but the original pairs/profiles
-- schema predates this repo's migration convention, so there may be
-- others not visible here (pair poll answers, weekly leaderboard,
-- wheel spins, etc.) whose FK behavior isn't known from this file.
-- Hard-deleting risks either an FK violation (if some reference has
-- no cascade) or silently wiping history no one asked to wipe. So:
-- unlink both partners' profiles.pair_id and leave the pairs row
-- itself in place, orphaned. Nothing points to it as "current"
-- anymore, both users can freely create/join a new pair, and no
-- existing FK relationship anywhere is touched.
create or replace function public.leave_pair(
  p_telegram_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair_id uuid;
  v_partner_1 bigint;
  v_partner_2 bigint;
begin
  select pair_id into v_pair_id
    from public.profiles
    where telegram_id = p_telegram_id
    for update;

  if v_pair_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not-in-pair');
  end if;

  select partner_1_telegram_id, partner_2_telegram_id
    into v_partner_1, v_partner_2
    from public.pairs
    where id = v_pair_id
    for update;

  update public.profiles
    set pair_id = null
    where telegram_id in (v_partner_1, v_partner_2);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.leave_pair(bigint)
  from public, anon, authenticated;
grant execute on function public.leave_pair(bigint)
  to service_role;
