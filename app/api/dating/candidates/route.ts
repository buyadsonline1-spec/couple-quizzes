import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";
import { checkIsPremium } from "@/lib/server/pair-state";
import { loadPollAnswersForTelegramId } from "@/lib/server/reads";
import { calculateDatingCompatibility } from "@/lib/server/dating-compatibility";

type Candidate = {
  telegramId: number;
  displayName: string;
  age: number;
  bio: string | null;
  photoUrl: string | null;
  gender: "boy" | "girl";
  personalitySummary: Record<string, unknown>;
};

// Раздел открыт всем — этот лимит только про то, сколько анкет можно
// пролистать (свайпнуть) в день без Premium; сам факт входа/просмотра
// ленты Premium не требует. Держим то же число, что и в
// record_dating_swipe (SQL — источник истины при реальном свайпе, это
// только для отображения "осталось N сегодня" на клиенте).
const FREE_DAILY_SWIPE_LIMIT = 5;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const validation = await validateRequestAuth(body);

    if (!validation.valid || !validation.telegramId) {
      return NextResponse.json(
        { error: "Invalid Telegram data" },
        { status: 401 }
      );
    }

    const [isPremium, { data: selfProfile }, { data: rpcData, error: rpcError }, swipesToday] =
      await Promise.all([
        checkIsPremium(validation.telegramId),
        supabaseAdmin
          .from("dating_profiles")
          .select("gender")
          .eq("telegram_id", validation.telegramId)
          .maybeSingle(),
        supabaseAdmin.rpc("get_dating_candidates", {
          p_telegram_id: validation.telegramId,
          p_limit: 30,
        }),
        supabaseAdmin
          .rpc("get_dating_swipes_today", { p_telegram_id: validation.telegramId })
          .then((res) => Number(res.data ?? 0)),
      ]);

    const dailyLimit = {
      isPremium,
      remaining: isPremium
        ? null
        : Math.max(0, FREE_DAILY_SWIPE_LIMIT - swipesToday),
    };

    if (rpcError || !rpcData?.ok) {
      return NextResponse.json(
        { ok: false, reason: rpcData?.reason || "internal-error" },
        { status: rpcData?.reason === "no-profile" ? 400 : 500 }
      );
    }

    const candidates: Candidate[] = rpcData.candidates ?? [];

    if (candidates.length === 0 || !selfProfile?.gender) {
      return NextResponse.json({ ok: true, candidates: [], dailyLimit });
    }

    const selfAnswers = await loadPollAnswersForTelegramId(
      validation.telegramId
    );

    // Ответы всех кандидатов одним запросом, не по одному — иначе
    // N+1 на каждый показ ленты.
    const candidateIds = candidates.map((c) => c.telegramId);
    const { data: answerRows } = await supabaseAdmin
      .from("poll_submissions")
      .select("telegram_id, poll_id, answers")
      .in("telegram_id", candidateIds);

    const answersByTelegramId = new Map<number, Record<string, number[]>>();
    for (const row of answerRows ?? []) {
      if (!row?.poll_id || !Array.isArray(row.answers)) continue;
      const existing = answersByTelegramId.get(row.telegram_id) ?? {};
      existing[row.poll_id] = row.answers.map((v: unknown) => Number(v));
      answersByTelegramId.set(row.telegram_id, existing);
    }

    const scored = candidates.map((candidate) => {
      const candidateAnswers =
        answersByTelegramId.get(candidate.telegramId) ?? {};

      const compatibility = calculateDatingCompatibility(
        selfAnswers,
        selfProfile.gender as "boy" | "girl",
        candidateAnswers,
        candidate.gender
      );

      return { ...candidate, compatibility };
    });

    // Выше совместимость — выше в списке; у кого 0 общих тем (никто
    // ещё не прошёл опросы) — в конец, а не вперемешку со случайным
    // порядком.
    scored.sort(
      (a, b) => b.compatibility.overallPercent - a.compatibility.overallPercent
    );

    return NextResponse.json({ ok: true, candidates: scored });
  } catch (error) {
    console.error("DATING CANDIDATES ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
