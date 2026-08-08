-- ⚠️ ЗАПУСКАТЬ ТОЛЬКО ПОСЛЕ ДЕПЛОЯ нового кода и проверки, что реальные
-- вращения колеса/тесты/опросы/дневной бонус/реферал/топ недели продолжают
-- работать через новые эндпоинты:
--   app/api/activity/award
--   app/api/rewards/daily-bonus
--   app/api/referral/claim
--   app/api/rewards/claim-weekly-top
--
-- До этого момента старый фронтенд ещё может вызывать эти RPC напрямую —
-- преждевременный revoke сломает приложение для всех пользователей.
--
-- После выполнения anon-ключ больше не сможет вызвать ни одну из этих
-- функций напрямую (проверяется тестовым вызовом через anon key).

revoke all on function public.add_user_solo_points(bigint, integer, text)
  from public, anon, authenticated;
grant execute on function public.add_user_solo_points(bigint, integer, text)
  to service_role;

revoke all on function public.award_activity_points(bigint, uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.award_activity_points(bigint, uuid, text, integer, text)
  to service_role;

revoke all on function public.claim_referral_reward_points(bigint, bigint, text)
  from public, anon, authenticated;
grant execute on function public.claim_referral_reward_points(bigint, bigint, text)
  to service_role;

revoke all on function public.claim_weekly_pair_top_reward(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.claim_weekly_pair_top_reward(uuid, bigint)
  to service_role;
