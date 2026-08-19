import { NextRequest, NextResponse } from "next/server";
import { validateRequestAuth } from "@/lib/server/telegram-auth";
import { loadPairStateForTelegramId } from "@/lib/server/pair-state";

// Лёгкий рефреш состояния пары (без профиля/premium/истории вопроса
// дня) — используется там, где раньше был точечный клиентский
// loadPairStateForUser() после начисления очков и т.п. Полный старт
// приложения идёт через /api/bootstrap.
//
// validateTelegramInitData (Telegram-only) заменён на validateRequestAuth
// — этот роут дёргается постоянно после почти любого действия, без него
// standalone iOS-клиент (Phase 1 плана про App Store) не мог обновить
// состояние пары вообще ни разу после bootstrap.

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
