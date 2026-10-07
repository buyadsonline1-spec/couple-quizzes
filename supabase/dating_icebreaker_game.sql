-- Айсбрейкер "Это или то" прямо в чате Знакомств — после мэтча люди
-- часто теряются и не пишут первыми; лёгкая игра на 6 раундов даёт
-- повод начать без неловкости первого сообщения. Оба участника мэтча
-- отвечают в своём темпе (как и pair_quiz_duel/вопрос дня — не
-- обязательно быть в сети одновременно), совпадения показываются
-- сразу, как только ответили оба. Текст вопросов — на клиенте
-- (DATING_ICEBREAKER_QUESTIONS в app/page.tsx), сервер хранит только
-- индексы и сами ответы (0/1 — бинарный выбор, не 4 варианта, как в
-- квиз-дуэли пары).
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

-- ============================================================
-- 1. Таблицы
-- ============================================================

create table if not exists public.dating_icebreaker_games (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.dating_matches(id) on delete cascade,
  pool_indices integer[] not null,
  created_at timestamptz not null default now()
);

create index if not exists dating_icebreaker_games_match_idx
  on public.dating_icebreaker_games (match_id, created_at desc);

create table if not exists public.dating_icebreaker_answers (
  game_id uuid not null references public.dating_icebreaker_games(id) on delete cascade,
  telegram_id bigint not null,
  question_position integer not null,
  answer_index integer not null,
  created_at timestamptz not null default now(),
  primary key (game_id, telegram_id, question_position)
);

alter table public.dating_icebreaker_games enable row level security;
alter table public.dating_icebreaker_answers enable row level security;
-- Без policy: deny-by-default, как и у остальных dating_*/pair_quiz_duel*
-- таблиц. Читать/писать только через RPC.

-- ============================================================
-- 2. start_dating_icebreaker — как start_pair_quiz_duel, но scoped по
--    match_id вместо pair_id, и проверяет, что звонящий реально
--    участник этого мэтча (иначе мог бы запустить/подсмотреть чужую
--    игру, зная только match_id).
-- ============================================================

create or replace function public.start_dating_icebreaker(
  p_telegram_id bigint,
  p_match_id uuid,
  p_pool_size integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
  v_game record;
  v_answered_positions integer;
  v_pool_indices integer[];
  v_idx integer;
begin
  if p_pool_size is null or p_pool_size < 6 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-pool-size');
  end if;

  select * into v_match
    from public.dating_matches
    where id = p_match_id
      and (user_low_telegram_id = p_telegram_id or user_high_telegram_id = p_telegram_id);

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'match-not-found');
  end if;

  select * into v_game
    from public.dating_icebreaker_games
    where match_id = p_match_id
    order by created_at desc
    limit 1;

  if found then
    select count(*) into v_answered_positions
      from (
        select question_position
        from public.dating_icebreaker_answers
        where game_id = v_game.id
        group by question_position
        having count(distinct telegram_id) = 2
      ) done;

    if v_answered_positions < array_length(v_game.pool_indices, 1) then
      return jsonb_build_object(
        'ok', true, 'gameId', v_game.id, 'poolIndices', to_jsonb(v_game.pool_indices)
      );
    end if;
  end if;

  v_pool_indices := '{}';
  while array_length(v_pool_indices, 1) is null or array_length(v_pool_indices, 1) < 6 loop
    v_idx := floor(random() * p_pool_size)::integer;
    if not (v_idx = any(v_pool_indices)) then
      v_pool_indices := array_append(v_pool_indices, v_idx);
    end if;
  end loop;

  insert into public.dating_icebreaker_games (match_id, pool_indices)
  values (p_match_id, v_pool_indices)
  returning id into v_game;

  return jsonb_build_object('ok', true, 'gameId', v_game.id, 'poolIndices', to_jsonb(v_pool_indices));
end;
$$;

revoke all on function public.start_dating_icebreaker(bigint, uuid, integer) from public, anon, authenticated;
grant execute on function public.start_dating_icebreaker(bigint, uuid, integer) to service_role;

-- ============================================================
-- 3. submit_dating_icebreaker_answer — 0/1 (это или то), immutable,
--    тот же анти-чит принцип, что и у pair_quiz_duel.
-- ============================================================

create or replace function public.submit_dating_icebreaker_answer(
  p_telegram_id bigint,
  p_game_id uuid,
  p_question_position integer,
  p_answer_index integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game record;
  v_match record;
  v_existing record;
  v_partner_telegram_id bigint;
  v_partner_answer record;
begin
  if p_answer_index is null or p_answer_index not in (0, 1) then
    return jsonb_build_object('ok', false, 'reason', 'invalid-answer');
  end if;

  select * into v_game from public.dating_icebreaker_games where id = p_game_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'game-not-found');
  end if;

  select * into v_match
    from public.dating_matches
    where id = v_game.match_id
      and (user_low_telegram_id = p_telegram_id or user_high_telegram_id = p_telegram_id);

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'match-not-found');
  end if;

  if p_question_position < 0 or p_question_position >= array_length(v_game.pool_indices, 1) then
    return jsonb_build_object('ok', false, 'reason', 'invalid-position');
  end if;

  select * into v_existing
    from public.dating_icebreaker_answers
    where game_id = p_game_id and telegram_id = p_telegram_id and question_position = p_question_position;

  if found and v_existing.answer_index <> p_answer_index then
    return jsonb_build_object('ok', false, 'reason', 'answer-locked');
  end if;

  if not found then
    insert into public.dating_icebreaker_answers (game_id, telegram_id, question_position, answer_index)
    values (p_game_id, p_telegram_id, p_question_position, p_answer_index);
  end if;

  v_partner_telegram_id := case
    when v_match.user_low_telegram_id = p_telegram_id then v_match.user_high_telegram_id
    else v_match.user_low_telegram_id
  end;

  select * into v_partner_answer
    from public.dating_icebreaker_answers
    where game_id = p_game_id
      and telegram_id = v_partner_telegram_id
      and question_position = p_question_position;

  if found then
    return jsonb_build_object(
      'ok', true,
      'waitingForPartner', false,
      'myAnswerIndex', p_answer_index,
      'partnerAnswerIndex', v_partner_answer.answer_index
    );
  end if;

  return jsonb_build_object('ok', true, 'waitingForPartner', true, 'myAnswerIndex', p_answer_index);
end;
$$;

revoke all on function public.submit_dating_icebreaker_answer(bigint, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.submit_dating_icebreaker_answer(bigint, uuid, integer, integer) to service_role;

-- ============================================================
-- 4. get_dating_icebreaker_state — полное состояние игры.
-- ============================================================

create or replace function public.get_dating_icebreaker_state(
  p_telegram_id bigint,
  p_game_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game record;
  v_match record;
  v_partner_telegram_id bigint;
  v_positions jsonb;
begin
  select * into v_game from public.dating_icebreaker_games where id = p_game_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'game-not-found');
  end if;

  select * into v_match
    from public.dating_matches
    where id = v_game.match_id
      and (user_low_telegram_id = p_telegram_id or user_high_telegram_id = p_telegram_id);

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'match-not-found');
  end if;

  v_partner_telegram_id := case
    when v_match.user_low_telegram_id = p_telegram_id then v_match.user_high_telegram_id
    else v_match.user_low_telegram_id
  end;

  select coalesce(jsonb_agg(
      jsonb_build_object(
        'position', pos,
        'myAnswerIndex', (
          select a.answer_index from public.dating_icebreaker_answers a
          where a.game_id = p_game_id and a.telegram_id = p_telegram_id and a.question_position = pos
        ),
        'partnerAnswerIndex', (
          select a.answer_index from public.dating_icebreaker_answers a
          where a.game_id = p_game_id and a.telegram_id = v_partner_telegram_id and a.question_position = pos
        )
      )
      order by pos
    ), '[]'::jsonb)
    into v_positions
    from generate_series(0, array_length(v_game.pool_indices, 1) - 1) as pos;

  return jsonb_build_object(
    'ok', true,
    'gameId', v_game.id,
    'poolIndices', to_jsonb(v_game.pool_indices),
    'positions', v_positions
  );
end;
$$;

revoke all on function public.get_dating_icebreaker_state(bigint, uuid) from public, anon, authenticated;
grant execute on function public.get_dating_icebreaker_state(bigint, uuid) to service_role;
