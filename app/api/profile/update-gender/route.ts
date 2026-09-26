import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

// profile.gender раньше жил только в localStorage (см. комментарий в
// supabase/profile_gender_persist.sql) — этот эндпоинт впервые
// сохраняет его на сервере, чтобы он пережил переустановку/смену
// устройства так же, как остальной профиль.
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

    const gender = body.gender;

    if (gender !== "boy" && gender !== "girl") {
      return NextResponse.json({ error: "Invalid gender" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ gender })
      .eq("telegram_id", validation.telegramId);

    if (error) {
      console.error("UPDATE GENDER error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, gender });
  } catch (error) {
    console.error("UPDATE GENDER ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
