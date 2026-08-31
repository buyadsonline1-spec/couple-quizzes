-- Настройки аккаунта в профиле: смена отображаемого имени (ника).
-- Раньше first_name писался только один раз при bootstrap (из
-- Telegram initData или Supabase Auth user_metadata) и был неизменен
-- изнутри приложения. Это отдельный явный RPC, а не переиспользование
-- bootstrap_profile — тот принимает имя только из подписанного
-- initData/JWT, здесь же пользователь осознанно вводит своё имя сам.
create or replace function public.update_display_name(
  p_telegram_id bigint,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trimmed text;
begin
  v_trimmed := trim(coalesce(p_display_name, ''));

  if length(v_trimmed) = 0 or length(v_trimmed) > 60 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-name');
  end if;

  update public.profiles
     set first_name = v_trimmed
   where telegram_id = p_telegram_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'profile-not-found');
  end if;

  return jsonb_build_object('ok', true, 'displayName', v_trimmed);
end;
$$;

revoke all on function public.update_display_name(bigint, text)
  from public, anon, authenticated;
grant execute on function public.update_display_name(bigint, text)
  to service_role;
