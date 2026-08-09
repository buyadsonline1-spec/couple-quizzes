import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateTelegramInitData } from "@/lib/server/telegram-auth";
import { loadPairPollAnswersForPair } from "@/lib/server/reads";
import { POLL_IDS } from "@/config/reward-catalog";

// Раньше клиент писал в poll_submissions напрямую
// (supabase.from("poll_submissions").upsert({pair_id, telegram_id,
// poll_id, answers}, ...)), с pairId/telegramId прямо из React state —
// можно было подделать ответы партнёра и исказить % совместимости
// пары. Не денежная дыра (очки за опрос идут через отдельный
// activity_point_claims-whitelist в /api/activity/award), но
// integrity/privacy — переносим на сервер вместе с остальными.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const initData = typeof body.initData === "string" ? body.initData : "";
    const pollId = typeof body.pollId === "string" ? body.pollId : "";
    const answers = Array.isArray(body.answers) ? body.answers : null;

    const validation = validateTelegramInitData(initData);

    if (!validation.valid || !validation.telegramId) {
      return NextResponse.json(
        { error: "Invalid Telegram data" },
        { status: 401 }
      );
    }

    if (!POLL_IDS.includes(pollId)) {
      return NextResponse.json(
        { ok: false, reason: "invalid-poll" },
        { status: 400 }
      );
    }

    if (
      !answers ||
      answers.length === 0 ||
      answers.length > 50 ||
      !answers.every(
        (value: unknown) =>
          typeof value === "number" &&
          Number.isInteger(value) &&
          value >= 0 &&
          value <= 10
      )
    ) {
      return NextResponse.json(
        { ok: false, reason: "invalid-answers" },
        { status: 400 }
      );
    }

    // pairId сервер берёт сам из профиля — клиент его не передаёт.
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("pair_id")
      .eq("telegram_id", validation.telegramId)
      .maybeSingle();

    if (profileError) {
      console.error("POLL SUBMIT profile lookup error:", profileError);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    const pairId = profile?.pair_id ?? null;

    if (!pairId) {
      return NextResponse.json({ ok: false, reason: "no-pair" });
    }

    const { error: upsertError } = await supabaseAdmin
      .from("poll_submissions")
      .upsert(
        {
          pair_id: pairId,
          telegram_id: validation.telegramId,
          poll_id: pollId,
          answers,
        },
        { onConflict: "telegram_id,poll_id" }
      );

    if (upsertError) {
      console.error("POLL SUBMIT upsert error:", upsertError);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    const pairPollAnswers = await loadPairPollAnswersForPair(pairId);

    return NextResponse.json({ ok: true, pairPollAnswers });
  } catch (error) {
    console.error("POLL SUBMIT ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
