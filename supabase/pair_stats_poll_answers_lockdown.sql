-- pair_stats и poll_answers сейчас вообще без RLS (не просто "allow all
-- policy", а RLS выключена целиком) — anon-ключ мог не только читать,
-- но и ПИСАТЬ (проверено вживую: анонимный INSERT в pair_stats реально
-- прошёл, 201; тестовая строка удалена). При этом ни в клиентском
-- коде, ни где-либо ещё в репозитории эти таблицы вообще не
-- используются (grep по всему проекту — ноль ссылок), поэтому
-- закрываем полностью и сразу, без промежуточных шагов и без риска
-- что-то сломать — как и с wheel_spins/pair_reward_claims.

alter table public.pair_stats enable row level security;
alter table public.poll_answers enable row level security;

revoke all privileges on table public.pair_stats from anon, authenticated, public;
revoke all privileges on table public.poll_answers from anon, authenticated, public;

-- Ни одной policy не создаём — deny-by-default. Если этим таблицам
-- когда-нибудь понадобится доступ, он должен идти через service_role
-- RPC, как и всё остальное в этой миграции.
