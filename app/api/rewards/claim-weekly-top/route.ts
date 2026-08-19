import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

// Раньше здесь была собственная копия validateTelegramInitData —
// из-за этого endpoint не понимал Supabase-сессию standalone
// iOS-клиента (Phase 1 плана про App Store), только Telegram
// initData. Переведено на общий validateRequestAuth (см.
// app/api/bootstrap/route.ts) — понимает оба источника, для
// Telegram-пути поведение не меняется.

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

    // pairId сервер достаёт сам — клиент его не присылает. Сама RPC ещё
    // раз проверяет, что telegramId реально состоит в этой паре.
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("pair_id")
      .eq("telegram_id", validation.telegramId)
      .maybeSingle();

    if (profileError) {
      console.error("CLAIM WEEKLY TOP profile lookup error:", profileError);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    if (!profile?.pair_id) {
      return NextResponse.json({ awarded: false, reason: "no-pair" });
    }

    const { data, error } = await supabaseAdmin.rpc(
      "claim_weekly_pair_top_reward",
      {
        p_pair_id: profile.pair_id,
        p_telegram_id: validation.telegramId,
      }
    );

    if (error) {
      console.error("CLAIM_WEEKLY_PAIR_TOP_REWARD RPC ERROR:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("CLAIM WEEKLY TOP ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
