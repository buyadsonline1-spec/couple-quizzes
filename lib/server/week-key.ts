// Единый формат "недели" для еженедельных очков (не ISO-неделя —
// см. supabase/weekly_pair_top_reward.sql, public.cq_week_key):
//   dayOfYear = (дата - 1 января) + 1
//   week      = ceil(dayOfYear / 7)
// результат вида "2026-W31", без ведущего нуля.
//
// Раньше версии этой функции в app/api/activity/award/route.ts и
// app/api/referral/claim/route.ts считали dayOfYear по new Date() —
// то есть по UTC-времени сервера (Vercel), а не по часовому поясу
// продукта (Europe/Helsinki, как todayInHelsinki() в
// app/api/rewards/state/route.ts и v_today в claim_daily_bonus/
// weekly_pair_top_reward). Несколько часов в году (вечер субботы по
// Хельсинки, когда в UTC уже воскресенье, и наоборот) очки за квиз/
// опрос могли уйти в другую неделю, чем дневной бонус или недельная
// награда пары — SOLO/pair weekly-очки расходились на границе недели.
export function getCurrentWeekKey(): string {
  const helsinkiDate = new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Helsinki",
  }); // "YYYY-MM-DD"
  const [yearStr, monthStr, dayStr] = helsinkiDate.split("-");
  const year = Number(yearStr);
  const startOfYearUtc = Date.UTC(year, 0, 1);
  const dateUtc = Date.UTC(year, Number(monthStr) - 1, Number(dayStr));
  const dayOfYear = Math.round((dateUtc - startOfYearUtc) / (1000 * 60 * 60 * 24)) + 1;
  const week = Math.ceil(dayOfYear / 7);
  return `${year}-W${week}`;
}
