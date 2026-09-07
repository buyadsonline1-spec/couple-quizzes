import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";
import { checkIsPremium } from "@/lib/server/pair-state";
import { sendTelegramMessage, getDatingAppLink } from "@/lib/server/telegram-notify";

// Раздел открыт всем — Premium снимает только дневной лимит (5 свайпов
// в день для остальных, см. record_dating_swipe) и требуется отдельно
// для переписки (см. messages/send).
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

    const isPremium = await checkIsPremium(validation.telegramId);

    const toTelegramId = Number(body.toTelegramId);
    const action = body.action;

    if (!Number.isFinite(toTelegramId)) {
      return NextResponse.json(
        { ok: false, reason: "invalid-target" },
        { status: 400 }
      );
    }

    if (action !== "like" && action !== "pass") {
      return NextResponse.json(
        { ok: false, reason: "invalid-action" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc("record_dating_swipe", {
      p_from_telegram_id: validation.telegramId,
      p_to_telegram_id: toTelegramId,
      p_action: action,
      p_is_premium: isPremium,
    });

    if (error || !data?.ok) {
      if (data?.reason !== "daily-limit-reached") {
        console.error("record_dating_swipe error:", error || data);
      }
      return NextResponse.json(
        { ok: false, reason: data?.reason || "internal-error" },
        { status: data?.reason === "daily-limit-reached" ? 403 : 500 }
      );
    }

    const matched = Boolean(data.matched);

    if (matched) {
      // Пользователь, который только что свайпнул, видит алерт о
      // мэтче прямо в приложении (клиент), а вот вторая сторона могла
      // лайкнуть намного раньше и сейчас вообще не в приложении — без
      // этого уведомления она узнала бы о мэтче только случайно
      // зайдя в раздел заново. Шлём обоим — недорого, и не зависит от
      // того, кто сейчас реально онлайн.
      const { data: profiles } = await supabaseAdmin
        .from("dating_profiles")
        .select("telegram_id, display_name")
        .in("telegram_id", [validation.telegramId, toTelegramId]);

      const nameByTelegramId = new Map(
        (profiles ?? []).map((p) => [p.telegram_id as number, p.display_name as string])
      );

      const appLink = getDatingAppLink();
      const fromName = nameByTelegramId.get(validation.telegramId) ?? "";
      const toName = nameByTelegramId.get(toTelegramId) ?? "";

      await Promise.all([
        sendTelegramMessage(
          toTelegramId,
          `💘 Взаимный лайк с ${fromName || "новым человеком"}! Загляни в Знакомства — можно начать переписку.`,
          { buttonText: "Открыть Знакомства", buttonUrl: appLink }
        ),
        sendTelegramMessage(
          validation.telegramId,
          `💘 Взаимный лайк с ${toName || "новым человеком"}! Загляни в Знакомства — можно начать переписку.`,
          { buttonText: "Открыть Знакомства", buttonUrl: appLink }
        ),
      ]);
    }

    return NextResponse.json({
      ok: true,
      matched,
      matchId: data.matchId ?? null,
    });
  } catch (error) {
    console.error("DATING SWIPE ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
