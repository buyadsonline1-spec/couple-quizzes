-- Раньше /api/poll/submit молча отклонял ответ без reason:"no-pair",
-- если у пользователя ещё не было пары — ответ терялся навсегда,
-- потому что почти никто не проходит опрос повторно после создания
-- пары. Теперь ответы сохраняются всегда (pair_id может быть null), а
-- create_pair/join_pair при появлении пары подтягивают уже
-- существующие "ничейные" ответы каждого участника задним числом —
-- иначе они так и остались бы лежать с pair_id = null навсегда, и
-- совместимость по ним всё равно не считалась бы.

-- 1. pair_id должен допускать null — на случай, если изначально
--    колонка была создана как NOT NULL (эта таблица создавалась до
--    того, как в репозитории появилась практика трекать миграции, так
--    что текущее состояние констрейнта не видно из кода).
alter table public.poll_submissions
  alter column pair_id drop not null;

-- 2. create_pair — при создании пары подтягиваем уже существующие
--    "ничейные" ответы создателя.
create or replace function public.create_pair(
  p_telegram_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_profile record;
  v_pair_id uuid;
  v_invite_code text;
  v_attempt integer := 0;
begin
  select telegram_id, pair_id
    into v_profile
    from public.profiles
    where telegram_id = p_telegram_id
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'profile-not-found');
  end if;

  if v_profile.pair_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'already-in-pair');
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
        v_invite_code, p_telegram_id, p_telegram_id, null
      )
      returning id into v_pair_id;

      exit;
    exception when unique_violation then
      if v_attempt >= 5 then
        return jsonb_build_object('ok', false, 'reason', 'invite-code-collision');
      end if;
    end;
  end loop;

  update public.profiles
     set pair_id = v_pair_id
   where telegram_id = p_telegram_id;

  -- Подтягиваем ответы, пройденные до создания пары.
  update public.poll_submissions
     set pair_id = v_pair_id
   where telegram_id = p_telegram_id
     and pair_id is null;

  return jsonb_build_object(
    'ok', true,
    'pairId', v_pair_id,
    'inviteCode', v_invite_code
  );
end;
$$;

revoke all on function public.create_pair(bigint)
  from public, anon, authenticated;
grant execute on function public.create_pair(bigint)
  to service_role;

-- 3. join_pair — при подключении по коду подтягиваем "ничейные"
--    ответы присоединяющегося.
create or replace function public.join_pair(
  p_telegram_id bigint,
  p_invite_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_pair_id uuid;
  v_partner_1 bigint;
  v_partner_2 bigint;
  v_normalized_code text;
begin
  if p_invite_code is null or length(trim(p_invite_code)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-code');
  end if;

  v_normalized_code := upper(trim(p_invite_code));

  select telegram_id, pair_id
    into v_profile
    from public.profiles
    where telegram_id = p_telegram_id
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'profile-not-found');
  end if;

  if v_profile.pair_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'already-in-pair');
  end if;

  select id, partner_1_telegram_id, partner_2_telegram_id
    into v_pair_id, v_partner_1, v_partner_2
    from public.pairs
    where invite_code = v_normalized_code
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid-code');
  end if;

  if v_partner_1 = p_telegram_id or v_partner_2 = p_telegram_id then
    return jsonb_build_object('ok', false, 'reason', 'self-join');
  end if;

  if v_partner_2 is not null then
    return jsonb_build_object('ok', false, 'reason', 'pair-full');
  end if;

  update public.pairs
     set partner_2_telegram_id = p_telegram_id
   where id = v_pair_id;

  update public.profiles
     set pair_id = v_pair_id
   where telegram_id = p_telegram_id;

  -- Подтягиваем ответы, пройденные до присоединения к паре.
  update public.poll_submissions
     set pair_id = v_pair_id
   where telegram_id = p_telegram_id
     and pair_id is null;

  return jsonb_build_object('ok', true, 'pairId', v_pair_id);
end;
$$;

revoke all on function public.join_pair(bigint, text)
  from public, anon, authenticated;
grant execute on function public.join_pair(bigint, text)
  to service_role;
