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
    if (typeof duelId !== "string" || !duelId) {
      return NextResponse.json({ ok: false, reason: "invalid-duel" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("get_pair_quiz_duel_state", {
      p_telegram_id: validation.telegramId,
      p_duel_id: duelId,
    });

    if (error) {
      console.error("GET_PAIR_QUIZ_DUEL_STATE RPC ERROR:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("SYNC QUIZ STATE ERROR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
