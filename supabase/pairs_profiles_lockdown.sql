-- ⚠️ ЗАПУСКАТЬ ТОЛЬКО ПОСЛЕ ДЕПЛОЯ нового кода и проверки, что:
--   - создание пары работает (/api/pair/create);
--   - подключение по коду работает (/api/pair/join);
--   - профиль обновляется при входе (/api/profile/bootstrap);
--   - дневной лимит теста работает (/api/activity/consume-daily-limit).
--
-- До этого момента старый фронтенд ещё может писать в pairs/profiles
-- напрямую — преждевременный revoke сломает приложение.
--
-- SELECT оставляем открытым (тот же временный компромисс, что и для
-- daily_pair_answers) — экран всё ещё читает partner-профиль/пару
-- напрямую для отображения. Закрыть чтение — отдельный будущий шаг
-- (общий /api/bootstrap, возвращающий клиенту только нужные поля).

revoke insert, update, delete
  on public.pairs
  from anon, authenticated;

revoke insert, update, delete
  on public.profiles
  from anon, authenticated;
