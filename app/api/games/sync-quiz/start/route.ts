import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

// "Кто кого знает лучше?" — заводит (или продолжает незавершённый)
// дуэль на 6 вопросов для пары. Текст вопросов на клиенте
// (SYNC_QUIZ_QUESTIONS), сервер сам выбирает 6 случайных индексов —
// poolSize клиент присылает как SYNC_QUIZ_QUESTIONS.length.
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

    const poolSize = Number(body.poolSize);
    if (!Number.isFinite(poolSize) || poolSize < 6) {
      return NextResponse.json({ ok: false, reason: "invalid-pool-size" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("start_pair_quiz_duel", {
      p_telegram_id: validation.telegramId,
      p_pool_size: poolSize,
    });

    if (error) {
      console.error("START_PAIR_QUIZ_DUEL RPC ERROR:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("SYNC QUIZ START ERROR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
