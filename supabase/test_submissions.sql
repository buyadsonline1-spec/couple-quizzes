-- Результаты тестов (Trust Level, Love Language, Personal Strengths и
-- т.д.) сейчас считаются ЦЕЛИКОМ на клиенте из answers и нигде не
-- сохраняются — ни сырые ответы, ни готовый результат. Как только
-- пользователь уходит с экрана, результат теряется навсегда. Это же
-- нужно для профиля Знакомств (психологический профиль строится
-- именно из этих тестов).
--
-- Храним СЫРЫЕ ответы (integer[]), не готовый текст результата —
-- логика скоринга (getScaleResult/getLoveLanguageResult/
-- getPersonalityResult в app/page.tsx) уже локализована и может
-- поменяться; результат всегда можно пересчитать из ответов, а не
-- наоборот.

create table if not exists public.test_submissions (
  telegram_id bigint not null
    references public.profiles(telegram_id) on delete cascade,
  test_id text not null,
  answers integer[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (telegram_id, test_id)
);

alter table public.test_submissions enable row level security;
-- Без policy: deny-by-default, доступ только через service_role
-- (тот же паттерн, что и у poll_submissions — см.
-- bootstrap_reads_lockdown.sql).
revoke all privileges on public.test_submissions from anon, authenticated;
