import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";
import { sendTelegramMessage, getAppLink } from "@/lib/server/telegram-notify";

// Кнопка "Позвать партнёра" в SyncQuizGameScreen — игра не уведомляет
// сама по себе, когда кто-то начинает дуэль (второй участник не узнает
// об этом, пока сам не откроет "Игры"), поэтому даём явный пуш через
// Telegram-бота. partner_1_telegram_id/partner_2_telegram_id в pairs —
// text, а не bigint, поэтому сравнение делаем в JS через Number(), а
// не в SQL (см. тот же тип-баг, который чинили в pair_quiz_duel.sql).
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

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("pair_id")
      .eq("telegram_id", validation.telegramId)
      .maybeSingle();

    if (profileError) {
      console.error("SYNC QUIZ INVITE profile lookup error:", profileError);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    if (!profile?.pair_id) {
      return NextResponse.json({ ok: false, reason: "no-pair" });
    }

    const { data: pair, error: pairError } = await supabaseAdmin
      .from("pairs")
      .select("partner_1_telegram_id, partner_2_telegram_id")
      .eq("id", profile.pair_id)
      .maybeSingle();

    if (pairError) {
      console.error("SYNC QUIZ INVITE pair lookup error:", pairError);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    const partner1 = Number(pair?.partner_1_telegram_id);
    const partner2 = Number(pair?.partner_2_telegram_id);
    const partnerTelegramId = partner1 === validation.telegramId ? partner2 : partner1;

    if (!Number.isFinite(partnerTelegramId)) {
      return NextResponse.json({ ok: false, reason: "no-partner" });
    }

    await sendTelegramMessage(
      partnerTelegramId,
      "🎮 Партнёр начал игру «Кто кого знает лучше?» — загляните в раздел «Игры» и ответьте на свои 6 вопросов, чтобы увидеть, сколько совпало!",
      { buttonText: "Открыть приложение", buttonUrl: getAppLink() }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("SYNC QUIZ INVITE ERROR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
