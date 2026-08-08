-- Daily Pair Question — переносим ВЕСЬ цикл (ответ + серия + совпадение +
-- начисление) на сервер. Согласовано с ChatGPT после ревью: недостаточно
-- было бы просто перенести начисление бонуса — daily_pair_answers сейчас
-- тоже открыт для anon INSERT/UPDATE, так что "реальные" ответы можно
-- подделать. Поэтому сама отправка ответа тоже идёт через RPC.
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.
-- ВАЖНО: revoke на daily_pair_answers (INSERT/UPDATE от anon/authenticated)
-- делаем ОТДЕЛЬНЫМ шагом (supabase/daily_pair_answers_lockdown.sql) —
-- только после деплоя нового кода и проверки, что всё работает. Иначе
-- старая версия клиента сломается раньше времени.

-- ============================================================
-- 0. daily_pair_answers — гарантируем на уровне БД "один ответ на
--    один день на одного участника пары", а не только логикой RPC.
--    Это отдельная страховка на случай исторических строк ещё с тех
--    пор, когда таблица была открыта для anon (см. ChatGPT-ревью).
--    Идемпотентно: если ограничение уже существует — no-op. Если
--    упадёт с ошибкой про дубликаты — в таблице реально есть
--    задвоенные строки, их нужно сначала вручную почистить.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'daily_pair_answers_pair_date_user_unique'
  ) then
    alter table public.daily_pair_answers
      add constraint daily_pair_answers_pair_date_user_unique
      unique (pair_id, answer_date, telegram_id);
  end if;
end $$;

-- ============================================================
-- 1. pair_reward_claims — аудит/идемпотентность для PAIR-наград.
--    Один reward_key может быть заклеймлен парой ровно один раз
--    за всё время (UNIQUE), это и есть защита от повторной выплаты.
--    Ключи: 'streak:3' | 'streak:5' | 'streak:10' | 'streak:15' |
--    'daily-match:<YYYY-MM-DD>'.
-- ============================================================

create table if not exists public.pair_reward_claims (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.pairs(id) on delete cascade,
  reward_key text not null,
  reward_type text not null,
  reward_points integer not null,
  created_at timestamptz not null default now(),
  unique (pair_id, reward_key)
);

create index if not exists pair_reward_claims_pair_idx
  on public.pair_reward_claims (pair_id);

alter table public.pair_reward_claims enable row level security;
-- Без policy: deny-by-default для anon/authenticated, как и у
-- wheel_spins/wheel_reward_*. Читать/писать только через RPC.

-- ============================================================
-- 2. RPC submit_daily_pair_answer — единственный способ ответить на
--    вопрос дня. Делает под одной блокировкой пары:
--      - проверяет членство в паре;
--      - сам определяет today (Europe/Helsinki) и вопрос дня
--        (детерминированно из даты, как и в клиенте:
--        YYYYMMDD % 7 -> dp1..dp7);
--      - записывает ответ (immutable: повторно тем же ответом — ок,
--        другим ответом — ошибка 'answer-locked', античит против
--        "подсмотрел ответ партнёра и переправил свой");
--      - если партнёр ещё не ответил сегодня — возвращает
--        waiting_for_partner, наград нет;
--      - если оба ответили — считает match (сравнение answer_index
--        обеих реальных строк) и точную серию (recursive CTE, без
--        искусственного лимита), клеймит новые вехи/дневной матч
--        через pair_reward_claims, начисляет PAIR total_points/
--        weekly_points (SOLO не трогаем).
-- ============================================================

create or replace function public.submit_daily_pair_answer(
  p_telegram_id bigint,
  p_answer_index integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;

  -- Явно типизированные переменные вместо record-доступа к полям pairs:
  -- select ... into <typed var> делает assignment cast (безопасно
  -- парсит значение под нужный тип), а прямое сравнение
  -- record.field = bigint-параметр падает с "operator does not exist:
  -- bigint = text", если реальный тип колонки в БД — не bigint.
  v_pair_id uuid;
  v_partner_1_telegram_id bigint;
  v_partner_2_telegram_id bigint;
  v_pair_total_points integer;
  v_pair_weekly_points integer;
  v_pair_weekly_points_week text;

  v_partner_telegram_id bigint;

  v_today date;
  v_question_index integer;
  v_question_id text;

  v_existing_answer record;
  v_partner_answer record;
  v_same_answer boolean;

  v_current_streak integer;
  v_new_milestones integer[] := '{}';
  v_streak_bonus integer := 0;
  v_match_bonus integer := 0;
  v_total_bonus integer;

  v_reward_key text;
  v_reward_points integer;
  v_rows integer;

  v_week_key text;
  v_next_total integer;
  v_next_weekly integer;

  ms integer;
begin
  if p_answer_index is null or p_answer_index < 0 or p_answer_index > 3 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-answer');
  end if;

  -- Лочим профиль, чтобы узнать пару, и саму пару — весь остальной
  -- расчёт идёт под этой блокировкой, конкурентные вызовы от обоих
  -- партнёров сериализуются.
  select telegram_id, pair_id
    into v_profile
    from public.profiles
    where telegram_id = p_telegram_id
    for update;

  if not found or v_profile.pair_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no-pair');
  end if;

  select id, partner_1_telegram_id, partner_2_telegram_id,
         total_points, weekly_points, weekly_points_week
    into v_pair_id, v_partner_1_telegram_id, v_partner_2_telegram_id,
         v_pair_total_points, v_pair_weekly_points, v_pair_weekly_points_week
    from public.pairs
    where id = v_profile.pair_id
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'pair-not-found');
  end if;

  if
    p_telegram_id is distinct from v_partner_1_telegram_id
    and p_telegram_id is distinct from v_partner_2_telegram_id
  then
    return jsonb_build_object('ok', false, 'reason', 'not-pair-member');
  end if;

  v_partner_telegram_id :=
    case
      when v_partner_1_telegram_id = p_telegram_id then v_partner_2_telegram_id
      else v_partner_1_telegram_id
    end;

  if v_partner_telegram_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no-partner-yet');
  end if;

  -- Дата и вопрос дня — сервер определяет сам, той же формулой, что и
  -- клиент (getDailyPairQuestionForToday: YYYYMMDD % 7).
  v_today := (now() at time zone 'Europe/Helsinki')::date;
  v_question_index := (to_char(v_today, 'YYYYMMDD')::bigint % 7)::integer;
  v_question_id := 'dp' || (v_question_index + 1)::text;

  select *
    into v_existing_answer
    from public.daily_pair_answers
    where pair_id = v_pair_id
      and telegram_id = p_telegram_id
      and answer_date = v_today;

  if found then
    -- Ответ неизменяем: тот же ответ повторно — идемпотентно (ок),
    -- другой ответ — отказ. Это не даёт "подсмотреть и переправить".
    if v_existing_answer.answer_index is distinct from p_answer_index then
      return jsonb_build_object('ok', false, 'reason', 'answer-locked');
    end if;
  else
    insert into public.daily_pair_answers (
      pair_id, answer_date, question_id, telegram_id, answer_index
    ) values (
      v_pair_id, v_today, v_question_id, p_telegram_id, p_answer_index
    );
  end if;

  select *
    into v_partner_answer
    from public.daily_pair_answers
    where pair_id = v_pair_id
      and telegram_id = v_partner_telegram_id
      and answer_date = v_today;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'status', 'waiting_for_partner',
      'questionId', v_question_id
    );
  end if;

  v_same_answer := (v_partner_answer.answer_index = p_answer_index);

  -- Точная серия дней подряд, когда ОБА партнёра ответили — recursive
  -- CTE, без искусственного лимита итераций (важно для пар с серией
  -- дольше любого захардкоженного порога).
  with recursive completed_days as (
    select a.answer_date
      from public.daily_pair_answers a
      where a.pair_id = v_pair_id
        and a.telegram_id in (v_partner_1_telegram_id, v_partner_2_telegram_id)
      group by a.answer_date
      having count(distinct a.telegram_id) = 2
  ),
  streak as (
    select v_today as day, 1 as streak_length
      where exists (select 1 from completed_days where answer_date = v_today)
    union all
    select (s.day - 1), s.streak_length + 1
      from streak s
      where exists (select 1 from completed_days where answer_date = s.day - 1)
  )
  select coalesce(max(streak_length), 0)
    into v_current_streak
    from streak;

  -- Вехи серии — каждая клеймится максимум один раз за всё время пары
  -- (UNIQUE(pair_id, reward_key) в pair_reward_claims).
  foreach ms in array array[3, 5, 10, 15]
  loop
    if v_current_streak >= ms then
      v_reward_key := 'streak:' || ms::text;
      v_reward_points :=
        case ms
          when 3 then 100
          when 5 then 200
          when 10 then 500
          when 15 then 750
        end;

      insert into public.pair_reward_claims (pair_id, reward_key, reward_type, reward_points)
      values (v_pair_id, v_reward_key, 'streak', v_reward_points)
      on conflict (pair_id, reward_key) do nothing;

      get diagnostics v_rows = row_count;

      if v_rows > 0 then
        v_streak_bonus := v_streak_bonus + v_reward_points;
        v_new_milestones := array_append(v_new_milestones, ms);
      end if;
    end if;
  end loop;

  -- Бонус за совпадение ответов — максимум один раз в день.
  if v_same_answer then
    v_reward_key := 'daily-match:' || v_today::text;

    insert into public.pair_reward_claims (pair_id, reward_key, reward_type, reward_points)
    values (v_pair_id, v_reward_key, 'daily-match', 25)
    on conflict (pair_id, reward_key) do nothing;

    get diagnostics v_rows = row_count;

    if v_rows > 0 then
      v_match_bonus := 25;
    end if;
  end if;

  v_total_bonus := v_streak_bonus + v_match_bonus;

  if v_total_bonus > 0 then
    v_week_key := public.cq_week_key(v_today);

    v_next_total := greatest(0, coalesce(v_pair_total_points, 0) + v_total_bonus);
    v_next_weekly :=
      case
        when v_pair_weekly_points_week = v_week_key
          then greatest(0, coalesce(v_pair_weekly_points, 0) + v_total_bonus)
        else greatest(0, v_total_bonus)
      end;

    update public.pairs
       set total_points = v_next_total,
           weekly_points = v_next_weekly,
           weekly_points_week = v_week_key
     where id = v_pair_id
    returning total_points, weekly_points
      into v_next_total, v_next_weekly;
  else
    v_next_total := coalesce(v_pair_total_points, 0);
    v_next_weekly := coalesce(v_pair_weekly_points, 0);
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'both_answered',
    'questionId', v_question_id,
    'sameAnswer', v_same_answer,
    'currentStreak', v_current_streak,
    'newMilestones', to_jsonb(v_new_milestones),
    'streakBonus', v_streak_bonus,
    'matchBonus', v_match_bonus,
    'totalBonus', v_total_bonus,
    'pairTotalPoints', v_next_total,
    'pairWeeklyPoints', v_next_weekly
  );
end;
$$;

revoke all on function public.submit_daily_pair_answer(bigint, integer)
  from public, anon, authenticated;
grant execute on function public.submit_daily_pair_answer(bigint, integer)
  to service_role;
