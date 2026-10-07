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

    const gameId = body.gameId;
    const questionPosition = Number(body.questionPosition);
    const answerIndex = Number(body.answerIndex);

    if (typeof gameId !== "string" || !gameId) {
      return NextResponse.json({ ok: false, reason: "invalid-game" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("submit_dating_icebreaker_answer", {
      p_telegram_id: validation.telegramId,
      p_game_id: gameId,
      p_question_position: questionPosition,
      p_answer_index: answerIndex,
    });

    if (error) {
      console.error("SUBMIT_DATING_ICEBREAKER_ANSWER RPC ERROR:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("DATING ICEBREAKER ANSWER ERROR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
