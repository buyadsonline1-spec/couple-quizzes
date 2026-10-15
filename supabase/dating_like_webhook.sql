-- Веб-событие на лайк в Знакомствах: AFTER INSERT триггер на
-- public.dating_swipes (срабатывает и на обычный лайк, и на суперлайк
-- — оба пишутся в эту таблицу с action='like', см. dating.sql и
-- dating_superlike_boost.sql) дёргает app/api/dating/like-webhook
-- через pg_net. Та сама проверяет, не мэтч ли это уже (тогда
-- уведомление и так ушло из /api/dating/swipe) и шлёт "тебя
-- лайкнули" получателю.
--
-- net.http_post асинхронный (просто кладёт запрос в очередь pg_net и
-- сразу возвращает id) — не блокирует и не замедляет сам свайп.
--
-- ВАЖНО перед применением: замени <PRODUCTION_SECRET> на РЕАЛЬНОЕ
-- значение INTERNAL_WEBHOOK_SECRET (то же, что в Vercel и в
-- daily_bonus_reminder_cron.sql — один и тот же секрет для обоих
-- внутренних эндпоинтов).
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

create extension if not exists pg_net;

create or replace function public.notify_dating_like()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.action = 'like' then
    perform net.http_post(
      url := 'https://couple-quizzes.vercel.app/api/dating/like-webhook',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', '<PRODUCTION_SECRET>'
      ),
      body := jsonb_build_object(
        'fromTelegramId', new.from_telegram_id,
        'toTelegramId', new.to_telegram_id,
        'isSuperlike', coalesce(new.is_superlike, false)
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists dating_swipes_notify_like on public.dating_swipes;
create trigger dating_swipes_notify_like
  after insert on public.dating_swipes
  for each row
  execute function public.notify_dating_like();
