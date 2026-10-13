import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";
import { sendTelegramMessage, getAppLink } from "@/lib/server/telegram-notify";

// "Кто кого знает лучше?" — заводит (или продолжает незавершённый)
// дуэль на 6 вопросов для пары. Текст вопросов на клиенте
// (SYNC_QUIZ_QUESTIONS), сервер сам выбирает 6 случайных индексов —
// poolSize клиент присылает как SYNC_QUIZ_QUESTIONS.length.
//
// Раньше партнёр вообще никак не узнавал о новой дуэли, пока его не
// позвали вручную кнопкой "Напомнить партнёру" (см. /invite) — а она
// появляется только после того, как первый игрок УЖЕ ответил на свой
// первый вопрос. Теперь шлём авто-пуш партнёру сразу при создании
// НОВОЙ дуэли (isNew:true из start_pair_quiz_duel, см.
// supabase/pair_quiz_duel.sql) — но не при каждом открытии экрана
// (useEffect на монтировании всегда дёргает start, и продолжение уже
// существующей дуэли не должно спамить партнёра повторно).
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

    const poolSize = Number(body.poolSize);
    if (!Number.isFinite(poolSize) || poolSize < 6) {
      return NextResponse.json({ ok: false, reason: "invalid-pool-size" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("start_pair_quiz_duel", {
      p_telegram_id: validation.telegramId,
      p_pool_size: poolSize,
    });

    if (error) {
      console.error("START_PAIR_QUIZ_DUEL RPC ERROR:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    if (data?.ok && data?.isNew) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("pair_id")
        .eq("telegram_id", validation.telegramId)
        .maybeSingle();

      if (profile?.pair_id) {
        const { data: pair } = await supabaseAdmin
          .from("pairs")
          .select("partner_1_telegram_id, partner_2_telegram_id")
          .eq("id", profile.pair_id)
          .maybeSingle();

        const partner1 = Number(pair?.partner_1_telegram_id);
        const partner2 = Number(pair?.partner_2_telegram_id);
        const partnerTelegramId = partner1 === validation.telegramId ? partner2 : partner1;

        if (Number.isFinite(partnerTelegramId)) {
          // Не ждём доставку — если Telegram API зависнет/упадёт, это
          // не должно задерживать или ломать сам старт дуэли для
          // вызывающего.
          sendTelegramMessage(
            partnerTelegramId,
            "🎮 Партнёр начал новую игру «Кто кого знает лучше?» — загляните в раздел «Игры» и ответьте на свои 6 вопросов!",
            { buttonText: "Открыть приложение", buttonUrl: getAppLink() }
          ).catch((err) => console.error("sync-quiz auto-notify error:", err));
        }
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("SYNC QUIZ START ERROR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
