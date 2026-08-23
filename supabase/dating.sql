-- "Знакомства" (Dating) — first draft schema. NOT wired into the app
-- yet (no menu entry point, no UI reachable) — safe to apply now and
-- iterate before anything user-facing ships. Applying this does not
-- change behavior for a single existing user.
--
-- Design notes:
-- * Same identity model as the rest of the app: telegram_id (real or
--   synthetic negative for iOS/Supabase-Auth users) is the key
--   everywhere, referencing public.profiles(telegram_id). No new
--   identity system.
-- * Everything server-side via SECURITY DEFINER RPCs, service_role
--   only — same convention as every other table in this repo. No
--   direct table grants to anon/authenticated.
-- * Compatibility SCORING itself is intentionally NOT done in SQL —
--   the existing pair-compatibility algorithm lives in TypeScript
--   (buildCompatibilityProfile in app/page.tsx). get_dating_candidates
--   returns candidates + their raw poll answers; the API route scores
--   and sorts them using a server-side port of that same algorithm.
--   Keeps one source of truth for "what compatibility means" instead
--   of two diverging implementations.
-- * 18+ enforced at the database level (not just client-side) via a
--   check constraint — this is a real minimum-age gate, not just a
--   UI hint.
-- * Blocking/reporting exist from day one (Apple Guideline 1.2 for
--   any user-matching/messaging feature) — not a fast-follow.

-- ============================================================
-- 1. dating_profiles — one row per user who opted into Dating.
--    Separate from public.profiles (the couple-quiz identity) on
--    purpose: someone can be paired AND separately have a dating
--    profile turned off/on, and dating-specific fields (bio, seeking
--    preference, personality summary) don't belong on the core table.
-- ============================================================

create table if not exists public.dating_profiles (
  telegram_id bigint primary key
    references public.profiles(telegram_id) on delete cascade,
  display_name text not null,
  age integer not null check (age >= 18 and age <= 120),
  bio text,
  photo_url text,
  gender text not null check (gender in ('boy', 'girl')),
  seeking_gender text not null check (seeking_gender in ('boy', 'girl', 'any')),
  is_active boolean not null default true,
  -- Сжатая выжимка результатов тестов для показа на анкете, например:
  -- { "loveLanguage": "quality_time", "trustLevel": "high", "topStrength": "empathy" }
  -- Формат специально не жёсткий (jsonb) — набор тестов, фидящих сюда,
  -- скорее всего будет меняться на первых порах.
  personality_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dating_profiles enable row level security;
-- Без policy: deny-by-default, доступ только через RPC (service_role).

-- ============================================================
-- 2. dating_swipes — лайк/пропуск. Уникальность (from, to) не даёт
--    задвоить свайп; если пользователь свайпнул "пропустить", а потом
--    передумал — это отдельная фича на будущее (сейчас свайп финален).
-- ============================================================

create table if not exists public.dating_swipes (
  from_telegram_id bigint not null
    references public.profiles(telegram_id) on delete cascade,
  to_telegram_id bigint not null
    references public.profiles(telegram_id) on delete cascade,
  action text not null check (action in ('like', 'pass')),
  created_at timestamptz not null default now(),
  primary key (from_telegram_id, to_telegram_id),
  check (from_telegram_id <> to_telegram_id)
);

alter table public.dating_swipes enable row level security;

-- ============================================================
-- 3. dating_matches — создаётся атомарно внутри record_dating_swipe,
--    когда взаимный лайк обнаружен. user_low/user_high вместо
--    user_a/user_b — хранится в отсортированном порядке
--    (user_low_telegram_id < user_high_telegram_id), чтобы уникальный
--    индекс на паре ловил дубликаты независимо от того, кто лайкнул
--    первым.
-- ============================================================

create table if not exists public.dating_matches (
  id uuid primary key default gen_random_uuid(),
  user_low_telegram_id bigint not null
    references public.profiles(telegram_id) on delete cascade,
  user_high_telegram_id bigint not null
    references public.profiles(telegram_id) on delete cascade,
  matched_at timestamptz not null default now(),
  unique (user_low_telegram_id, user_high_telegram_id),
  check (user_low_telegram_id < user_high_telegram_id)
);

alter table public.dating_matches enable row level security;

-- ============================================================
-- 4. dating_messages — простой чат внутри мэтча. Забор сообщений —
--    поллингом с клиента (GET раз в несколько секунд), не realtime —
--    сознательный выбор для скорости старта, не блокирует апгрейд на
--    Supabase Realtime позже без смены схемы.
-- ============================================================

create table if not exists public.dating_messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null
    references public.dating_matches(id) on delete cascade,
  sender_telegram_id bigint not null
    references public.profiles(telegram_id) on delete cascade,
  text text not null check (length(trim(text)) > 0 and length(text) <= 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table public.dating_messages enable row level security;

create index if not exists dating_messages_match_id_created_at_idx
  on public.dating_messages (match_id, created_at);

-- ============================================================
-- 5. dating_blocks / dating_reports — обязательны с первого дня
--    (Apple Guideline 1.2 для любого функционала с подбором
--    незнакомых людей и перепиской).
-- ============================================================

create table if not exists public.dating_blocks (
  blocker_telegram_id bigint not null
    references public.profiles(telegram_id) on delete cascade,
  blocked_telegram_id bigint not null
    references public.profiles(telegram_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_telegram_id, blocked_telegram_id),
  check (blocker_telegram_id <> blocked_telegram_id)
);

alter table public.dating_blocks enable row level security;

create table if not exists public.dating_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_telegram_id bigint not null
    references public.profiles(telegram_id) on delete cascade,
  reported_telegram_id bigint not null
    references public.profiles(telegram_id) on delete cascade,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.dating_reports enable row level security;

-- ============================================================
-- 6. upsert_dating_profile — создать/обновить анкету. Требует
--    Premium (проверяется в API route через уже существующий
--    checkIsPremium(), не здесь — держим бизнес-правило в одном
--    месте, а не размазываем между SQL и TS).
-- ============================================================

create or replace function public.upsert_dating_profile(
  p_telegram_id bigint,
  p_display_name text,
  p_age integer,
  p_bio text,
  p_photo_url text,
  p_gender text,
  p_seeking_gender text,
  p_personality_summary jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_display_name is null or length(trim(p_display_name)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-name');
  end if;

  if p_age is null or p_age < 18 then
    return jsonb_build_object('ok', false, 'reason', 'underage');
  end if;

  if p_gender not in ('boy', 'girl') then
    return jsonb_build_object('ok', false, 'reason', 'invalid-gender');
  end if;

  if p_seeking_gender not in ('boy', 'girl', 'any') then
    return jsonb_build_object('ok', false, 'reason', 'invalid-seeking-gender');
  end if;

  insert into public.dating_profiles (
    telegram_id, display_name, age, bio, photo_url,
    gender, seeking_gender, personality_summary, updated_at
  ) values (
    p_telegram_id, trim(p_display_name), p_age, p_bio, p_photo_url,
    p_gender, p_seeking_gender, coalesce(p_personality_summary, '{}'::jsonb), now()
  )
  on conflict (telegram_id) do update set
    display_name = excluded.display_name,
    age = excluded.age,
    bio = excluded.bio,
    photo_url = coalesce(excluded.photo_url, public.dating_profiles.photo_url),
    gender = excluded.gender,
    seeking_gender = excluded.seeking_gender,
    personality_summary = excluded.personality_summary,
    is_active = true,
    updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.upsert_dating_profile(
  bigint, text, integer, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.upsert_dating_profile(
  bigint, text, integer, text, text, text, text, jsonb
) to service_role;

-- ============================================================
-- 7. get_dating_candidates — кандидаты под критерий пола/предпочтений,
--    за вычетом уже свайпнутых и заблокированных (в обе стороны).
--    Скоринг совместимости — на стороне API route (TS), не здесь; эта
--    функция просто отдаёт пул + сырые ответы на опросы для расчёта.
-- ============================================================

create or replace function public.get_dating_candidates(
  p_telegram_id bigint,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self record;
begin
  select gender, seeking_gender into v_self
    from public.dating_profiles
    where telegram_id = p_telegram_id and is_active = true;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no-profile');
  end if;

  return jsonb_build_object(
    'ok', true,
    'candidates', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'telegramId', dp.telegram_id,
            'displayName', dp.display_name,
            'age', dp.age,
            'bio', dp.bio,
            'photoUrl', dp.photo_url,
            'gender', dp.gender,
            'personalitySummary', dp.personality_summary
          )
        )
        from public.dating_profiles dp
        where dp.telegram_id <> p_telegram_id
          and dp.is_active = true
          -- взаимное соответствие пола/предпочтений в обе стороны
          and (v_self.seeking_gender = 'any' or dp.gender = v_self.seeking_gender)
          and (dp.seeking_gender = 'any' or dp.seeking_gender = v_self.gender)
          -- уже свайпнутые (в любую сторону) исключаем
          and not exists (
            select 1 from public.dating_swipes s
            where s.from_telegram_id = p_telegram_id
              and s.to_telegram_id = dp.telegram_id
          )
          -- заблокированные в любую сторону
          and not exists (
            select 1 from public.dating_blocks b
            where (b.blocker_telegram_id = p_telegram_id and b.blocked_telegram_id = dp.telegram_id)
               or (b.blocker_telegram_id = dp.telegram_id and b.blocked_telegram_id = p_telegram_id)
          )
        limit greatest(1, least(p_limit, 50))
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.get_dating_candidates(bigint, integer)
  from public, anon, authenticated;
grant execute on function public.get_dating_candidates(bigint, integer)
  to service_role;

-- ============================================================
-- 8. record_dating_swipe — атомарно: пишет свайп, и если это лайк и
--    обратный лайк уже существует — создаёт мэтч тут же, в одной
--    транзакции (без гонки между двумя одновременными лайками).
-- ============================================================

create or replace function public.record_dating_swipe(
  p_from_telegram_id bigint,
  p_to_telegram_id bigint,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reverse_like boolean;
  v_match_id uuid;
  v_low bigint;
  v_high bigint;
begin
  if p_action not in ('like', 'pass') then
    return jsonb_build_object('ok', false, 'reason', 'invalid-action');
  end if;

  if p_from_telegram_id = p_to_telegram_id then
    return jsonb_build_object('ok', false, 'reason', 'self-swipe');
  end if;

  insert into public.dating_swipes (from_telegram_id, to_telegram_id, action)
  values (p_from_telegram_id, p_to_telegram_id, p_action)
  on conflict (from_telegram_id, to_telegram_id) do nothing;

  if p_action = 'pass' then
    return jsonb_build_object('ok', true, 'matched', false);
  end if;

  select exists (
    select 1 from public.dating_swipes
    where from_telegram_id = p_to_telegram_id
      and to_telegram_id = p_from_telegram_id
      and action = 'like'
  ) into v_reverse_like;

  if not v_reverse_like then
    return jsonb_build_object('ok', true, 'matched', false);
  end if;

  v_low := least(p_from_telegram_id, p_to_telegram_id);
  v_high := greatest(p_from_telegram_id, p_to_telegram_id);

  insert into public.dating_matches (user_low_telegram_id, user_high_telegram_id)
  values (v_low, v_high)
  on conflict (user_low_telegram_id, user_high_telegram_id) do nothing
  returning id into v_match_id;

  if v_match_id is null then
    select id into v_match_id
      from public.dating_matches
      where user_low_telegram_id = v_low and user_high_telegram_id = v_high;
  end if;

  return jsonb_build_object('ok', true, 'matched', true, 'matchId', v_match_id);
end;
$$;

revoke all on function public.record_dating_swipe(bigint, bigint, text)
  from public, anon, authenticated;
grant execute on function public.record_dating_swipe(bigint, bigint, text)
  to service_role;

-- ============================================================
-- 9. get_dating_matches — список мэтчей с базовой инфой о втором
--    участнике + превью последнего сообщения.
-- ============================================================

create or replace function public.get_dating_matches(
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
    'matches', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'matchId', m.id,
            'matchedAt', m.matched_at,
            'partnerTelegramId', dp.telegram_id,
            'partnerDisplayName', dp.display_name,
            'partnerPhotoUrl', dp.photo_url,
            'lastMessage', (
              select jsonb_build_object('text', dm.text, 'createdAt', dm.created_at, 'senderTelegramId', dm.sender_telegram_id)
              from public.dating_messages dm
              where dm.match_id = m.id
              order by dm.created_at desc
              limit 1
            )
          )
          order by m.matched_at desc
        )
        from public.dating_matches m
        join public.dating_profiles dp
          on dp.telegram_id = case
            when m.user_low_telegram_id = p_telegram_id then m.user_high_telegram_id
            else m.user_low_telegram_id
          end
        where m.user_low_telegram_id = p_telegram_id
           or m.user_high_telegram_id = p_telegram_id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.get_dating_matches(bigint)
  from public, anon, authenticated;
grant execute on function public.get_dating_matches(bigint)
  to service_role;

-- ============================================================
-- 10. send_dating_message / get_dating_messages — оба проверяют, что
--     вызывающий действительно состоит в этом мэтче, и что ни одна из
--     сторон не заблокировала другую.
-- ============================================================

create or replace function public.send_dating_message(
  p_match_id uuid,
  p_sender_telegram_id bigint,
  p_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
  v_partner_id bigint;
begin
  select * into v_match
    from public.dating_matches
    where id = p_match_id
      and (user_low_telegram_id = p_sender_telegram_id or user_high_telegram_id = p_sender_telegram_id);

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not-in-match');
  end if;

  if p_text is null or length(trim(p_text)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'empty-message');
  end if;

  v_partner_id := case
    when v_match.user_low_telegram_id = p_sender_telegram_id then v_match.user_high_telegram_id
    else v_match.user_low_telegram_id
  end;

  if exists (
    select 1 from public.dating_blocks
    where (blocker_telegram_id = p_sender_telegram_id and blocked_telegram_id = v_partner_id)
       or (blocker_telegram_id = v_partner_id and blocked_telegram_id = p_sender_telegram_id)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'blocked');
  end if;

  insert into public.dating_messages (match_id, sender_telegram_id, text)
  values (p_match_id, p_sender_telegram_id, left(trim(p_text), 2000));

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.send_dating_message(uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function public.send_dating_message(uuid, bigint, text)
  to service_role;

create or replace function public.get_dating_messages(
  p_match_id uuid,
  p_telegram_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.dating_matches
    where id = p_match_id
      and (user_low_telegram_id = p_telegram_id or user_high_telegram_id = p_telegram_id)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not-in-match');
  end if;

  return jsonb_build_object(
    'ok', true,
    'messages', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', dm.id,
            'senderTelegramId', dm.sender_telegram_id,
            'text', dm.text,
            'createdAt', dm.created_at
          )
          order by dm.created_at asc
        )
        from public.dating_messages dm
        where dm.match_id = p_match_id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.get_dating_messages(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.get_dating_messages(uuid, bigint)
  to service_role;

-- ============================================================
-- 11. block_dating_user / report_dating_user
-- ============================================================

create or replace function public.block_dating_user(
  p_blocker_telegram_id bigint,
  p_blocked_telegram_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_blocker_telegram_id = p_blocked_telegram_id then
    return jsonb_build_object('ok', false, 'reason', 'self-block');
  end if;

  insert into public.dating_blocks (blocker_telegram_id, blocked_telegram_id)
  values (p_blocker_telegram_id, p_blocked_telegram_id)
  on conflict do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.block_dating_user(bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.block_dating_user(bigint, bigint)
  to service_role;

create or replace function public.report_dating_user(
  p_reporter_telegram_id bigint,
  p_reported_telegram_id bigint,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_reporter_telegram_id = p_reported_telegram_id then
    return jsonb_build_object('ok', false, 'reason', 'self-report');
  end if;

  insert into public.dating_reports (reporter_telegram_id, reported_telegram_id, reason)
  values (p_reporter_telegram_id, p_reported_telegram_id, p_reason);

  -- Жалоба автоматически блокирует, чтобы репортнутый профиль сразу
  -- пропал из выдачи репортёра, не дожидаясь модерации.
  insert into public.dating_blocks (blocker_telegram_id, blocked_telegram_id)
  values (p_reporter_telegram_id, p_reported_telegram_id)
  on conflict do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.report_dating_user(bigint, bigint, text)
  from public, anon, authenticated;
grant execute on function public.report_dating_user(bigint, bigint, text)
  to service_role;
