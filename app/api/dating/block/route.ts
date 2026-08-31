import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

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

    const blockedTelegramId = Number(body.blockedTelegramId);

    if (!Number.isFinite(blockedTelegramId)) {
      return NextResponse.json(
        { ok: false, reason: "invalid-target" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc("block_dating_user", {
      p_blocker_telegram_id: validation.telegramId,
      p_blocked_telegram_id: blockedTelegramId,
    });

    if (error || !data?.ok) {
      console.error("block_dating_user error:", error || data);
      return NextResponse.json(
        { ok: false, reason: data?.reason || "internal-error" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DATING BLOCK ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
