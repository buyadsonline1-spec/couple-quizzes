import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

// "Это или то" — айсбрейкер-игра прямо в чате Знакомств (см.
// supabase/dating_icebreaker_game.sql). Текст вопросов на клиенте
// (DATING_ICEBREAKER_QUESTIONS), poolSize = её длина.
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

    const matchId = body.matchId;
    const poolSize = Number(body.poolSize);

    if (typeof matchId !== "string" || !matchId) {
      return NextResponse.json({ ok: false, reason: "invalid-match" }, { status: 400 });
    }
    if (!Number.isFinite(poolSize) || poolSize < 6) {
      return NextResponse.json({ ok: false, reason: "invalid-pool-size" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("start_dating_icebreaker", {
      p_telegram_id: validation.telegramId,
      p_match_id: matchId,
      p_pool_size: poolSize,
    });

    if (error) {
      console.error("START_DATING_ICEBREAKER RPC ERROR:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("DATING ICEBREAKER START ERROR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
