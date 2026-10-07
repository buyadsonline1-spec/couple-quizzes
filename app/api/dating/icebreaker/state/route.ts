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
    if (typeof gameId !== "string" || !gameId) {
      return NextResponse.json({ ok: false, reason: "invalid-game" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("get_dating_icebreaker_state", {
      p_telegram_id: validation.telegramId,
      p_game_id: gameId,
    });

    if (error) {
      console.error("GET_DATING_ICEBREAKER_STATE RPC ERROR:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("DATING ICEBREAKER STATE ERROR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
