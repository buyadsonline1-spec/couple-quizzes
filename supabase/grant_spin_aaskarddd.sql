-- Разовая ручная выдача +1 бесплатного прокрута колеса аккаунту
-- @Aaskarddd (просьба пользователя в чате) — не баг-фикс, просто
-- начисление кредита в profiles.wheel_bonus_spins, который тратится
-- в spin_reward_wheel точно так же, как кредит, выигранный на колесе.
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

update public.profiles
   set wheel_bonus_spins = wheel_bonus_spins + 1
 where username ilike 'Aaskarddd';

-- Проверить результат:
select telegram_id, username, wheel_bonus_spins
  from public.profiles
 where username ilike 'Aaskarddd';
