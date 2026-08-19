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

    // bootstrap_profile отклоняет telegramId <= 0 — у Supabase-аккаунтов
    // (Phase 1) он синтетический отрицательный, и профиль для них уже
    // создан внутри validateRequestAuth (bootstrap_profile_from_auth).
    // Повторно звать bootstrap_profile для них нельзя (тот же паттерн,
    // что в app/api/bootstrap/route.ts) — отдаём успех без вызова RPC.
    if (validation.authMethod === "supabase") {
      return NextResponse.json({ ok: true, telegramId: validation.telegramId });
    }

    // Все display-поля берутся ИЗ подписанного initData, а не из тела
    // запроса — клиент не может подсунуть чужое имя/фото под своим ID,
    // и уж тем более не может через этот эндпоинт тронуть pair_id/
    // solo_points/premium и т.д. (RPC их вообще не принимает).
    const { data, error } = await supabaseAdmin.rpc("bootstrap_profile", {
      p_telegram_id: validation.telegramId,
      p_first_name: validation.firstName,
      p_last_name: validation.lastName,
      p_username: validation.username,
      p_photo_url: validation.photoUrl,
    });

    if (error) {
      console.error("BOOTSTRAP_PROFILE RPC ERROR:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("PROFILE BOOTSTRAP ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
