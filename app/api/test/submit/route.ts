import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";
import { loadTestSubmissionsForTelegramId } from "@/lib/server/reads";
import { buildPersonalitySummary, type Market } from "@/lib/server/test-results";

// Test IDs live inline in app/page.tsx (const TESTS), not in a shared
// config file like polls' POLL_IDS — so this intentionally doesn't
// whitelist against a fixed list, just validates shape. That's an
// acceptable tradeoff here: points are awarded through the separate,
// already-whitelisted /api/activity/award, so a bogus test_id here
// can't be used to farm rewards — worst case is a junk row that never
// gets read by anything.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const testId = typeof body.testId === "string" ? body.testId.trim() : "";
    const answers = Array.isArray(body.answers) ? body.answers : null;

    const validation = await validateRequestAuth(body);

    if (!validation.valid || !validation.telegramId) {
      return NextResponse.json(
        { error: "Invalid Telegram data" },
        { status: 401 }
      );
    }

    if (!testId || testId.length > 100) {
      return NextResponse.json(
        { ok: false, reason: "invalid-test" },
        { status: 400 }
      );
    }

    if (
      !answers ||
      answers.length === 0 ||
      answers.length > 50 ||
      !answers.every(
        (value: unknown) =>
          typeof value === "number" &&
          Number.isInteger(value) &&
          value >= 0 &&
          value <= 10
      )
    ) {
      return NextResponse.json(
        { ok: false, reason: "invalid-answers" },
        { status: 400 }
      );
    }

    const { error: upsertError } = await supabaseAdmin
      .from("test_submissions")
      .upsert(
        {
          telegram_id: validation.telegramId,
          test_id: testId,
          answers,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "telegram_id,test_id" }
      );

    if (upsertError) {
      console.error("TEST SUBMIT upsert error:", upsertError);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    // Психологический профиль анкеты Знакомств раньше считался только
    // один раз, при сохранении/редактировании самой анкеты — если
    // человек проходил тест ПОСЛЕ того, как анкета уже была создана,
    // теги так и оставались устаревшими (обычно пустыми) навсегда,
    // пока он не зайдёт пересохранить анкету вручную. Пересчитываем и
    // перезаписываем сразу здесь, если анкета уже существует — тогда
    // и сам владелец, и кандидаты в чужой ленте видят актуальные теги
    // сразу после прохождения любого теста.
    const { data: existingDatingProfile } = await supabaseAdmin
      .from("dating_profiles")
      .select("telegram_id")
      .eq("telegram_id", validation.telegramId)
      .maybeSingle();

    if (existingDatingProfile) {
      const market: Market =
        body.market === "ru" || body.market === "en" || body.market === "fi"
          ? body.market
          : "en";

      const allSubmissions = await loadTestSubmissionsForTelegramId(
        validation.telegramId
      );
      const personalitySummary = buildPersonalitySummary(
        allSubmissions,
        market
      );

      const { error: personalityUpdateError } = await supabaseAdmin
        .from("dating_profiles")
        .update({ personality_summary: personalitySummary, updated_at: new Date().toISOString() })
        .eq("telegram_id", validation.telegramId);

      if (personalityUpdateError) {
        // Не критично — сама попытка теста уже сохранена выше, тег в
        // анкете просто обновится в следующий раз (например, при
        // следующем тесте или пересохранении анкеты).
        console.error(
          "TEST SUBMIT personality_summary refresh error:",
          personalityUpdateError
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("TEST SUBMIT ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
