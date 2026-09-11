import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

const VALID_SPECIES = new Set(["dog", "cat", "rabbit", "cow", "hippo", "owl"]);
const VALID_GENDERS = new Set(["boy", "girl"]);

// Заводит питомца пары — один раз, навсегда (см. supabase/pair_pets.sql:
// create_pair_pet сама отклоняет повторную попытку через
// reason: "already-exists"). Валидация species/gender здесь дублирует
// CHECK-констрейнты в БД (defense in depth) — так клиент получает
// понятный reason ещё до похода в RPC.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const species = typeof body.species === "string" ? body.species : "";
    const gender = typeof body.gender === "string" ? body.gender : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";

    const validation = await validateRequestAuth(body);

    if (!validation.valid || !validation.telegramId) {
      return NextResponse.json(
        { error: "Invalid Telegram data" },
        { status: 401 }
      );
    }

    if (!VALID_SPECIES.has(species)) {
      return NextResponse.json({ ok: false, reason: "invalid-species" }, { status: 400 });
    }

    if (!VALID_GENDERS.has(gender)) {
      return NextResponse.json({ ok: false, reason: "invalid-gender" }, { status: 400 });
    }

    if (!name || name.length > 20) {
      return NextResponse.json({ ok: false, reason: "invalid-name" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("create_pair_pet", {
      p_telegram_id: validation.telegramId,
      p_species: species,
      p_gender: gender,
      p_name: name,
    });

    if (error) {
      console.error("CREATE_PAIR_PET RPC ERROR:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("PET CREATE ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
