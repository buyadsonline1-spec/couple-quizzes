import { NextRequest, NextResponse } from "next/server";
import { validateTelegramInitData } from "@/lib/server/telegram-auth";
import { loadPairStateForTelegramId } from "@/lib/server/pair-state";

// Лёгкий рефреш состояния пары (без профиля/premium/истории вопроса
// дня) — используется там, где раньше был точечный клиентский
// loadPairStateForUser() после начисления очков и т.п. Полный старт
// приложения идёт через /api/bootstrap.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const initData = typeof body.initData === "string" ? body.initData : "";

    const validation = validateTelegramInitData(initData);

    if (!validation.valid || !validation.telegramId) {
      return NextResponse.json(
        { error: "Invalid Telegram data" },
        { status: 401 }
      );
    }

    const pair = await loadPairStateForTelegramId(validation.telegramId);

    return NextResponse.json({ ok: true, pair });
  } catch (error) {
    console.error("PAIR STATE ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
