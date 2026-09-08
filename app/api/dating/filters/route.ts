import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

// Диапазон возраста показа кандидатов. Пол (seekingGender) меняется
// через редактирование анкеты (upsert_dating_profile) — тут только то,
// что не задаётся при создании анкеты.
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

    const minAge = Number(body.minAge);
    const maxAge = Number(body.maxAge);

    if (!Number.isInteger(minAge) || !Number.isInteger(maxAge)) {
      return NextResponse.json(
        { ok: false, reason: "invalid-range" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc("set_dating_filters", {
      p_telegram_id: validation.telegramId,
      p_min_age: minAge,
      p_max_age: maxAge,
    });

    if (error || !data?.ok) {
      return NextResponse.json(
        { ok: false, reason: data?.reason || "internal-error" },
        { status: data?.reason === "no-profile" ? 400 : 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DATING FILTERS ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
