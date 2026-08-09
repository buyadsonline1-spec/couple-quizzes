import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateTelegramInitData } from "@/lib/server/telegram-auth";
import { loadPairPollAnswersForPair } from "@/lib/server/reads";

// Точечный рефреш pairPollAnswers (используется в refreshPairData —
// общем хелпере, дёргаемом после разных мутаций пары). Полный старт
// приложения получает то же самое одним ответом из /api/bootstrap;
// отправка ответа опроса — через /api/poll/submit (сразу возвращает
// свежий pairPollAnswers, этот эндпоинт для отправки не нужен).

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

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("pair_id")
      .eq("telegram_id", validation.telegramId)
      .maybeSingle();

    if (profileError) {
      console.error("PAIR POLL ANSWERS profile lookup error:", profileError);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    const pairId = profile?.pair_id ?? null;

    if (!pairId) {
      return NextResponse.json({ ok: true, pairPollAnswers: {} });
    }

    const pairPollAnswers = await loadPairPollAnswersForPair(pairId);

    return NextResponse.json({ ok: true, pairPollAnswers });
  } catch (error) {
    console.error("PAIR POLL ANSWERS ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
