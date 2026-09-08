import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

// Статус предложения пары для конкретного мэтча — баннер в чате.
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

    const { data, error } = await supabaseAdmin.rpc("get_dating_pair_proposal", {
      p_match_id: matchId,
      p_telegram_id: validation.telegramId,
    });

    if (error || !data?.ok) {
      return NextResponse.json(
        { ok: false, reason: "internal-error" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, proposal: data.proposal });
  } catch (error) {
    console.error("DATING PAIR PROPOSAL STATUS ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
