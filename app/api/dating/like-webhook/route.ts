import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { sendTelegramMessage, getDatingLikesAppLink } from "@/lib/server/telegram-notify";

// Вызывается только из Postgres-триггера (dating_swipes AFTER INSERT,
// см. supabase/dating_like_webhook.sql) через net.http_post — не
// публичный клиентский эндпоинт, поэтому секрет вместо
// validateRequestAuth (тут нет пользовательского initData, звонит
// сама база).
//
// Раньше уведомление о Знакомствах уходило только при взаимном лайке
// (мэтч, см. /api/dating/swipe). Про сам факт "тебя лайкнули" до
// мэтча человек узнавал только случайно зайдя в "Лайки мне" — теперь
// шлём пуш сразу.
const WEBHOOK_SECRET = process.env.INTERNAL_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get("x-webhook-secret");
    if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const fromTelegramId = Number(body.fromTelegramId);
    const toTelegramId = Number(body.toTelegramId);
    const isSuperlike = Boolean(body.isSuperlike);

    if (!Number.isFinite(fromTelegramId) || !Number.isFinite(toTelegramId)) {
      return NextResponse.json({ ok: false, reason: "invalid-ids" }, { status: 400 });
    }

    // Если это сразу мэтч (второй встречный лайк) — /api/dating/swipe
    // уже отправил обоим "Взаимный лайк!", отдельное "тебя лайкнули"
    // тут было бы дублем. user_low/high — тот же порядок, что и в
    // dating_matches (см. supabase/dating.sql).
    const userLow = Math.min(fromTelegramId, toTelegramId);
    const userHigh = Math.max(fromTelegramId, toTelegramId);

    const { data: existingMatch } = await supabaseAdmin
      .from("dating_matches")
      .select("id")
      .eq("user_low_telegram_id", userLow)
      .eq("user_high_telegram_id", userHigh)
      .maybeSingle();

    if (existingMatch) {
      return NextResponse.json({ ok: true, skipped: "already-matched" });
    }

    const text = isSuperlike
      ? "⭐ Тебя суперлайкнули в Знакомствах! Загляни в «Лайки мне» — вдруг это взаимно."
      : "💘 Тебя лайкнули в Знакомствах! Загляни в «Лайки мне» — вдруг это взаимно.";

    await sendTelegramMessage(toTelegramId, text, {
      buttonText: "Открыть Лайки мне",
      buttonUrl: getDatingLikesAppLink(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DATING LIKE WEBHOOK ERROR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
