import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

// Цену и допустимость item_id сервер определяет сам внутри
// buy_pair_pet_item (см. supabase/pair_pets_shop.sql) — клиент
// присылает только id вещи, никогда сумму.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const itemId = typeof body.itemId === "string" ? body.itemId : "";

    const validation = await validateRequestAuth(body);

    if (!validation.valid || !validation.telegramId) {
      return NextResponse.json(
        { error: "Invalid Telegram data" },
        { status: 401 }
      );
    }

    if (!itemId) {
      return NextResponse.json({ ok: false, reason: "invalid-item" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("buy_pair_pet_item", {
      p_telegram_id: validation.telegramId,
      p_item_id: itemId,
    });

    if (error) {
      console.error("BUY_PAIR_PET_ITEM RPC ERROR:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    // buy_pair_pet_item не возвращает ownedItems/level/xp — раньше
    // клиент после удачной покупки сразу шёл ВТОРЫМ запросом на
    // /api/pet/state за этими полями (см. app/page.tsx:
    // handleBuyPetItem), отчего "нажал купить" ощутимо подвисало на
    // двух round-trip'ах подряд, особенно при быстрой примерке
    // нескольких вещей. Дочитываем состояние прямо здесь.
    if (data?.ok) {
      const { data: stateData, error: stateError } = await supabaseAdmin.rpc(
        "get_pair_pet_state",
        { p_telegram_id: validation.telegramId }
      );
      if (!stateError && stateData?.ok) {
        return NextResponse.json({ ...data, pet: stateData.pet });
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("PET BUY ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
