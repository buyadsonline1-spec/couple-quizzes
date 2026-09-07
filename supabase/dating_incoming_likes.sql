-- "Лайки мне" — отдельно от "Мэтчей": человек может лайкнуть первым,
-- и до тех пор, пока вторая сторона не ответит взаимностью, это не
-- мэтч, а именно входящий лайк. Раньше такие лайки были никак не
-- видны получателю — он мог узнать о них только случайно наткнувшись
-- на этого же человека в собственной ленте кандидатов.
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

create or replace function public.get_dating_incoming_likes(
  p_telegram_id bigint,
  p_limit integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.dating_profiles
    where telegram_id = p_telegram_id and is_active = true
  ) then
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
            'likedAt', s.created_at
          )
          order by s.created_at desc
        )
        from public.dating_swipes s
        join public.dating_profiles dp
          on dp.telegram_id = s.from_telegram_id
        where s.to_telegram_id = p_telegram_id
          and s.action = 'like'
          and dp.telegram_id <> p_telegram_id
          and dp.is_active = true
          -- ещё не ответили (ни лайком, ни пропуском) — как только
          -- отвечаем, это either уже мэтч (get_dating_matches), либо
          -- пропущено и не должно больше маячить в списке.
          and not exists (
            select 1 from public.dating_swipes s2
            where s2.from_telegram_id = p_telegram_id
              and s2.to_telegram_id = dp.telegram_id
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

revoke all on function public.get_dating_incoming_likes(bigint, integer)
  from public, anon, authenticated;
grant execute on function public.get_dating_incoming_likes(bigint, integer)
  to service_role;
