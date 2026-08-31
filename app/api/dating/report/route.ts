import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";

// Жалоба автоматически блокирует репортнутого (см.
// report_dating_user в supabase/dating.sql) — Apple Guideline 1.2.
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

    const reportedTelegramId = Number(body.reportedTelegramId);
    const reason =
      typeof body.reason === "string" ? body.reason.slice(0, 500) : null;

    if (!Number.isFinite(reportedTelegramId)) {
      return NextResponse.json(
        { ok: false, reason: "invalid-target" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc("report_dating_user", {
      p_reporter_telegram_id: validation.telegramId,
      p_reported_telegram_id: reportedTelegramId,
      p_reason: reason,
    });

    if (error || !data?.ok) {
      console.error("report_dating_user error:", error || data);
      return NextResponse.json(
        { ok: false, reason: data?.reason || "internal-error" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DATING REPORT ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
