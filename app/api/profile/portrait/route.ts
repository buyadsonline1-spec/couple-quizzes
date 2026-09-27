import { NextRequest, NextResponse } from "next/server";
import { validateRequestAuth } from "@/lib/server/telegram-auth";
import { loadTestSubmissionsForTelegramId } from "@/lib/server/reads";
import { buildPersonalitySummary, type Market } from "@/lib/server/test-results";

// Психологический портрет в профиле — те же test_submissions и та же
// buildPersonalitySummary(), что уже реально используются для тегов
// анкеты Знакомств (см. app/api/test/submit, dating_profiles.
// personality_summary) и для скоринга совместимости
// (lib/server/dating-compatibility.ts) — не новая механика, просто
// первый раз показываем игроку то же самое, что уже считается о нём
// на сервере. Работает независимо от того, есть ли у человека анкета
// Знакомств (test_submissions пишутся при любом прохождении теста,
// personality_summary в dating_profiles — только если анкета уже
// существует), поэтому считаем заново по сырым ответам, а не читаем
// dating_profiles.
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

    const market: Market =
      body.market === "ru" || body.market === "en" || body.market === "fi"
        ? body.market
        : "en";

    const submissions = await loadTestSubmissionsForTelegramId(
      validation.telegramId
    );
    const summary = buildPersonalitySummary(submissions, market);

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error("PROFILE PORTRAIT ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
