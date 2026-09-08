import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";
import { sendTelegramMessage, getDatingAppLink } from "@/lib/server/telegram-notify";

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
    const accept = Boolean(body.accept);

    if (typeof matchId !== "string" || !matchId) {
      return NextResponse.json(
        { ok: false, reason: "invalid-match" },
        { status: 400 }
      );
    }

    const { data: proposalRow } = await supabaseAdmin
      .from("dating_pair_proposals")
      .select("from_telegram_id")
      .eq("match_id", matchId)
      .maybeSingle();

    const { data, error } = await supabaseAdmin.rpc(
      "respond_dating_pair_proposal",
      {
        p_match_id: matchId,
        p_telegram_id: validation.telegramId,
        p_accept: accept,
      }
    );

    if (error || !data?.ok) {
      return NextResponse.json(
        { ok: false, reason: data?.reason || "internal-error" },
        { status: 400 }
      );
    }

    if (data.accepted && proposalRow?.from_telegram_id) {
      const { data: toProfile } = await supabaseAdmin
        .from("dating_profiles")
        .select("display_name")
        .eq("telegram_id", validation.telegramId)
        .maybeSingle();

      await sendTelegramMessage(
        Number(proposalRow.from_telegram_id),
        `🎉 ${toProfile?.display_name || "Ваш мэтч"} принял(а) предложение создать пару! Пара уже создана — заходите в приложение.`,
        { buttonText: "Открыть приложение", buttonUrl: getDatingAppLink() }
      );
    }

    return NextResponse.json({ ok: true, accepted: Boolean(data.accepted), pairId: data.pairId ?? null });
  } catch (error) {
    console.error("DATING PAIR PROPOSAL RESPOND ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
