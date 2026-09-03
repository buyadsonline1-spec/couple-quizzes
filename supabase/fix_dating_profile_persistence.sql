-- Баг: анкета Знакомств сохранялась в dating_profiles (upsert_dating_profile
-- пишет её корректно), но клиент никогда не подгружал её обратно —
-- datingProfile в app/page.tsx это чисто локальный useState, который
-- заполняется ТОЛЬКО сразу после успешного сохранения в текущей
-- сессии и обнуляется при любой перезагрузке Mini App. handleOpenDating
-- проверял именно этот локальный стейт, поэтому после перезагрузки
-- пользователь с уже заполненной анкетой снова видел dating-intro
-- (создание анкеты) вместо dating-swipe — сами данные не терялись в
-- БД, просто клиент о них не знал.
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

create or replace function public.get_own_dating_profile(
  p_telegram_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.dating_profiles%rowtype;
begin
  select * into v_profile
    from public.dating_profiles
    where telegram_id = p_telegram_id
      and is_active = true;

  if not found then
    return jsonb_build_object('ok', true, 'profile', null);
  end if;

  return jsonb_build_object(
    'ok', true,
    'profile', jsonb_build_object(
      'displayName', v_profile.display_name,
      'age', v_profile.age,
      'bio', v_profile.bio,
      'photoUrl', v_profile.photo_url,
      'gender', v_profile.gender,
      'seekingGender', v_profile.seeking_gender,
      'personalitySummary', coalesce(v_profile.personality_summary, '{}'::jsonb)
    )
  );
end;
$$;

revoke all on function public.get_own_dating_profile(bigint)
  from public, anon, authenticated;
grant execute on function public.get_own_dating_profile(bigint)
  to service_role;
