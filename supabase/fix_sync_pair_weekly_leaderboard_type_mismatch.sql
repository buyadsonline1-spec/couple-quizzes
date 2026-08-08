-- Баг: sync_pair_weekly_leaderboard() (триггер AFTER INSERT/UPDATE на
-- public.pairs, существовавший ещё до этой сессии) падает с
-- "operator does not exist: bigint = text" при сравнении
-- profiles.telegram_id (bigint) с new.partner_1_telegram_id /
-- new.partner_2_telegram_id из pairs — эти колонки на практике не
-- bigint. Триггер срабатывает на КАЖДОЕ обновление pairs.weekly_points/
-- weekly_points_week/partner_*_telegram_id, то есть буквально на любое
-- начисление очков паре (award_activity_points, submit_daily_pair_answer,
-- claim_daily_bonus и т.д.) — этим объясняются оба репорта: и провал
-- "вопроса дня", и "очки не начисляются ни за что" (тесты/опросы/игры).
--
-- Обнаружено: 08.08.2026, живым тестом award_activity_points через
-- service_role с реальным pair_id.
--
-- Фикс: явный ::bigint каст перед сравнением с profiles.telegram_id —
-- безопасно независимо от фактического типа колонки partner_*_telegram_id
-- (если это уже bigint, каст — no-op; если text с цифрами — парсится
-- корректно).
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

create or replace function public.sync_pair_weekly_leaderboard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_name_1 text;
  v_name_2 text;
  v_pair_title text;
begin

  if new.weekly_points_week is null then
    return new;
  end if;


  if new.partner_1_telegram_id is not null then

    select
      coalesce(
        nullif(
          trim(
            concat_ws(
              ' ',
              first_name,
              last_name
            )
          ),
          ''
        ),
        case
          when username is not null
            then '@' || username
          else null
        end,
        'Игрок ' ||
          new.partner_1_telegram_id::text
      )
    into v_name_1

    from public.profiles

    where telegram_id =
      new.partner_1_telegram_id::bigint;

  end if;


  if new.partner_2_telegram_id is not null then

    select
      coalesce(
        nullif(
          trim(
            concat_ws(
              ' ',
              first_name,
              last_name
            )
          ),
          ''
        ),
        case
          when username is not null
            then '@' || username
          else null
        end,
        'Игрок ' ||
          new.partner_2_telegram_id::text
      )
    into v_name_2

    from public.profiles

    where telegram_id =
      new.partner_2_telegram_id::bigint;

  end if;


  v_pair_title :=
    coalesce(
      v_name_1,
      'Игрок'
    )
    ||
    ' + '
    ||
    coalesce(
      v_name_2,
      'Партнёр'
    );


  insert into public.weekly_pair_leaderboard (
    week_key,
    pair_id,
    pair_title,
    total_points,
    updated_at
  )
  values (
    new.weekly_points_week,
    new.id,
    v_pair_title,
    coalesce(new.weekly_points, 0),
    now()
  )

  on conflict (week_key, pair_id)

  do update set
    pair_title =
      excluded.pair_title,

    total_points =
      excluded.total_points,

    updated_at =
      now();

  return new;
end;
$function$;
