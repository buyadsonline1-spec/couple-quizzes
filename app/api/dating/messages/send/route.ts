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

    const matchId = typeof body.matchId === "string" ? body.matchId : "";
    const text = typeof body.text === "string" ? body.text : "";

    if (!matchId) {
      return NextResponse.json(
        { ok: false, reason: "invalid-match" },
        { status: 400 }
      );
    }

    if (!text.trim() || text.length > 2000) {
      return NextResponse.json(
        { ok: false, reason: "invalid-message" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc("send_dating_message", {
      p_match_id: matchId,
      p_sender_telegram_id: validation.telegramId,
      p_text: text,
    });

    if (error || !data?.ok) {
      console.error("send_dating_message error:", error || data);
      return NextResponse.json(
        { ok: false, reason: data?.reason || "internal-error" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DATING SEND MESSAGE ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
