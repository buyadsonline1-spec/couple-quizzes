-- Wheel of prizes — full server-side rewrite, v3 (adds the "Bonus" tier).
-- Согласовано с ChatGPT (чат "Couple Quizzes") и Артёмом после
-- обсуждения вероятностей:
--   * клиент никогда не выбирает приз и не передаёт telegram_id —
--     исход (бонус или приз, категория, конкретный приз) выбирается
--     в БД через pgcrypto (не Math.random());
--   * колесо тратит SOLO-очки (2000 за вращение) и полностью
--     персональная механика — не трогает pair.* и не привязана к паре;
--   * лимит 3 "настоящих" вращения в день (по Europe/Helsinki) —
--     исход "ещё один прокрут" в этот лимит не засчитывается;
--   * каждое вращение — один из трёх исходов:
--       70% — Бонус (без реального приза): 35% "+500 очков",
--             35% "+1 прокрут колеса" (не считается в дневной лимит);
--       30% — реальный приз из каталога (RU или EN, в зависимости
--             от зафиксированного за пользователем reward_market);
--   * при 30%-й вероятности реального приза абсолютные (а не условные)
--     шансы конкретных призов настроены по ценности: Dyson ~1 из
--     100 000, SPA/Алиса ~1 из 12 000-15 000, сертификаты 5000₽
--     (WB/ЗЯ) ~1 из 7 000, сертификаты 2000₽/$50 ~1 из 1 200,
--     фотосессия/SPA(EN) ~1 из 1 800, театр/мастер-класс/$25 ~1 из
--     500, "средние" призы ~1 из 80-100, всё остальное — основная
--     масса реальных призов. Точный расчёт (скрипт + таблица) прислан
--     на ревью в чат с GPT;
--   * RU и EN — два независимых призовых пула (реальные разные призы,
--     а не перевод одного каталога); выбор пула можно менять до
--     ПЕРВОГО УСПЕШНОГО вращения, потом он фиксируется навсегда;
--   * история вращений хранится в wheel_spins (сервер — источник
--     истины, а не localStorage на устройстве), включая бонусные исходы;
--   * RLS включена на новых таблицах — читать/писать их напрямую
--     с клиента (anon/authenticated) нельзя, только через RPC.
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

-- pgcrypto в Supabase обычно живёт в схеме extensions, а не public.
-- Явно создаём схему и расширение там (no-op, если уже есть) и
-- добавляем эту схему в search_path функции ниже — так
-- gen_random_bytes()/gen_random_uuid() резолвятся независимо от того,
-- где именно расширение уже стоит в конкретном проекте.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ============================================================
-- 1. profiles: выбранный призовой рынок
-- ============================================================

alter table public.profiles
  add column if not exists reward_market text
    check (reward_market in ('ru', 'en')),
  add column if not exists reward_market_locked_at timestamptz,
  -- Банк бесплатных вращений, выигранных исходом "bonus_spin". Пока
  -- credits > 0, следующее вращение бесплатно (0 SOLO) и не считается
  -- в дневной лимит 3/день — см. spin_source в RPC ниже.
  add column if not exists wheel_bonus_spins integer not null default 0
    check (wheel_bonus_spins >= 0);

-- ============================================================
-- 2. Каталог РЕАЛЬНЫХ призов — два независимых пула (не локализация
--    друг друга): RU (WB/Золотое яблоко/SPA/Dyson/свидания...) и
--    EN (Amazon/Starbucks/Netflix/Spotify...). Разыгрывается только
--    в те 30% вращений, где выпал не Бонус, а настоящий приз.
-- ============================================================

create table if not exists public.wheel_reward_categories (
  id text not null,
  market text not null check (market in ('ru', 'en')),
  title text not null,
  emoji text not null,
  weight integer not null check (weight > 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  primary key (market, id)
);

create table if not exists public.wheel_reward_items (
  id text not null,
  market text not null check (market in ('ru', 'en')),
  category_id text not null,
  title text not null,
  weight integer not null check (weight > 0),
  active boolean not null default true,
  primary key (market, id),
  foreign key (market, category_id)
    references public.wheel_reward_categories (market, id)
);

alter table public.wheel_reward_categories enable row level security;
alter table public.wheel_reward_items enable row level security;
-- Никаких policy не создаём: по умолчанию RLS без policy = запрет всем,
-- кроме service_role/владельца. Клиент читает каталог только через RPC.

-- ---- seed: RU --------------------------------------------------
--
-- ВАЖНО: это НЕ старые веса из rewards-ru.ts (те не учитывали
-- реальную ценность призов) и НЕ "условные" веса из прошлой версии
-- этого файла (там расчёт не учитывал новый 30%-й Бонус-фильтр).
-- Числа ниже — это уже готовые "условные на реальный приз" веса,
-- подобранные так, что итоговая АБСОЛЮТНАЯ вероятность (с учётом 30%)
-- совпадает с целевыми значениями из ревью:
--   dyson-hairdryer  ~1 из 100 000      wb2000/goldapple2000 ~1 из 1 200
--   spa-for-two      ~1 из 15 000       photoshoot            ~1 из 1 800
--   alisa-speaker    ~1 из 12 000       theatre/pottery       ~1 из 500
--   wb5000/goldapple5000 ~1 из 7 000    wb1000/goldapple1000  ~1 из 100
-- остальное (wb500, goldapple300, romantic-dinner, cinema, pajamas,
-- socks, rolls, tshirts, bowling, goldapple500, boardgame) — основная
-- масса реальных призов (доли % до нескольких %). Сумма условных
-- вероятностей по всем 23 позициям = 100.000000%, что при умножении
-- на 30% даёt ровно 30% от всех вращений — проверено скриптом.

insert into public.wheel_reward_categories (id, market, title, emoji, weight, sort_order) values
  ('dyson',      'ru', 'Dyson',       '💨',  33, 1),
  ('spa',        'ru', 'SPA',         '🧖',  222, 2),
  ('alisa',      'ru', 'Алиса',       '🔊',  278, 3),
  ('wb',         'ru', 'WB',          '🛍️', 152019, 4),
  ('goldapple',  'ru', 'ЗЯ',          '💄',  186895, 5),
  ('dates',      'ru', 'Свидания',    '💖',  124073, 6),
  ('tickets',    'ru', 'Билеты',      '🎟️', 108518, 7),
  ('pair-items', 'ru', 'Парные',      '👕',  206789, 8),
  ('food',       'ru', 'Еда',         '🍣',  135802, 9),
  ('activities', 'ru', 'Активности',  '🎳',  85370, 10)
on conflict (market, id) do update set
  title = excluded.title,
  emoji = excluded.emoji,
  weight = excluded.weight,
  sort_order = excluded.sort_order;

insert into public.wheel_reward_items (id, market, category_id, title, weight) values
  ('dyson-hairdryer', 'ru', 'dyson',      'Фен Dyson', 1000000),
  ('spa-for-two',     'ru', 'spa',        'Сертификат в SPA на двоих', 1000000),
  ('alisa-speaker',   'ru', 'alisa',      'Умная колонка Алиса', 1000000),
  ('wb500',           'ru', 'wb',         'Подарочный сертификат WB 500₽', 759324),
  ('wb1000',          'ru', 'wb',         'Подарочный сертификат WB 1000₽', 219271),
  ('wb2000',          'ru', 'wb',         'Подарочный сертификат WB 2000₽', 18273),
  ('wb5000',          'ru', 'wb',         'Подарочный сертификат WB 5000₽', 3132),
  ('goldapple300',    'ru', 'goldapple',  'Купон "Золотое яблоко" 300₽', 581295),
  ('goldapple500',    'ru', 'goldapple',  'Купон "Золотое яблоко" 500₽', 222941),
  ('goldapple1000',   'ru', 'goldapple',  'Купон "Золотое яблоко" 1000₽', 178353),
  ('goldapple2000',   'ru', 'goldapple',  'Купон "Золотое яблоко" 2000₽', 14863),
  ('goldapple5000',   'ru', 'goldapple',  'Купон "Золотое яблоко" 5000₽', 2548),
  ('photoshoot',      'ru', 'dates',      'Парная фотосессия', 14925),
  ('romantic-dinner', 'ru', 'dates',      'Романтический ужин «Вкусно и точка»', 985075),
  ('cinema',          'ru', 'tickets',    'Два билета в кино', 938566),
  ('theatre',         'ru', 'tickets',    'Два билета в театр', 61434),
  ('pajamas',         'ru', 'pair-items', 'Парные пижамки', 262686),
  ('tshirts',         'ru', 'pair-items', 'Парные футболочки', 179105),
  ('socks',           'ru', 'pair-items', 'Носочки для него / для неё', 558208),
  ('rolls',           'ru', 'food',       'Доставка роллов', 1000000),
  ('pottery',         'ru', 'activities', 'Мастер-класс гончарный', 78091),
  ('bowling',         'ru', 'activities', 'Боулинг на двоих', 433839),
  ('boardgame',       'ru', 'activities', 'Настольная игра для пары', 488069)
on conflict (market, id) do update set
  category_id = excluded.category_id,
  title = excluded.title,
  weight = excluded.weight;

-- ---- seed: EN ----------------------------------------------------
-- Та же логика: EN-призы дешевле и без одного "супер-приза" вроде
-- Dyson. Топ по цене (Amazon $50, Starbucks $25, Spa for Two) — на
-- уровне 1 из 500-1800 от всех вращений, "средние" (Apple/Netflix/
-- Date Night Box/Board Game) ~1 из 90-100, остальное — основная масса.

insert into public.wheel_reward_categories (id, market, title, emoji, weight, sort_order) values
  ('amazon',        'en', 'Amazon',        '🛒', 272941, 1),
  ('coffee',        'en', 'Coffee',        '☕', 175519, 2),
  ('date-night',    'en', 'Date Night',    '💖', 221359, 3),
  ('subscriptions', 'en', 'Subscriptions', '🎁', 188567, 4),
  ('couple-items',  'en', 'Couple Gifts',  '🧸', 141615, 5)
on conflict (market, id) do update set
  title = excluded.title,
  emoji = excluded.emoji,
  weight = excluded.weight,
  sort_order = excluded.sort_order;

insert into public.wheel_reward_items (id, market, category_id, title, weight) values
  ('amazon-10',        'en', 'amazon',        'Amazon Gift Card $10', 618639),
  ('amazon-25',        'en', 'amazon',        'Amazon Gift Card $25', 371184),
  ('amazon-50',        'en', 'amazon',        'Amazon Gift Card $50', 10177),
  ('starbucks-10',     'en', 'coffee',        'Starbucks Gift Card $10', 962017),
  ('starbucks-25',     'en', 'coffee',        'Starbucks Gift Card $25', 37983),
  ('movie-two',        'en', 'date-night',    'Movie Tickets for Two', 610236),
  ('dinner-two',       'en', 'date-night',    'Dinner for Two', 381398),
  ('spa-two',          'en', 'date-night',    'Spa for Two', 8366),
  ('spotify-premium',  'en', 'subscriptions', 'Spotify Premium', 626814),
  ('netflix-gift',     'en', 'subscriptions', 'Netflix Gift Subscription', 196413),
  ('apple-gift',       'en', 'subscriptions', 'Apple Gift Card', 176772),
  ('matching-hoodies', 'en', 'couple-items',  'Matching Hoodies', 476933),
  ('date-box',         'en', 'couple-items',  'Date Night Box', 261534),
  ('board-game',       'en', 'couple-items',  'Couples Board Game', 261534)
on conflict (market, id) do update set
  category_id = excluded.category_id,
  title = excluded.title,
  weight = excluded.weight;

-- ============================================================
-- 3. История вращений — сервер как источник истины (не localStorage).
--    Снэпшот title'ов, чтобы правки каталога не переписывали историю.
--    pair_id намеренно НЕ храним: колесо — чисто персональная механика
--    (SOLO пользователя -> spin -> личный исход), пары тут ни при чём.
--
--    outcome_type различает РЕЗУЛЬТАТ вращения:
--      'prize'        — реальный приз из каталога (category_id/item_id
--                        ссылаются на wheel_reward_categories/items);
--      'bonus_points'  — +500 очков вместо приза;
--      'bonus_spin'    — начисляет +1 в profiles.wheel_bonus_spins
--                        (кредит на бесплатное будущее вращение).
--                        Для обоих bonus_* category_id/item_id —
--                        служебные значения 'bonus'/'bonus-points'|
--                        'bonus-spin', чтобы не делать эти колонки
--                        nullable.
--
--    spin_source различает, ЗА ЧТО было куплено САМО вращение:
--      'paid'         — обычное, списаны 2000 SOLO, считается в
--                        дневной лимит 3/день;
--      'bonus_credit'  — оплачено credit'ом из wheel_bonus_spins
--                        (0 SOLO, НЕ считается в дневной лимит).
-- ============================================================

create table if not exists public.wheel_spins (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null,
  market text not null check (market in ('ru', 'en')),
  outcome_type text not null default 'prize'
    check (outcome_type in ('prize', 'bonus_points', 'bonus_spin')),
  spin_source text not null default 'paid'
    check (spin_source in ('paid', 'bonus_credit')),
  category_id text not null,
  category_title text not null,
  item_id text not null,
  item_title text not null,
  bonus_value integer,
  spent_points integer not null,
  spin_date date not null,
  spin_number integer not null,
  fulfillment_status text not null default 'won'
    check (fulfillment_status in ('won', 'contacted', 'fulfilled', 'cancelled')),
  created_at timestamptz not null default now(),
  -- Жёсткая защита от задвоения на уровне БД: даже если бы в RPC был
  -- баг подсчёта spin_number, вставить два одинаковых номера за один
  -- день одному пользователю физически нельзя. spin_number — порядковый
  -- номер СРЕДИ ВСЕХ вращений дня (paid + bonus_credit), только для
  -- уникальности; дневной лимит считается отдельно по spin_source
  -- (см. RPC).
  unique (telegram_id, spin_date, spin_number)
);

create index if not exists wheel_spins_telegram_date_idx
  on public.wheel_spins (telegram_id, spin_date);

alter table public.wheel_spins enable row level security;
-- Без policy: клиент не читает и не пишет эту таблицу напрямую,
-- только через RPC/сервисный ключ.

-- ============================================================
-- 4. RPC spin_reward_wheel — вся механика одной транзакцией:
--    блокировка профиля, выбор источника вращения (обычное платное
--    или бесплатное за счёт кредита wheel_bonus_spins), лимит 3/день
--    для платных вращений, проверка баланса, честный трёхсторонний
--    выбор исхода (Бонус-очки / Бонус-прокрут / реальный приз,
--    pgcrypto), списание, запись истории. Доступ только у
--    service_role — клиент вызывает это исключительно через
--    /api/rewards/spin после проверки Telegram initData.
-- ============================================================

create or replace function public.spin_reward_wheel(
  p_telegram_id bigint,
  p_suggested_market text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_spin_cost constant integer := 2000;
  v_daily_limit constant integer := 3;

  -- Бонус против реального приза: 70% / 30%, поровну между двумя
  -- видами бонуса (35% + 35%).
  v_bonus_points_threshold constant numeric := 0.35;
  v_bonus_spin_threshold constant numeric := 0.70;
  v_bonus_points_value constant integer := 500;

  v_today date;
  v_profile record;
  v_market text;

  v_spin_source text;
  v_actual_cost integer;

  v_paid_spins_today integer;
  v_total_spins_today integer;
  v_spin_number integer;

  v_outcome_roll numeric;
  v_outcome_type text;

  v_total_category_weight numeric;
  v_category_pick numeric;
  v_category_id text;
  v_category_title text;
  v_running_category numeric;
  v_cat_row record;

  v_total_item_weight numeric;
  v_item_pick numeric;
  v_item_id text;
  v_item_title text;
  v_running_item numeric;
  v_item_row record;
  v_bonus_value integer;

  v_next_solo_points integer;
  v_next_bonus_spins integer;
  v_next_paid_spins integer;
  v_spin_id uuid;
  v_locked_at timestamptz;
begin
  v_today := (now() at time zone 'Europe/Helsinki')::date;

  -- Лочим строку профиля: двойной клик / два одновременных запроса
  -- одного пользователя не смогут дважды пройти проверки ниже.
  select telegram_id, solo_points, reward_market, reward_market_locked_at,
         coalesce(wheel_bonus_spins, 0) as wheel_bonus_spins
    into v_profile
    from public.profiles
    where telegram_id = p_telegram_id
    for update;

  if not found then
    return jsonb_build_object('awarded', false, 'reason', 'profile-not-found');
  end if;

  -- Sanity-защита: если рынок уже зафиксирован, но само значение почему-то
  -- повреждено (не должно происходить при нормальной работе RPC, но лучше
  -- явно отказать, чем тянуть невалидный market дальше в подбор приза).
  if
    v_profile.reward_market_locked_at is not null
    and v_profile.reward_market not in ('ru', 'en')
  then
    return jsonb_build_object('awarded', false, 'reason', 'invalid-locked-market');
  end if;

  -- Призовой рынок: как только зафиксирован (reward_market_locked_at
  -- не null) — клиент больше НИКАК не может на него повлиять, даже
  -- через p_suggested_market. До первого успешного спина выбор ещё
  -- можно поменять (реально записываем его в profiles только внизу,
  -- вместе со списанием, а не здесь — иначе рынок залипал бы уже
  -- после первой НЕудачной попытки, например при insufficient-points).
  if v_profile.reward_market_locked_at is not null then
    v_market := v_profile.reward_market;
  else
    v_market :=
      case
        when p_suggested_market in ('ru', 'en') then p_suggested_market
        else coalesce(v_profile.reward_market, 'ru')
      end;
  end if;

  -- Источник вращения: если есть накопленный кредит bonus_spin — это
  -- вращение бесплатное и не считается в дневной лимит. Иначе обычное
  -- платное вращение, для которого и проверяем лимит/баланс ниже.
  -- spin_number (для уникальности) считаем по ВСЕМ вращениям дня,
  -- дневной лимит — только по 'paid'.
  select count(*) filter (where spin_source = 'paid'), count(*)
    into v_paid_spins_today, v_total_spins_today
    from public.wheel_spins
    where telegram_id = p_telegram_id
      and spin_date = v_today;

  v_paid_spins_today := coalesce(v_paid_spins_today, 0);
  v_total_spins_today := coalesce(v_total_spins_today, 0);

  if v_profile.wheel_bonus_spins > 0 then
    v_spin_source := 'bonus_credit';
    v_actual_cost := 0;
  else
    v_spin_source := 'paid';
    v_actual_cost := v_spin_cost;

    if v_paid_spins_today >= v_daily_limit then
      return jsonb_build_object(
        'awarded', false,
        'reason', 'daily-limit-reached',
        'spinsUsedToday', v_paid_spins_today,
        'spinsRemainingToday', 0,
        'bonusSpinCredits', v_profile.wheel_bonus_spins
      );
    end if;

    if coalesce(v_profile.solo_points, 0) < v_spin_cost then
      return jsonb_build_object(
        'awarded', false,
        'reason', 'insufficient-points',
        'soloPoints', coalesce(v_profile.solo_points, 0),
        'spinsUsedToday', v_paid_spins_today,
        'spinsRemainingToday', v_daily_limit - v_paid_spins_today,
        'bonusSpinCredits', v_profile.wheel_bonus_spins
      );
    end if;
  end if;

  -- ---- честный трёхсторонний бросок: bonus_points / bonus_spin / prize ----
  -- 6 честных случайных байт (pgcrypto) -> целое в [0, 2^48) -> [0, 1).

  v_outcome_roll :=
    (('x' || encode(gen_random_bytes(6), 'hex'))::bit(48)::bigint)::numeric
    / 281474976710656.0;

  if v_outcome_roll < v_bonus_points_threshold then
    v_outcome_type := 'bonus_points';
  elsif v_outcome_roll < v_bonus_spin_threshold then
    v_outcome_type := 'bonus_spin';
  else
    v_outcome_type := 'prize';
  end if;

  if v_outcome_type = 'prize' then
    -- ---- честный выбор категории ----

    select coalesce(sum(weight), 0) into v_total_category_weight
      from public.wheel_reward_categories
      where market = v_market and active;

    if v_total_category_weight is null or v_total_category_weight <= 0 then
      return jsonb_build_object('awarded', false, 'reason', 'no-categories');
    end if;

    v_category_pick :=
      (('x' || encode(gen_random_bytes(6), 'hex'))::bit(48)::bigint)::numeric
      / 281474976710656.0
      * v_total_category_weight;

    v_running_category := 0;
    for v_cat_row in
      select id, title, weight
      from public.wheel_reward_categories
      where market = v_market and active
      order by id
    loop
      v_running_category := v_running_category + v_cat_row.weight;
      if v_category_pick < v_running_category then
        v_category_id := v_cat_row.id;
        v_category_title := v_cat_row.title;
        exit;
      end if;
    end loop;

    if v_category_id is null then
      return jsonb_build_object('awarded', false, 'reason', 'category-pick-failed');
    end if;

    -- ---- честный выбор приза внутри категории ----

    select coalesce(sum(weight), 0) into v_total_item_weight
      from public.wheel_reward_items
      where market = v_market and category_id = v_category_id and active;

    if v_total_item_weight is null or v_total_item_weight <= 0 then
      return jsonb_build_object('awarded', false, 'reason', 'no-items');
    end if;

    v_item_pick :=
      (('x' || encode(gen_random_bytes(6), 'hex'))::bit(48)::bigint)::numeric
      / 281474976710656.0
      * v_total_item_weight;

    v_running_item := 0;
    for v_item_row in
      select id, title, weight
      from public.wheel_reward_items
      where market = v_market and category_id = v_category_id and active
      order by id
    loop
      v_running_item := v_running_item + v_item_row.weight;
      if v_item_pick < v_running_item then
        v_item_id := v_item_row.id;
        v_item_title := v_item_row.title;
        exit;
      end if;
    end loop;

    if v_item_id is null then
      return jsonb_build_object('awarded', false, 'reason', 'item-pick-failed');
    end if;

    v_bonus_value := null;

  elsif v_outcome_type = 'bonus_points' then
    v_category_id := 'bonus';
    v_category_title := 'Бонус';
    v_item_id := 'bonus-points';
    v_item_title := '+' || v_bonus_points_value || ' очков';
    v_bonus_value := v_bonus_points_value;

  else -- bonus_spin
    v_category_id := 'bonus';
    v_category_title := 'Бонус';
    v_item_id := 'bonus-spin';
    v_item_title := '+1 прокрут колеса';
    v_bonus_value := 1;
  end if;

  -- ---- эффекты хода: SOLO-очки, банк bonus_spin, дневной лимит ----
  --
  -- solo_points: списываем v_actual_cost (2000, если это платное
  -- вращение; 0, если оплачено кредитом), и сразу возвращаем бонус,
  -- если выпали bonus_points. Weekly SOLO и всё PAIR не трогаем.
  --
  -- wheel_bonus_spins: -1, если это вращение потратило кредит, +1,
  -- если выпал сам исход bonus_spin (оба могут произойти одновременно
  -- — потратили кредит и тут же выиграли новый, банк не меняется).
  --
  -- Рынок и его локовку пишем именно тут, в момент реального успеха,
  -- а не раньше (см. комментарий выше).

  v_next_solo_points :=
    coalesce(v_profile.solo_points, 0)
    - v_actual_cost
    + case when v_outcome_type = 'bonus_points' then v_bonus_points_value else 0 end;

  v_next_bonus_spins :=
    v_profile.wheel_bonus_spins
    - case when v_spin_source = 'bonus_credit' then 1 else 0 end
    + case when v_outcome_type = 'bonus_spin' then 1 else 0 end;

  v_next_paid_spins :=
    v_paid_spins_today + case when v_spin_source = 'paid' then 1 else 0 end;

  v_locked_at := coalesce(v_profile.reward_market_locked_at, now());

  update public.profiles
     set solo_points = v_next_solo_points,
         reward_market = v_market,
         reward_market_locked_at = v_locked_at,
         wheel_bonus_spins = v_next_bonus_spins
   where telegram_id = p_telegram_id;

  v_spin_number := v_total_spins_today + 1;

  insert into public.wheel_spins (
    telegram_id, market, outcome_type, spin_source,
    category_id, category_title,
    item_id, item_title, bonus_value,
    spent_points, spin_date, spin_number
  ) values (
    p_telegram_id, v_market, v_outcome_type, v_spin_source,
    v_category_id, v_category_title,
    v_item_id, v_item_title, v_bonus_value,
    v_actual_cost, v_today, v_spin_number
  )
  returning id into v_spin_id;

  return jsonb_build_object(
    'awarded', true,
    'reason', 'rewarded',
    'spinId', v_spin_id,
    'market', v_market,
    'outcomeType', v_outcome_type,
    'spinSource', v_spin_source,
    'categoryId', v_category_id,
    'categoryTitle', v_category_title,
    'itemId', v_item_id,
    'itemTitle', v_item_title,
    'bonusValue', v_bonus_value,
    'spentPoints', v_actual_cost,
    'soloPoints', v_next_solo_points,
    'bonusSpinCredits', v_next_bonus_spins,
    'spinsUsedToday', v_next_paid_spins,
    'spinsRemainingToday', v_daily_limit - v_next_paid_spins
  );
end;
$$;

-- Только service_role может вызывать эту функцию (клиент — только
-- через /api/rewards/spin, после проверки Telegram initData).
-- revoke all снимает и умолчательный PUBLIC grant, поэтому service_role
-- явно перегранчиваем отдельной строкой ниже.
revoke all on function public.spin_reward_wheel(bigint, text) from public;
revoke all on function public.spin_reward_wheel(bigint, text) from anon;
revoke all on function public.spin_reward_wheel(bigint, text) from authenticated;
grant execute on function public.spin_reward_wheel(bigint, text) to service_role;
