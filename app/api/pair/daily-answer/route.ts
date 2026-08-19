import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

// Раньше здесь была собственная копия validateTelegramInitData —
// из-за этого endpoint не понимал Supabase-сессию standalone
// iOS-клиента (Phase 1 плана про App Store), только Telegram
// initData. Переведено на общий validateRequestAuth (см.
// app/api/bootstrap/route.ts) — понимает оба источника, для
// Telegram-пути поведение не меняется.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const answerIndex = Number(body.answerIndex);

    const validation = await validateRequestAuth(body);

    if (!validation.valid || !validation.telegramId) {
      return NextResponse.json(
        { error: "Invalid Telegram data" },
        { status: 401 }
      );
    }

    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) {
      return NextResponse.json(
        { ok: false, reason: "invalid-answer" },
        { status: 400 }
      );
    }

    // Дата, вопрос дня, серия, совпадение и вся начисляемая сумма
    // определяются целиком внутри RPC — клиент передаёт только свой
    // выбор ответа.
    const { data, error } = await supabaseAdmin.rpc(
      "submit_daily_pair_answer",
      {
        p_telegram_id: validation.telegramId,
        p_answer_index: answerIndex,
      }
    );

    if (error) {
      console.error("SUBMIT_DAILY_PAIR_ANSWER RPC ERROR:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("DAILY PAIR ANSWER ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
