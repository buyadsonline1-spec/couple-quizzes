-- ⚠️ ЗАПУСКАТЬ ТОЛЬКО ПОСЛЕ ДЕПЛОЯ /api/bootstrap и проверки, что
-- приложение открывается нормально (профиль, пара, premium, вопрос
-- дня, опросы) — это уже подтверждено Артёмом вживую.
--
-- Закрывает последний открытый пласт из security-обзора GPT:
-- прямой SELECT anon/authenticated по profiles/pairs/subscriptions/
-- daily_pair_answers (все чтения теперь идут через /api/bootstrap,
-- /api/pair/state, /api/pair/daily-state, /api/profile/state) и
-- poll_submissions ПОЛНОСТЬЮ (SELECT + WRITE), потому что запись туда
-- тоже уже переехала на сервер (/api/poll/submit).

revoke select on public.profiles from anon, authenticated;
revoke select on public.pairs from anon, authenticated;
revoke select on public.subscriptions from anon, authenticated;
revoke select on public.daily_pair_answers from anon, authenticated;

revoke all privileges on public.poll_submissions from anon, authenticated;
