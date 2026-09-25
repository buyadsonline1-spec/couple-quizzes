-- Правка предыдущей разовой выдачи: кредит на бесплатный прокрут
-- ушёл не туда (@Aaskarddd вместо @Askardik) — снимаем с одного,
-- начисляем другому. wheel_bonus_spins защищён CHECK (>= 0), поэтому
-- снятие через greatest(...- 1, 0), а не голое -1, чтобы не словить
-- ошибку constraint'а, если он уже успел потратить кредит сам.
--
-- Применять в Supabase → SQL Editor, целиком, одним запуском.

update public.profiles
   set wheel_bonus_spins = greatest(wheel_bonus_spins - 1, 0)
 where username ilike 'Aaskarddd';

update public.profiles
   set wheel_bonus_spins = wheel_bonus_spins + 1
 where username ilike 'Askardik';

-- Проверить результат:
select telegram_id, username, wheel_bonus_spins
  from public.profiles
 where username ilike 'Aaskarddd' or username ilike 'Askardik';
