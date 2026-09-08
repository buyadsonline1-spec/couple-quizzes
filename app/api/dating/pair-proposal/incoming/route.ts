import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

// Входящие предложения "создать пару" — для экрана "Пара" (показывается,
// только пока у пользователя ещё нет своей пары).
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

    const { data, error } = await supabaseAdmin.rpc(
      "get_incoming_dating_pair_proposals",
      { p_telegram_id: validation.telegramId }
    );

    if (error || !data?.ok) {
      return NextResponse.json(
        { ok: false, reason: "internal-error" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, proposals: data.proposals ?? [] });
  } catch (error) {
    console.error("DATING PAIR PROPOSAL INCOMING ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
