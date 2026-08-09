import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateTelegramInitData } from "@/lib/server/telegram-auth";
import {
  loadDailyPairAnswersForDateServer,
  loadDailyPairHistoryForPair,
} from "@/lib/server/reads";

// Обновление отображения "кто сегодня как ответил" + истории после
// сохранения ответа в DailyPairQuestionScreen — раньше это были два
// прямых supabase.from("daily_pair_answers").select(...) анонимным
// ключом. Само начисление уже полностью на сервере (submit_daily_pair_
// answer); это чисто чтение для UI.

function todayInHelsinki(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Helsinki",
  });
}

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
      console.error("PAIR DAILY STATE profile lookup error:", profileError);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    const pairId = profile?.pair_id ?? null;

    if (!pairId) {
      return NextResponse.json({ ok: true, today: [], history: [] });
    }

    const [today, history] = await Promise.all([
      loadDailyPairAnswersForDateServer(pairId, todayInHelsinki()),
      loadDailyPairHistoryForPair(pairId),
    ]);

    return NextResponse.json({ ok: true, today, history });
  } catch (error) {
    console.error("PAIR DAILY STATE ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
