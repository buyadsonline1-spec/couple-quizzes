import { supabaseAdmin } from "@/lib/server/supabase-admin";

// Серверная копия клиентских loadPairStateForUser()/loadPremiumStatus()
// из app/page.tsx — используется в /api/bootstrap, /api/pair/state и
// возвращается сразу из /api/pair/create и /api/pair/join (чтобы не
// заставлять клиента делать отдельный round-trip за свежим состоянием
// после мутации). Форма объекта совпадает с клиентским типом PairState
// один в один, чтобы фронтенду не пришлось ничего адаптировать.

export type PairMemberPayload = {
  telegramId: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
};

export type PairStatePayload = {
  pairId: string | null;
  inviteCode: string | null;
  partner: PairMemberPayload | null;
  createdByTelegramId: number | null;
  totalPoints: number;
  weeklyPoints: number;
  // Legacy-поля — реальный лимит теперь считает consume_daily_access
  // (см. supabase/pairs_profiles_server_side.sql), это только для
  // обратной совместимости формы PairState на клиенте.
  dailyTestsUsed: number;
  dailyPollsUsed: number;
  dailyGamesUsed: number;
  dailyLimitDate: string | null;
  isPremium?: boolean;
  weeklyTopRewardClaimedWeek: string | null;
};

export const EMPTY_PAIR_STATE: PairStatePayload = {
  pairId: null,
  inviteCode: null,
  partner: null,
  createdByTelegramId: null,
  totalPoints: 0,
  weeklyPoints: 0,
  dailyTestsUsed: 0,
  dailyPollsUsed: 0,
  dailyGamesUsed: 0,
  dailyLimitDate: null,
  isPremium: false,
  weeklyTopRewardClaimedWeek: null,
};

function getCurrentWeekKeyServer(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
  const week = Math.ceil(dayOfYear / 7);
  return `${now.getFullYear()}-W${week}`;
}

export async function loadPairStateForTelegramId(
  telegramId: number
): Promise<PairStatePayload> {
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("pair_id")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (profileError || !profile?.pair_id) {
    return EMPTY_PAIR_STATE;
  }

  const { data: pair, error: pairError } = await supabaseAdmin
    .from("pairs")
    .select("*")
    .eq("id", profile.pair_id)
    .single();

  if (pairError || !pair) {
    return EMPTY_PAIR_STATE;
  }

  const partner1Id =
    pair.partner_1_telegram_id != null ? Number(pair.partner_1_telegram_id) : null;
  const partner2Id =
    pair.partner_2_telegram_id != null ? Number(pair.partner_2_telegram_id) : null;
  const createdByTelegramId =
    pair.created_by_telegram_id != null ? Number(pair.created_by_telegram_id) : null;

  const rawPartnerTelegramId =
    partner1Id === telegramId ? partner2Id : partner1Id;

  const partnerTelegramId =
    rawPartnerTelegramId && rawPartnerTelegramId !== telegramId
      ? rawPartnerTelegramId
      : null;

  let partner: PairMemberPayload | null = null;

  if (partnerTelegramId) {
    const { data: partnerProfile } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("telegram_id", partnerTelegramId)
      .maybeSingle();

    if (partnerProfile) {
      partner = {
        telegramId: Number(partnerProfile.telegram_id),
        firstName: partnerProfile.first_name ?? undefined,
        lastName: partnerProfile.last_name ?? undefined,
        username: partnerProfile.username ?? undefined,
        photoUrl: partnerProfile.photo_url ?? undefined,
      };
    }
  }

  return {
    pairId: pair.id,
    inviteCode: pair.invite_code,
    partner,
    createdByTelegramId,
    totalPoints: pair.total_points ?? 0,
    dailyTestsUsed: 0,
    dailyPollsUsed: 0,
    dailyGamesUsed: 0,
    dailyLimitDate: pair.daily_limit_date ?? null,
    isPremium: false,
    weeklyPoints:
      pair.weekly_points_week === getCurrentWeekKeyServer()
        ? pair.weekly_points ?? 0
        : 0,
    weeklyTopRewardClaimedWeek: pair.weekly_top_reward_claimed_week ?? null,
  };
}

// Та же логика, что и в клиентском loadPremiumStatus() (после фикса
// истечения free_premium — см. app/api/check-free-premium/route.ts):
// если задан expires_at, он и решает, независимо от плана; expires_at
// is null считается бессрочным только для legacy free_premium-записей.
export async function checkIsPremium(telegramId: number): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("plan, status, expires_at")
    .eq("telegram_id", telegramId)
    .eq("status", "active");

  if (error || !data?.length) {
    return false;
  }

  return data.some((sub) => {
    if (sub.expires_at) {
      return new Date(sub.expires_at) > new Date();
    }
    return sub.plan === "free_premium";
  });
}
