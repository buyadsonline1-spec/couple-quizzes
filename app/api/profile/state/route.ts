import { NextRequest, NextResponse } from "next/server";
import { validateTelegramInitData } from "@/lib/server/telegram-auth";
import { loadSoloProfileForTelegramId } from "@/lib/server/reads";
import { checkIsPremium } from "@/lib/server/pair-state";

// Лёгкий рефреш SOLO-очков (используется в refreshTopLeaderboard) —
// раньше был прямой supabase.from("profiles").select(...) анонимным
// ключом. Полный старт приложения идёт через /api/bootstrap.

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

    const [profile, isPremium] = await Promise.all([
      loadSoloProfileForTelegramId(validation.telegramId),
      checkIsPremium(validation.telegramId),
    ]);

    return NextResponse.json({ ok: true, profile, isPremium });
  } catch (error) {
    console.error("PROFILE STATE ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
