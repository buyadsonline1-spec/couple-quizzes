import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

// Подгружает уже сохранённую анкету Знакомств (если есть) — без этого
// клиент не может отличить "анкеты ещё нет" от "анкета есть, но
// страница просто перезагрузилась" (см. fix_dating_profile_persistence.sql).
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

    const { data, error } = await supabaseAdmin.rpc("get_own_dating_profile", {
      p_telegram_id: validation.telegramId,
    });

    if (error || !data?.ok) {
      console.error("get_own_dating_profile error:", error || data);
      return NextResponse.json(
        { ok: false, reason: "internal-error" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, profile: data.profile });
  } catch (error) {
    console.error("DATING PROFILE STATE ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
