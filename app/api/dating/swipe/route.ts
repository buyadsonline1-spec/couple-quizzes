import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";
import { checkIsPremium } from "@/lib/server/pair-state";

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

    if (!isPremium) {
      return NextResponse.json(
        { ok: false, reason: "premium-required" },
        { status: 403 }
      );
    }

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
    });

    if (error || !data?.ok) {
      console.error("record_dating_swipe error:", error || data);
      return NextResponse.json(
        { ok: false, reason: data?.reason || "internal-error" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      matched: Boolean(data.matched),
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
