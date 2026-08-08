-- READ-ONLY: показывает полное определение (включая тело) этих 4 функций,
-- ничего не меняет. Нужно, чтобы понять, что они уже проверяют внутри,
-- прежде чем оборачивать их в защищённый API.

select pg_get_functiondef(oid)
from pg_proc
where proname in (
  'add_user_solo_points',
  'award_activity_points',
  'claim_referral_reward_points',
  'claim_weekly_pair_top_reward'
)
and pronamespace = 'public'::regnamespace;
