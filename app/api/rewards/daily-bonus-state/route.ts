import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

// "Уже забрал сегодня бонус?" раньше решалось ИСКЛЮЧИТЕЛЬНО по
// localStorage (appState.dailyBonus.lastClaimDate /
// lastDailyBonusPopupDate) — сам claim_daily_bonus всегда был
// server-authoritative (см. supabase/daily_bonus_server_side.sql,
// идемпотентен по дате), но для РЕШЕНИЯ показывать ли попап клиент
// никогда не спрашивал сервер. На iOS (Capacitor, WKWebView на живой
// URL) это давало ровно баг "бонус выскакивает каждый раз": каждое
// удаление/переустановка тестового TestFlight-билда стирает
// localStorage, appState.dailyBonus.lastClaimDate становится пустым, и
// попап решает, что бонус ещё не забирали — хотя на сервере он уже
// отмечен как полученный сегодня. Сам claim при этом просто тихо
// проваливался (дата не совпадает), выглядело как "приз не даётся".
// Этот эндпоинт — только чтение, без побочных эффектов, чтобы
// AppShell мог поправить локальное состояние по факту сразу при
// открытии, не дожидаясь попытки claim'а.
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

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("daily_bonus_streak_day, daily_bonus_last_claim_date")
      .eq("telegram_id", validation.telegramId)
      .maybeSingle();

    if (error) {
      console.error("DAILY BONUS STATE error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      streakDay: profile?.daily_bonus_streak_day ?? 0,
      lastClaimDate: profile?.daily_bonus_last_claim_date ?? null,
    });
  } catch (error) {
    console.error("DAILY BONUS STATE ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
