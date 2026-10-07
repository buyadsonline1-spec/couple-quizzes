-- "Кто кого знает лучше?" — квиз-дуэль на двоих, заменяет в списке игр
-- "90 вопросов" (сам экран/контент старой игры не удалены, см.
-- app/page.tsx). 6 вопросов за раунд, оба партнёра отвечают в своём
-- темпе (не обязательно одновременно онлайн — как и Daily Pair
-- Question), после того как ответили ОБА на конкретный вопрос —
-- показывается совпал выбор или нет. Текст вопросов/вариантов живёт
-- на клиенте (SYNC_QUIZ_QUESTIONS в app/page.tsx), сервер хранит
-- только индексы вопросов в пуле и сами ответы — тот же принцип, что
-- и у вопроса дня (детерминированный индекс вместо хранения текста).
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

-- ============================================================
-- 1. Таблицы
-- ============================================================

create table if not exists public.pair_quiz_duels (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.pairs(id) on delete cascade,
  pool_indices integer[] not null,
  created_at timestamptz not null default now()
);

create index if not exists pair_quiz_duels_pair_idx
  on public.pair_quiz_duels (pair_id, created_at desc);

create table if not exists public.pair_quiz_duel_answers (
  duel_id uuid not null references public.pair_quiz_duels(id) on delete cascade,
  telegram_id bigint not null,
  question_position integer not null,
  answer_index integer not null,
  created_at timestamptz not null default now(),
  primary key (duel_id, telegram_id, question_position)
);

alter table public.pair_quiz_duels enable row level security;
alter table public.pair_quiz_duel_answers enable row level security;
-- Без policy: deny-by-default для anon/authenticated, как и у
-- wheel_spins/pair_reward_claims. Читать/писать только через RPC.

-- ============================================================
-- 2. start_pair_quiz_duel — возвращает текущий незавершённый дуэль
--    пары или создаёт новый, если предыдущего нет или он уже
--    полностью пройден обоими. p_pool_size — сколько вопросов всего
--    в клиентском пуле (SYNC_QUIZ_QUESTIONS.length) — сервер сам,
--    случайно и без повторов, выбирает из него 6 индексов, чтобы
--    клиент не мог "подсмотреть" заранее серию вопросов партнёра.
-- ============================================================

create or replace function public.start_pair_quiz_duel(
  p_telegram_id bigint,
  p_pool_size integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair_id uuid;
  v_duel record;
  v_answered_positions integer;
  v_pool_indices integer[];
  v_idx integer;
begin
  if p_pool_size is null or p_pool_size < 6 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-pool-size');
  end if;

  select pair_id into v_pair_id from public.profiles where telegram_id = p_telegram_id;

  if v_pair_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no-pair');
  end if;

  select * into v_duel
    from public.pair_quiz_duels
    where pair_id = v_pair_id
    order by created_at desc
    limit 1;

  if found then
    -- "Завершён" = по каждой из 6 позиций есть ОБА ответа (2 участника).
    select count(*) into v_answered_positions
      from (
        select question_position
        from public.pair_quiz_duel_answers
        where duel_id = v_duel.id
        group by question_position
        having count(distinct telegram_id) = 2
      ) done;

    if v_answered_positions < array_length(v_duel.pool_indices, 1) then
      return jsonb_build_object(
        'ok', true, 'duelId', v_duel.id, 'poolIndices', to_jsonb(v_duel.pool_indices)
      );
    end if;
  end if;

  -- Новый дуэль — 6 уникальных случайных индексов 0..p_pool_size-1.
  v_pool_indices := '{}';
  while array_length(v_pool_indices, 1) is null or array_length(v_pool_indices, 1) < 6 loop
    v_idx := floor(random() * p_pool_size)::integer;
    if not (v_idx = any(v_pool_indices)) then
      v_pool_indices := array_append(v_pool_indices, v_idx);
    end if;
  end loop;

  insert into public.pair_quiz_duels (pair_id, pool_indices)
  values (v_pair_id, v_pool_indices)
  returning id into v_duel;

  return jsonb_build_object('ok', true, 'duelId', v_duel.id, 'poolIndices', to_jsonb(v_pool_indices));
end;
$$;

revoke all on function public.start_pair_quiz_duel(bigint, integer) from public, anon, authenticated;
grant execute on function public.start_pair_quiz_duel(bigint, integer) to service_role;

-- ============================================================
-- 3. submit_pair_quiz_duel_answer — один ответ на одну позицию,
--    immutable (повторно тем же ответом — ок, другим — ошибка
--    'answer-locked', тот же античит-принцип, что и у вопроса дня).
--    Возвращает ответ партнёра по этой же позиции, если он уже есть
--    (для мгновенного reveal), иначе waiting_for_partner.
-- ============================================================

create or replace function public.submit_pair_quiz_duel_answer(
  p_telegram_id bigint,
  p_duel_id uuid,
  p_question_position integer,
  p_answer_index integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair_id uuid;
  v_duel record;
  v_existing record;
  -- Явно типизированные переменные: select ... into <typed var> делает
  -- assignment cast, а прямое сравнение record.field = bigint-параметр
  -- падает с "operator does not exist: text = bigint", т.к. реальный
  -- тип partner_1_telegram_id/partner_2_telegram_id в БД — text (см.
  -- тот же приём в daily_pair_question_server_side.sql).
  v_partner_1_telegram_id bigint;
  v_partner_2_telegram_id bigint;
  v_partner_telegram_id bigint;
  v_partner_answer record;
begin
  if p_answer_index is null or p_answer_index < 0 or p_answer_index > 3 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-answer');
  end if;

  select pair_id into v_pair_id from public.profiles where telegram_id = p_telegram_id;
  if v_pair_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no-pair');
  end if;

  select * into v_duel from public.pair_quiz_duels where id = p_duel_id and pair_id = v_pair_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'duel-not-found');
  end if;

  if p_question_position < 0 or p_question_position >= array_length(v_duel.pool_indices, 1) then
    return jsonb_build_object('ok', false, 'reason', 'invalid-position');
  end if;

  select * into v_existing
    from public.pair_quiz_duel_answers
    where duel_id = p_duel_id and telegram_id = p_telegram_id and question_position = p_question_position;

  if found and v_existing.answer_index <> p_answer_index then
    return jsonb_build_object('ok', false, 'reason', 'answer-locked');
  end if;

  if not found then
    insert into public.pair_quiz_duel_answers (duel_id, telegram_id, question_position, answer_index)
    values (p_duel_id, p_telegram_id, p_question_position, p_answer_index);
  end if;

  select partner_1_telegram_id, partner_2_telegram_id
    into v_partner_1_telegram_id, v_partner_2_telegram_id
    from public.pairs
    where id = v_pair_id;

  v_partner_telegram_id :=
    case when v_partner_1_telegram_id = p_telegram_id then v_partner_2_telegram_id else v_partner_1_telegram_id end;

  select * into v_partner_answer
    from public.pair_quiz_duel_answers
    where duel_id = p_duel_id
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

revoke all on function public.submit_pair_quiz_duel_answer(bigint, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.submit_pair_quiz_duel_answer(bigint, uuid, integer, integer) to service_role;

-- ============================================================
-- 4. get_pair_quiz_duel_state — полное состояние дуэля (для poll'инга
--    и восстановления после перезахода): по каждой позиции — мой
--    ответ и ответ партнёра, если уже есть.
-- ============================================================

create or replace function public.get_pair_quiz_duel_state(
  p_telegram_id bigint,
  p_duel_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair_id uuid;
  v_duel record;
  -- См. комментарий в submit_pair_quiz_duel_answer — те же типизированные
  -- переменные вместо прямого сравнения record.field = bigint.
  v_partner_1_telegram_id bigint;
  v_partner_2_telegram_id bigint;
  v_partner_telegram_id bigint;
  v_positions jsonb;
begin
  select pair_id into v_pair_id from public.profiles where telegram_id = p_telegram_id;
  if v_pair_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no-pair');
  end if;

  select * into v_duel from public.pair_quiz_duels where id = p_duel_id and pair_id = v_pair_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'duel-not-found');
  end if;

  select partner_1_telegram_id, partner_2_telegram_id
    into v_partner_1_telegram_id, v_partner_2_telegram_id
    from public.pairs
    where id = v_pair_id;

  v_partner_telegram_id :=
    case when v_partner_1_telegram_id = p_telegram_id then v_partner_2_telegram_id else v_partner_1_telegram_id end;

  select coalesce(jsonb_agg(
      jsonb_build_object(
        'position', pos,
        'myAnswerIndex', (
          select a.answer_index from public.pair_quiz_duel_answers a
          where a.duel_id = p_duel_id and a.telegram_id = p_telegram_id and a.question_position = pos
        ),
        'partnerAnswerIndex', (
          select a.answer_index from public.pair_quiz_duel_answers a
          where a.duel_id = p_duel_id and a.telegram_id = v_partner_telegram_id and a.question_position = pos
        )
      )
      order by pos
    ), '[]'::jsonb)
    into v_positions
    from generate_series(0, array_length(v_duel.pool_indices, 1) - 1) as pos;

  return jsonb_build_object(
    'ok', true,
    'duelId', v_duel.id,
    'poolIndices', to_jsonb(v_duel.pool_indices),
    'positions', v_positions
  );
end;
$$;

revoke all on function public.get_pair_quiz_duel_state(bigint, uuid) from public, anon, authenticated;
grant execute on function public.get_pair_quiz_duel_state(bigint, uuid) to service_role;
