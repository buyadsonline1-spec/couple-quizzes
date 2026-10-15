-- Рассылка-напоминание "забери дневной бонус" — pg_cron (внутри
-- Postgres) раз в неделю дёргает app/api/cron/daily-bonus-reminder
-- через pg_net (HTTP из базы), та сама шлёт сообщения через Telegram
-- Bot API (sendTelegramMessage). Эндпоинт и его логика (кто ещё не
-- забрал бонус СЕГОДНЯ, на день самого запуска) не завязаны на
-- частоту — расписание ниже единственное место, которое её определяет.
--
-- ИЗНАЧАЛЬНО было ежедневным (cron.schedule), потом перенастроено на
-- еженедельное по просьбе пользователя — см.
-- supabase/daily_bonus_reminder_weekly.sql (там же сама команда
-- cron.alter_job, которой это было применено к уже созданной job).
-- Этот файл обновлён, чтобы при полном пересоздании job'ы (например,
-- после cron.unschedule) результат сразу соответствовал актуальному
-- расписанию — применять заново НЕ нужно, если job уже существует.
--
-- Время: понедельник, 17:00 UTC = 20:00 по Хельсинки сейчас (EEST, до
-- 25.10.2026), 19:00 после перехода на зимнее время (EET) — pg_cron
-- планирует по UTC, сам не следит за DST; для напоминания точность до
-- часа не критична, менять не обязательно.
--
-- ВАЖНО перед применением: замени <PRODUCTION_SECRET> ниже на РЕАЛЬНОЕ
-- значение INTERNAL_WEBHOOK_SECRET (то же самое, что добавлено в
-- Vercel → Settings → Environment Variables). Без этого эндпоинт
-- будет отвечать 401 каждый раз, рассылка не уйдёт.
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ============================================================
-- 1. get_daily_bonus_reminder_recipients — та же формула "сегодня"
--    (Europe/Helsinki), что и claim_daily_bonus в
--    daily_bonus_server_side.sql. Реальные Telegram-аккаунты (> 0,
--    синтетическим iOS-id отправлять некуда, см. telegram-notify.ts),
--    кто ещё не забрал бонус сегодня (включая тех, кто не брал его
--    вообще никогда — last_claim_date is null).
-- ============================================================

create or replace function public.get_daily_bonus_reminder_recipients()
returns table (telegram_id bigint)
language sql
security definer
set search_path = public
as $$
  select p.telegram_id
  from public.profiles p
  where p.telegram_id > 0
    and (
      p.daily_bonus_last_claim_date is null
      or p.daily_bonus_last_claim_date <> (now() at time zone 'Europe/Helsinki')::date
    );
$$;

revoke all on function public.get_daily_bonus_reminder_recipients() from public, anon, authenticated;
grant execute on function public.get_daily_bonus_reminder_recipients() to service_role;

-- ============================================================
-- 2. Сам cron job.
-- ============================================================

select cron.schedule(
  'daily-bonus-reminder',
  '0 17 * * 1',
  $$
  select net.http_post(
    url := 'https://couple-quizzes.vercel.app/api/cron/daily-bonus-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', '<PRODUCTION_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);
