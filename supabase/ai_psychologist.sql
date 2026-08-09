-- AI-психолог для пары — новый универсальный чат (не детерминированный
-- опросник, а настоящий LLM-диалог через OpenAI). Согласовано с
-- ChatGPT: история переписки хранится у нас (не полагаемся на OpenAI
-- как источник истины), доступ только через service_role — тот же
-- паттерн "browser -> Next API -> service_role -> DB", что и везде в
-- этой миграции.
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

-- ============================================================
-- 1. Таблицы разговоров и сообщений.
-- ============================================================

create table if not exists public.ai_psychologist_conversations (
  id uuid primary key default gen_random_uuid(),

  telegram_id bigint not null
    references public.profiles(telegram_id)
    on delete cascade,

  pair_id uuid null
    references public.pairs(id)
    on delete set null,

  title text null,

  pair_context_enabled boolean not null default false,

  language text not null default 'ru'
    check (language in ('ru', 'en')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_psychologist_messages (
  id uuid primary key default gen_random_uuid(),

  conversation_id uuid not null
    references public.ai_psychologist_conversations(id)
    on delete cascade,

  role text not null
    check (role in ('user', 'assistant')),

  content text not null,

  -- Заполняется, если это ответ safety-ветки (moderation отметил
  -- сообщение пользователя как self-harm/violence/etc.) — не обычный
  -- ответ модели про отношения.
  safety_mode text null,

  created_at timestamptz not null default now()
);

create index if not exists ai_psychologist_conversations_user_idx
  on public.ai_psychologist_conversations (telegram_id, updated_at desc);

create index if not exists ai_psychologist_messages_conversation_idx
  on public.ai_psychologist_messages (conversation_id, created_at);

alter table public.ai_psychologist_conversations enable row level security;
alter table public.ai_psychologist_messages enable row level security;

revoke all on table public.ai_psychologist_conversations
  from public, anon, authenticated;
revoke all on table public.ai_psychologist_messages
  from public, anon, authenticated;
-- Без policy: deny-by-default, доступ только через service_role в
-- app/api/psychologist/*.

-- ============================================================
-- 2. Дневной лимит сообщений психологу — персональный (per-user, как
--    и лимит тестов), но с ДРУГОЙ формой: premium не безлимитен, а
--    получает более высокий лимит (каждое сообщение стоит реальных
--    денег на OpenAI API, поэтому даже Premium ограничен — это cost/
--    abuse cap, а не рекламная фича).
-- ============================================================

alter table public.user_daily_usage
  add column if not exists ai_messages_used integer not null default 0
  check (ai_messages_used >= 0);

create or replace function public.consume_psychologist_message_access(
  p_telegram_id bigint
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
  v_today := (now() at time zone 'Europe/Helsinki')::date;

  -- Та же логика проверки premium, что и в consume_daily_access.
  select coalesce(bool_or(
    case
      when s.expires_at is not null then s.expires_at > now()
      else s.plan = 'free_premium'
    end
  ), false)
    into v_is_premium
    from public.subscriptions s
    where s.telegram_id = p_telegram_id
      and s.status = 'active';

  -- FREE: 3 сообщения в день. PREMIUM: 50 в день — не безлимит,
  -- потому что каждое сообщение реально стоит денег на OpenAI.
  v_limit := case when v_is_premium then 50 else 3 end;

  insert into public.user_daily_usage (telegram_id, usage_date)
  values (p_telegram_id, v_today)
  on conflict (telegram_id, usage_date) do nothing;

  select *
    into v_row
    from public.user_daily_usage
    where telegram_id = p_telegram_id and usage_date = v_today
    for update;

  v_used := v_row.ai_messages_used;

  if v_used >= v_limit then
    return jsonb_build_object(
      'ok', true,
      'allowed', false,
      'isPremium', v_is_premium,
      'used', v_used,
      'limit', v_limit
    );
  end if;

  update public.user_daily_usage
     set ai_messages_used = ai_messages_used + 1
   where telegram_id = p_telegram_id and usage_date = v_today;

  return jsonb_build_object(
    'ok', true,
    'allowed', true,
    'isPremium', v_is_premium,
    'used', v_used + 1,
    'limit', v_limit
  );
end;
$$;

revoke all on function public.consume_psychologist_message_access(bigint)
  from public, anon, authenticated;
grant execute on function public.consume_psychologist_message_access(bigint)
  to service_role;
