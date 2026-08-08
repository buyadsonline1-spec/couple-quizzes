-- Profile bootstrap + Pair create/join + дневной лимит тестов — переносим
-- на сервер. Согласовано с ChatGPT: сейчас всё это обычные
-- supabase.from("pairs"/"profiles").insert/update/upsert(...) прямо из
-- браузера, где telegramId/pairId всегда client-supplied и НИКАК не
-- проверяются против подписанного initData. Конкретно можно было:
--   - затереть/создать чужой profiles-ряд (upsert по PK telegram_id);
--   - создать pair "от имени" произвольного telegram_id;
--   - подключиться к ЧУЖОЙ паре под произвольным telegram_id (join);
--   - сбросить daily_tests_used/daily_polls_used/daily_games_used у
--     любой пары в любой момент (сама эта запись сейчас безобидна,
--     потому что daily_tests_used нигде не инкрементируется — гейт
--     "!isPremium && dailyTestsUsed" всегда false, лимит тестов
--     фактически мёртв; но пишем правильно за компанию и заодно чиним
--     сам лимит).
--
-- Важное архитектурное решение от ChatGPT: дневной лимit должен быть
-- ПЕРСОНАЛЬНЫМ (per-user), а не на пару — иначе один партнёр тратит
-- бесплатный тест, и второй тоже блокируется. Поэтому — отдельная
-- таблица user_daily_usage, а не колонки в pairs.
--
-- Отдельно: реальный (сломанный) лимит в проде есть только у тестов —
-- 1 бесплатный тест в день (см. gate "!isPremium && dailyTestsUsed" в
-- TestsScreen). У опросов лимита по количеству нет вообще — они
-- гейтятся по конкретным бесплатным темам (isFreePoll), это чисто
-- контентный, не денежный гейт, трогать не нужно. У игр лимита нет
-- совсем. Поэтому здесь заводим лимит только для тестов; таблица
-- оставлена расширяемой на будущее, если решите добавить лимиты для
-- опросов/игр отдельным продуктовым решением.
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.
-- Как и раньше: revoke на pairs/profiles (INSERT/UPDATE от
-- anon/authenticated) — ОТДЕЛЬНЫМ шагом (pairs_profiles_lockdown.sql),
-- после деплоя и проверки, что всё работает через новые эндпоинты.

-- ============================================================
-- 0. pgcrypto (gen_random_bytes) обычно живёт в схеме extensions, не
--    в public — как и для spin_reward_wheel в wheel_reward_wheel.sql.
--    Убеждаемся, что расширение есть, и добавляем схему в search_path
--    ниже у create_pair (иначе gen_random_bytes не резолвится).
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ============================================================
-- 0.1. Целостность pairs: invite_code должен быть уникален (иначе
--    серверная генерация с retry-на-коллизию не имеет смысла), и
--    партнёры не могут быть одним и тем же telegram_id.
-- ============================================================

create unique index if not exists pairs_invite_code_unique
  on public.pairs (invite_code);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pairs_partners_distinct'
  ) then
    alter table public.pairs
      add constraint pairs_partners_distinct
      check (
        partner_2_telegram_id is null
        or partner_1_telegram_id is distinct from partner_2_telegram_id
      );
  end if;
end $$;

-- ============================================================
-- 1. bootstrap_profile — единственный способ создать/обновить свой
--    профиль. Трогает ТОЛЬКО Telegram display-поля (имя/юзернейм/
--    фото) — никогда pair_id, solo_points, premium и т.д. Данные
--    берутся из подписанного initData на уровне API route, не из
--    произвольного тела запроса.
-- ============================================================

create or replace function public.bootstrap_profile(
  p_telegram_id bigint,
  p_first_name text,
  p_last_name text,
  p_username text,
  p_photo_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if p_telegram_id is null or p_telegram_id <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-telegram-id');
  end if;

  insert into public.profiles (
    telegram_id, first_name, last_name, username, photo_url
  ) values (
    p_telegram_id, p_first_name, p_last_name, p_username, p_photo_url
  )
  on conflict (telegram_id) do update
    set first_name = excluded.first_name,
        last_name = excluded.last_name,
        username = excluded.username,
        photo_url = excluded.photo_url
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

revoke all on function public.bootstrap_profile(bigint, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.bootstrap_profile(bigint, text, text, text, text)
  to service_role;

-- ============================================================
-- 2. create_pair — создание пары. Генерирует invite_code на сервере
--    (не доверяем клиентскому Math.random()), партнёром №1 всегда
--    становится telegramId из initData. Одна SECURITY DEFINER
--    функция = одна транзакция, промежуточного состояния "пара
--    создана, профиль не привязан" быть не может.
-- ============================================================

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

    -- 6 символов из [0-9A-Z], байты из pgcrypto — не Math.random().
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
      -- иначе повторяем цикл с новым кодом
    end;
  end loop;

  update public.profiles
     set pair_id = v_pair_id
   where telegram_id = p_telegram_id;

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

-- ============================================================
-- 3. join_pair — подключение по коду приглашения. Лочит СНАЧАЛА
--    профиль вызывающего, ПОТОМ пару (тот же порядок блокировок, что
--    и в create_pair/остальных RPC — снижает риск deadlock). telegramId
--    только из initData, никогда от клиента напрямую.
-- ============================================================

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

  return jsonb_build_object('ok', true, 'pairId', v_pair_id);
end;
$$;

revoke all on function public.join_pair(bigint, text)
  from public, anon, authenticated;
grant execute on function public.join_pair(bigint, text)
  to service_role;

-- ============================================================
-- 4. user_daily_usage + consume_daily_access — персональный (не
--    парный) дневной лимит. Сейчас реально используется только для
--    тестов (1/день для не-Premium, как и задумывался сломанный
--    клиентский гейт). Колонки под опросы/игры оставлены на будущее,
--    но сейчас нигде не расходуются — у опросов гейт по темам, у игр
--    лимита нет вовсе.
-- ============================================================

create table if not exists public.user_daily_usage (
  telegram_id bigint not null references public.profiles(telegram_id) on delete cascade,
  usage_date date not null,
  tests_used integer not null default 0,
  polls_used integer not null default 0,
  game_steps_used integer not null default 0,
  primary key (telegram_id, usage_date),
  check (tests_used >= 0),
  check (polls_used >= 0),
  check (game_steps_used >= 0)
);

alter table public.user_daily_usage enable row level security;
-- Без policy: deny-by-default, доступ только через RPC.

create or replace function public.consume_daily_access(
  p_telegram_id bigint,
  p_activity_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date;
  v_is_premium boolean;
  v_limit integer;
  v_used integer;
  v_row public.user_daily_usage%rowtype;
begin
  if p_activity_type <> 'test' then
    -- Сейчас реальный лимит есть только у тестов. Остальные типы
    -- зарезервированы на будущее (см. комментарий к таблице выше).
    return jsonb_build_object('ok', false, 'reason', 'invalid-activity-type');
  end if;

  v_today := (now() at time zone 'Europe/Helsinki')::date;

  -- Та же логика, что и в клиентском loadPremiumStatus(): активная
  -- подписка с plan='free_premium' (бессрочно) или expires_at в будущем.
  select coalesce(bool_or(
    s.plan = 'free_premium'
    or (s.expires_at is not null and s.expires_at > now())
  ), false)
    into v_is_premium
    from public.subscriptions s
    where s.telegram_id = p_telegram_id
      and s.status = 'active';

  if v_is_premium then
    return jsonb_build_object(
      'ok', true,
      'allowed', true,
      'isPremium', true,
      'used', null,
      'limit', null
    );
  end if;

  v_limit := 1;

  insert into public.user_daily_usage (telegram_id, usage_date)
  values (p_telegram_id, v_today)
  on conflict (telegram_id, usage_date) do nothing;

  select *
    into v_row
    from public.user_daily_usage
    where telegram_id = p_telegram_id and usage_date = v_today
    for update;

  v_used := v_row.tests_used;

  if v_used >= v_limit then
    return jsonb_build_object(
      'ok', true,
      'allowed', false,
      'isPremium', false,
      'used', v_used,
      'limit', v_limit
    );
  end if;

  update public.user_daily_usage
     set tests_used = tests_used + 1
   where telegram_id = p_telegram_id and usage_date = v_today;

  return jsonb_build_object(
    'ok', true,
    'allowed', true,
    'isPremium', false,
    'used', v_used + 1,
    'limit', v_limit
  );
end;
$$;

revoke all on function public.consume_daily_access(bigint, text)
  from public, anon, authenticated;
grant execute on function public.consume_daily_access(bigint, text)
  to service_role;
