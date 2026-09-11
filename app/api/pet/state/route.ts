import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

// Питомец пары — уровень/опыт считает сама RPC (get_pair_pet_state,
// см. supabase/pair_pets.sql) из суммы delta в activity_point_claims,
// поэтому здесь только проверка авторизации и проброс ответа.
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

    const { data, error } = await supabaseAdmin.rpc("get_pair_pet_state", {
      p_telegram_id: validation.telegramId,
    });

    if (error) {
      console.error("GET_PAIR_PET_STATE RPC ERROR:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("PET STATE ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
