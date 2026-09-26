import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

// Только чтение — сколько раундов кликера уже сыграно сегодня, и
// сколько всего когда-либо (для бесплатного пробного раунда без
// Premium — см. app/api/games/heart-clicker/play). Раньше клиент
// узнавал об исчерпанном дневном лимите только ПОСЛЕ попытки сыграть
// раунд (ответ play с reason: daily-limit-reached) — то есть человек,
// открывший игру уже без раундов на сегодня, всё равно видел обычную
// кнопку "Начать" и узнавал о лимите только после честного раунда
// тапов. Этот эндпоинт вызывается при открытии экрана, чтобы сразу
// показать "раунды закончились"/"нужен Premium" вместо кнопки.
// Проверку прав на игру (Premium vs бесплатный пробный раунд) это
// чтение не выполняет — это чисто информация для UI, реальное решение
// всё равно принимает play на сервере.
function todayInHelsinki(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Helsinki",
  });
}

const DAILY_LIMIT = 3;

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

    const [todayResult, totalResult] = await Promise.all([
      supabaseAdmin
        .from("heart_clicker_rounds")
        .select("id", { count: "exact", head: true })
        .eq("telegram_id", validation.telegramId)
        .eq("round_date", todayInHelsinki()),
      supabaseAdmin
        .from("heart_clicker_rounds")
        .select("id", { count: "exact", head: true })
        .eq("telegram_id", validation.telegramId),
    ]);

    if (todayResult.error || totalResult.error) {
      console.error(
        "HEART CLICKER STATE error:",
        todayResult.error || totalResult.error
      );
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    const used = todayResult.count ?? 0;

    return NextResponse.json({
      ok: true,
      roundsUsedToday: used,
      roundsRemainingToday: Math.max(0, DAILY_LIMIT - used),
      totalRoundsPlayed: totalResult.count ?? 0,
    });
  } catch (error) {
    console.error("HEART CLICKER STATE ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
