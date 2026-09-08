-- ХОТФИКС: dating_superlike_boost.sql сломал get_dating_candidates —
-- ORDER BY стоял СНАРУЖИ jsonb_agg(), а не внутри неё. Без GROUP BY
-- агрегат схлопывает все строки в одну, и внешний ORDER BY по
-- dp.boosted_until превращается в невалидный SQL ("column must appear
-- in the GROUP BY clause or be used in an aggregate function") —
-- из-за этого ЛЮБОЙ вызов get_dating_candidates сейчас падает с
-- ошибкой, то есть лента кандидатов в Знакомствах не работает вообще
-- ни у кого. Правильный паттерн — ORDER BY внутри jsonb_agg(...),
-- как уже сделано в get_dating_incoming_likes.
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском —
-- срочно, это чинит текущую поломку в проде.

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
  select gender, seeking_gender, filter_min_age, filter_max_age
    into v_self
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
            'personalitySummary', dp.personality_summary,
            'isBoosted', (dp.boosted_until is not null and dp.boosted_until > now())
          )
          order by (dp.boosted_until is not null and dp.boosted_until > now()) desc
        )
        from public.dating_profiles dp
        where dp.telegram_id <> p_telegram_id
          and dp.is_active = true
          and (v_self.seeking_gender = 'any' or dp.gender = v_self.seeking_gender)
          and (dp.seeking_gender = 'any' or dp.seeking_gender = v_self.gender)
          and dp.age >= coalesce(v_self.filter_min_age, 18)
          and dp.age <= coalesce(v_self.filter_max_age, 120)
          and not exists (
            select 1 from public.dating_swipes s
            where s.from_telegram_id = p_telegram_id
              and s.to_telegram_id = dp.telegram_id
          )
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
