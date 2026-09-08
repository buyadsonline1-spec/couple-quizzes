-- "Предложить пару" из мэтча в Знакомствах. Идея: два человека уже
-- понравились друг другу и переписываются — вместо того чтобы отдельно
-- создавать пару и слать код приглашения вручную, один нажимает кнопку
-- прямо в чате, а второй видит предложение в разделе "Пара" и может
-- принять или отклонить.
--
-- Один активный (pending) proposal на мэтч — повторное предложение
-- после отказа перезаписывает предыдущую запись (see on conflict).
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

create table if not exists public.dating_pair_proposals (
  match_id uuid primary key
    references public.dating_matches(id) on delete cascade,
  from_telegram_id bigint not null
    references public.profiles(telegram_id) on delete cascade,
  to_telegram_id bigint not null
    references public.profiles(telegram_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (from_telegram_id <> to_telegram_id)
);

alter table public.dating_pair_proposals enable row level security;
-- Без policy: deny-by-default, доступ только через RPC (service_role).

-- ============================================================
-- 1. propose_dating_pair — предложить создать пару. Отклоняется, если
--    любая из сторон уже состоит в паре (пара в этом приложении — одна
--    на профиль), или если уже есть pending-предложение по этому мэтчу.
-- ============================================================

create or replace function public.propose_dating_pair(
  p_match_id uuid,
  p_from_telegram_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
  v_to_telegram_id bigint;
  v_from_pair_id uuid;
  v_to_pair_id uuid;
begin
  select * into v_match
    from public.dating_matches
    where id = p_match_id
      and (user_low_telegram_id = p_from_telegram_id or user_high_telegram_id = p_from_telegram_id);

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not-in-match');
  end if;

  v_to_telegram_id := case
    when v_match.user_low_telegram_id = p_from_telegram_id then v_match.user_high_telegram_id
    else v_match.user_low_telegram_id
  end;

  select pair_id into v_from_pair_id from public.profiles where telegram_id = p_from_telegram_id;
  select pair_id into v_to_pair_id from public.profiles where telegram_id = v_to_telegram_id;

  if v_from_pair_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'self-already-paired');
  end if;

  if v_to_pair_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'partner-already-paired');
  end if;

  insert into public.dating_pair_proposals (match_id, from_telegram_id, to_telegram_id, status, created_at, responded_at)
  values (p_match_id, p_from_telegram_id, v_to_telegram_id, 'pending', now(), null)
  on conflict (match_id) do update set
    from_telegram_id = excluded.from_telegram_id,
    to_telegram_id = excluded.to_telegram_id,
    status = 'pending',
    created_at = now(),
    responded_at = null;

  return jsonb_build_object('ok', true, 'toTelegramId', v_to_telegram_id);
end;
$$;

revoke all on function public.propose_dating_pair(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.propose_dating_pair(uuid, bigint)
  to service_role;

-- ============================================================
-- 2. respond_dating_pair_proposal — принять/отклонить. Принятие
--    создаёт пару сразу с двумя участниками (в отличие от обычного
--    create_pair+join_pair — тут оба telegram_id уже известны, не
--    нужен код приглашения).
-- ============================================================

create or replace function public.respond_dating_pair_proposal(
  p_match_id uuid,
  p_telegram_id bigint,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_proposal record;
  v_from_profile record;
  v_to_profile record;
  v_pair_id uuid;
  v_invite_code text;
  v_attempt integer := 0;
begin
  select * into v_proposal
    from public.dating_pair_proposals
    where match_id = p_match_id
      and to_telegram_id = p_telegram_id
      and status = 'pending'
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no-pending-proposal');
  end if;

  if not p_accept then
    update public.dating_pair_proposals
      set status = 'declined', responded_at = now()
      where match_id = p_match_id;

    return jsonb_build_object('ok', true, 'accepted', false);
  end if;

  select telegram_id, pair_id into v_from_profile
    from public.profiles where telegram_id = v_proposal.from_telegram_id for update;
  select telegram_id, pair_id into v_to_profile
    from public.profiles where telegram_id = v_proposal.to_telegram_id for update;

  if v_from_profile.pair_id is not null or v_to_profile.pair_id is not null then
    update public.dating_pair_proposals
      set status = 'declined', responded_at = now()
      where match_id = p_match_id;

    return jsonb_build_object('ok', false, 'reason', 'already-paired');
  end if;

  loop
    v_attempt := v_attempt + 1;

    select upper(
      string_agg(
        substr(
          '0123456789abcdefghijklmnopqrstuvwxyz',
          1 + (get_byte(gen_random_bytes(1), 0) % 36),
          1
        ),
        ''
      )
    )
      into v_invite_code
      from generate_series(1, 6);

    begin
      insert into public.pairs (
        invite_code, created_by_telegram_id, partner_1_telegram_id, partner_2_telegram_id
      ) values (
        v_invite_code, v_proposal.from_telegram_id, v_proposal.from_telegram_id, v_proposal.to_telegram_id
      )
      returning id into v_pair_id;

      exit;
    exception when unique_violation then
      if v_attempt >= 5 then
        return jsonb_build_object('ok', false, 'reason', 'invite-code-collision');
      end if;
    end;
  end loop;

  update public.profiles set pair_id = v_pair_id
    where telegram_id in (v_proposal.from_telegram_id, v_proposal.to_telegram_id);

  update public.dating_pair_proposals
    set status = 'accepted', responded_at = now()
    where match_id = p_match_id;

  return jsonb_build_object('ok', true, 'accepted', true, 'pairId', v_pair_id);
end;
$$;

revoke all on function public.respond_dating_pair_proposal(uuid, bigint, boolean)
  from public, anon, authenticated;
grant execute on function public.respond_dating_pair_proposal(uuid, bigint, boolean)
  to service_role;

-- ============================================================
-- 3. get_dating_pair_proposal — статус предложения для конкретного
--    мэтча (баннер в чате: ничего / я предложил, жду / мне предложили).
-- ============================================================

create or replace function public.get_dating_pair_proposal(
  p_match_id uuid,
  p_telegram_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal record;
begin
  select * into v_proposal
    from public.dating_pair_proposals
    where match_id = p_match_id
      and (from_telegram_id = p_telegram_id or to_telegram_id = p_telegram_id);

  if not found then
    return jsonb_build_object('ok', true, 'proposal', null);
  end if;

  return jsonb_build_object(
    'ok', true,
    'proposal', jsonb_build_object(
      'status', v_proposal.status,
      'isProposer', v_proposal.from_telegram_id = p_telegram_id
    )
  );
end;
$$;

revoke all on function public.get_dating_pair_proposal(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.get_dating_pair_proposal(uuid, bigint)
  to service_role;

-- ============================================================
-- 4. get_incoming_dating_pair_proposals — для экрана "Пара": входящие
--    pending-предложения с именем/фото автора.
-- ============================================================

create or replace function public.get_incoming_dating_pair_proposals(
  p_telegram_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return jsonb_build_object(
    'ok', true,
    'proposals', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'matchId', p.match_id,
            'fromTelegramId', p.from_telegram_id,
            'fromDisplayName', dp.display_name,
            'fromPhotoUrl', dp.photo_url,
            'createdAt', p.created_at
          )
          order by p.created_at desc
        )
        from public.dating_pair_proposals p
        join public.dating_profiles dp on dp.telegram_id = p.from_telegram_id
        where p.to_telegram_id = p_telegram_id
          and p.status = 'pending'
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.get_incoming_dating_pair_proposals(bigint)
  from public, anon, authenticated;
grant execute on function public.get_incoming_dating_pair_proposals(bigint)
  to service_role;
