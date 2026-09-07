import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";
import { loadPollAnswersForTelegramId } from "@/lib/server/reads";
import { calculateDatingCompatibility } from "@/lib/server/dating-compatibility";

type IncomingLike = {
  telegramId: number;
  displayName: string;
  age: number;
  bio: string | null;
  photoUrl: string | null;
  gender: "boy" | "girl";
  personalitySummary: Record<string, unknown>;
  likedAt: string;
};

// "Лайки мне" — кто уже лайкнул, но ответа от меня ещё не было. Отдельно
// от /api/dating/candidates (моя лента для свайпа) и /api/dating/matches
// (уже взаимные лайки). Сам просмотр списка бесплатный — лимит и
// Premium касаются только фактического свайпа (см. /api/dating/swipe),
// который выполняется тем же путём, что и из обычной ленты.
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

    const [{ data: selfProfile }, { data: rpcData, error: rpcError }] =
      await Promise.all([
        supabaseAdmin
          .from("dating_profiles")
          .select("gender")
          .eq("telegram_id", validation.telegramId)
          .maybeSingle(),
        supabaseAdmin.rpc("get_dating_incoming_likes", {
          p_telegram_id: validation.telegramId,
          p_limit: 30,
        }),
      ]);

    if (rpcError || !rpcData?.ok) {
      return NextResponse.json(
        { ok: false, reason: rpcData?.reason || "internal-error" },
        { status: rpcData?.reason === "no-profile" ? 400 : 500 }
      );
    }

    const likes: IncomingLike[] = rpcData.candidates ?? [];

    if (likes.length === 0 || !selfProfile?.gender) {
      return NextResponse.json({ ok: true, likes: [] });
    }

    const selfAnswers = await loadPollAnswersForTelegramId(
      validation.telegramId
    );

    const likeIds = likes.map((l) => l.telegramId);
    const { data: answerRows } = await supabaseAdmin
      .from("poll_submissions")
      .select("telegram_id, poll_id, answers")
      .in("telegram_id", likeIds);

    const answersByTelegramId = new Map<number, Record<string, number[]>>();
    for (const row of answerRows ?? []) {
      if (!row?.poll_id || !Array.isArray(row.answers)) continue;
      const existing = answersByTelegramId.get(row.telegram_id) ?? {};
      existing[row.poll_id] = row.answers.map((v: unknown) => Number(v));
      answersByTelegramId.set(row.telegram_id, existing);
    }

    const scored = likes.map((like) => {
      const likeAnswers = answersByTelegramId.get(like.telegramId) ?? {};

      const compatibility = calculateDatingCompatibility(
        selfAnswers,
        selfProfile.gender as "boy" | "girl",
        likeAnswers,
        like.gender
      );

      return { ...like, compatibility };
    });

    return NextResponse.json({ ok: true, likes: scored });
  } catch (error) {
    console.error("DATING LIKES ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
