import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateTelegramInitData } from "@/lib/server/telegram-auth";
import { loadPairStateForTelegramId } from "@/lib/server/pair-state";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const initData = typeof body.initData === "string" ? body.initData : "";

    const validation = validateTelegramInitData(initData);

    if (!validation.valid || !validation.telegramId) {
      return NextResponse.json(
        { error: "Invalid Telegram data" },
        { status: 401 }
      );
    }

    // invite_code генерируется на сервере внутри RPC — клиент не
    // передаёт ничего, кроме initData. partner_1_telegram_id = telegramId
    // из initData, не из тела запроса.
    const { data, error } = await supabaseAdmin.rpc("create_pair", {
      p_telegram_id: validation.telegramId,
    });

    if (error) {
      console.error("CREATE_PAIR RPC ERROR:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    if (!data?.ok) {
      return NextResponse.json(data);
    }

    // Сразу отдаём свежий PairState вместо того, чтобы заставлять
    // клиента делать отдельный round-trip за ним после мутации.
    const pair = await loadPairStateForTelegramId(validation.telegramId);

    return NextResponse.json({ ...data, pair });
  } catch (error) {
    console.error("PAIR CREATE ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
