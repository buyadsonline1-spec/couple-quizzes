import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateTelegramInitData } from "@/lib/server/telegram-auth";
import { loadPairStateForTelegramId } from "@/lib/server/pair-state";
import {
  loadDailyPairAnswersForDateServer,
  loadDailyPairHistoryForPair,
  loadPairPollAnswersForPair,
} from "@/lib/server/reads";

function todayInHelsinki(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Helsinki",
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const initData = typeof body.initData === "string" ? body.initData : "";
    const inviteCode =
      typeof body.inviteCode === "string" ? body.inviteCode.trim() : "";

    const validation = validateTelegramInitData(initData);

    if (!validation.valid || !validation.telegramId) {
      return NextResponse.json(
        { error: "Invalid Telegram data" },
        { status: 401 }
      );
    }

    if (!inviteCode) {
      return NextResponse.json(
        { ok: false, reason: "invalid-code" },
        { status: 400 }
      );
    }

    // telegramId только из initData; сама проверка "код существует /
    // пара ещё не полная / не self-join" — целиком внутри RPC.
    const { data, error } = await supabaseAdmin.rpc("join_pair", {
      p_telegram_id: validation.telegramId,
      p_invite_code: inviteCode,
    });

    if (error) {
      console.error("JOIN_PAIR RPC ERROR:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    // already-in-pair не ошибка (например, повторный заход по
    // инвайт-ссылке) — тоже отдаём текущий pair state.
    if (!data?.ok && data?.reason !== "already-in-pair") {
      return NextResponse.json(data);
    }

    const pair = await loadPairStateForTelegramId(validation.telegramId);

    // Заодно отдаём pairPollAnswers/dailyPair новой пары одним ответом —
    // нужно на случай, если join происходит прямо во время bootstrap
    // (переход по инвайт-ссылке), чтобы не делать ещё один round-trip.
    let pairPollAnswers: Record<string, number[]> = {};
    let dailyPairToday: Awaited<
      ReturnType<typeof loadDailyPairAnswersForDateServer>
    > = [];
    let dailyPairHistory: Awaited<
      ReturnType<typeof loadDailyPairHistoryForPair>
    > = [];

    if (pair.pairId) {
      const today = todayInHelsinki();

      [pairPollAnswers, dailyPairToday, dailyPairHistory] = await Promise.all([
        loadPairPollAnswersForPair(pair.pairId),
        loadDailyPairAnswersForDateServer(pair.pairId, today),
        loadDailyPairHistoryForPair(pair.pairId),
      ]);
    }

    return NextResponse.json({
      ...data,
      pair,
      pairPollAnswers,
      dailyPair: { today: dailyPairToday, history: dailyPairHistory },
    });
  } catch (error) {
    console.error("PAIR JOIN ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
