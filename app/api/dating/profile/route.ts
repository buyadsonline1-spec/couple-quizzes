import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";
import { loadTestSubmissionsForTelegramId } from "@/lib/server/reads";
import { buildPersonalitySummary } from "@/lib/server/test-results";

// Создание/обновление анкеты Знакомств. Раздел открыт всем — Premium
// требуется только для общения после мэтча и для свайпов сверх
// дневного бесплатного лимита (5/день), не для самой анкеты/входа.
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

    const displayName =
      typeof body.displayName === "string" ? body.displayName.trim() : "";
    const age = Number(body.age);
    const bio = typeof body.bio === "string" ? body.bio.slice(0, 1000) : null;
    const photoUrl =
      typeof body.photoUrl === "string" ? body.photoUrl : null;
    const gender = body.gender;
    const seekingGender = body.seekingGender;

    if (!displayName || displayName.length > 60) {
      return NextResponse.json(
        { ok: false, reason: "invalid-name" },
        { status: 400 }
      );
    }

    if (!Number.isInteger(age) || age < 18 || age > 120) {
      return NextResponse.json(
        { ok: false, reason: "underage" },
        { status: 400 }
      );
    }

    if (gender !== "boy" && gender !== "girl") {
      return NextResponse.json(
        { ok: false, reason: "invalid-gender" },
        { status: 400 }
      );
    }

    if (!["boy", "girl", "any"].includes(seekingGender)) {
      return NextResponse.json(
        { ok: false, reason: "invalid-seeking-gender" },
        { status: 400 }
      );
    }

    // personalitySummary больше не берём из тела запроса — раньше
    // клиент всегда слал сюда пустой объект (никакого кода, который бы
    // реально его считал, не было), и анкета навсегда оставалась без
    // тегов результатов тестов, хотя описание экрана обещало "собран
    // автоматически". Считаем на сервере из test_submissions — тот же
    // источник, что и подсказки для начала переписки (get_dating_matches).
    const testSubmissions = await loadTestSubmissionsForTelegramId(
      validation.telegramId
    );
    const personalitySummary = buildPersonalitySummary(testSubmissions);

    const { data, error } = await supabaseAdmin.rpc("upsert_dating_profile", {
      p_telegram_id: validation.telegramId,
      p_display_name: displayName,
      p_age: age,
      p_bio: bio,
      p_photo_url: photoUrl,
      p_gender: gender,
      p_seeking_gender: seekingGender,
      p_personality_summary: personalitySummary,
    });

    if (error || !data?.ok) {
      console.error("upsert_dating_profile error:", error || data);
      return NextResponse.json(
        { ok: false, reason: data?.reason || "internal-error" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, personalitySummary });
  } catch (error) {
    console.error("DATING PROFILE ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
