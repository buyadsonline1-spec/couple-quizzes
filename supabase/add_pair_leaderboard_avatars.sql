-- Топ пар показывал вместо реальных фото просто эмодзи 💕 — в
-- weekly_pair_leaderboard никогда не было колонок с фото партнёров
-- (в отличие от weekly_user_leaderboard, где photo_url есть с самого
-- начала). Добавляем те же фото, что уже используются в соло-топе.
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

alter table public.weekly_pair_leaderboard
  add column if not exists partner_1_photo_url text,
  add column if not exists partner_2_photo_url text;

create or replace function public.sync_pair_weekly_leaderboard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_name_1 text;
  v_name_2 text;
  v_photo_1 text;
  v_photo_2 text;
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
      ),
      photo_url
    into v_name_1, v_photo_1

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
      ),
      photo_url
    into v_name_2, v_photo_2

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
    partner_1_photo_url,
    partner_2_photo_url,
    total_points,
    updated_at
  )
  values (
    new.weekly_points_week,
    new.id,
    v_pair_title,
    v_photo_1,
    v_photo_2,
    coalesce(new.weekly_points, 0),
    now()
  )

  on conflict (week_key, pair_id)

  do update set
    pair_title =
      excluded.pair_title,

    partner_1_photo_url =
      excluded.partner_1_photo_url,

    partner_2_photo_url =
      excluded.partner_2_photo_url,

    total_points =
      excluded.total_points,

    updated_at =
      now();

  return new;
end;
$function$;

-- Бэкафилл: перечитываем фото для уже существующих строк лидерборда
-- (иначе фикс подействует только на будущие обновления очков).
update public.pairs
   set weekly_points = weekly_points
 where weekly_points_week is not null;
