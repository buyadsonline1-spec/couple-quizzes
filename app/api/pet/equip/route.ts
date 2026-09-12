import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

const VALID_SLOTS = new Set(["hat", "accessory", "room"]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const slot = typeof body.slot === "string" ? body.slot : "";
    // null явно допустим (снять текущую вещь) — отличаем "не прислали"
    // от "прислали null" через hasOwnProperty.
    const itemId =
      Object.prototype.hasOwnProperty.call(body, "itemId") && body.itemId !== undefined
        ? body.itemId
        : null;

    const validation = await validateRequestAuth(body);

    if (!validation.valid || !validation.telegramId) {
      return NextResponse.json(
        { error: "Invalid Telegram data" },
        { status: 401 }
      );
    }

    if (!VALID_SLOTS.has(slot)) {
      return NextResponse.json({ ok: false, reason: "invalid-slot" }, { status: 400 });
    }

    if (itemId !== null && typeof itemId !== "string") {
      return NextResponse.json({ ok: false, reason: "invalid-item" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("equip_pair_pet_item", {
      p_telegram_id: validation.telegramId,
      p_slot: slot,
      p_item_id: itemId,
    });

    if (error) {
      console.error("EQUIP_PAIR_PET_ITEM RPC ERROR:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("PET EQUIP ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
