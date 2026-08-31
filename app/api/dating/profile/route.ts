import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";
import { checkIsPremium } from "@/lib/server/pair-state";

// Создание/обновление анкеты Знакомств. Требует Premium — бизнес-
// правило проверяется здесь, а не в SQL (upsert_dating_profile сам по
// себе premium ничего не знает), чтобы не размазывать это условие
// между TS и SQL.
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

    const isPremium = await checkIsPremium(validation.telegramId);

    if (!isPremium) {
      return NextResponse.json(
        { ok: false, reason: "premium-required" },
        { status: 403 }
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
    const personalitySummary =
      body.personalitySummary && typeof body.personalitySummary === "object"
        ? body.personalitySummary
        : {};

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

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DATING PROFILE ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
