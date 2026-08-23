import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

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

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("TEST SUBMIT ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
