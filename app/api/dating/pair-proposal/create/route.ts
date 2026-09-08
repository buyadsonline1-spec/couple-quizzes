import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";
import { sendTelegramMessage, getDatingAppLink } from "@/lib/server/telegram-notify";

// "Предложить пару" из чата мэтча. Уведомляем получателя сразу — он
// может сейчас не быть в приложении, а предложение живёт в разделе
// "Пара" молча, пока туда кто-то не зайдёт.
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

    const matchId = body.matchId;

    if (typeof matchId !== "string" || !matchId) {
      return NextResponse.json(
        { ok: false, reason: "invalid-match" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc("propose_dating_pair", {
      p_match_id: matchId,
      p_from_telegram_id: validation.telegramId,
    });

    if (error || !data?.ok) {
      return NextResponse.json(
        { ok: false, reason: data?.reason || "internal-error" },
        { status: 400 }
      );
    }

    const { data: fromProfile } = await supabaseAdmin
      .from("dating_profiles")
      .select("display_name")
      .eq("telegram_id", validation.telegramId)
      .maybeSingle();

    await sendTelegramMessage(
      Number(data.toTelegramId),
      `💍 ${fromProfile?.display_name || "Ваш мэтч"} предлагает создать пару в приложении! Загляните в раздел «Пара», чтобы принять или отклонить.`,
      // Прямого deep-link на конкретно раздел "Пара" пока нет (только
      // startapp=dating) — открываем просто приложение, дальше человек
      // сам доходит до "Пара" за пару тапов.
      { buttonText: "Открыть приложение", buttonUrl: getDatingAppLink() }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DATING PAIR PROPOSAL CREATE ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
