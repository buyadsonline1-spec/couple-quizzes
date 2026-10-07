import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

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

    const duelId = body.duelId;
    const questionPosition = Number(body.questionPosition);
    const answerIndex = Number(body.answerIndex);

    if (typeof duelId !== "string" || !duelId) {
      return NextResponse.json({ ok: false, reason: "invalid-duel" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("submit_pair_quiz_duel_answer", {
      p_telegram_id: validation.telegramId,
      p_duel_id: duelId,
      p_question_position: questionPosition,
      p_answer_index: answerIndex,
    });

    if (error) {
      console.error("SUBMIT_PAIR_QUIZ_DUEL_ANSWER RPC ERROR:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("SYNC QUIZ ANSWER ERROR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
