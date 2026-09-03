import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";
import {
  loadTestSubmissionsForTelegramId,
  loadTestSubmissionsForTelegramIds,
} from "@/lib/server/reads";
import { buildPersonalitySummary, buildDatingIcebreakers, type Market } from "@/lib/server/test-results";

type MatchRow = {
  matchId: string;
  matchedAt: string;
  partnerTelegramId: number;
  partnerDisplayName: string;
  partnerPhotoUrl: string | null;
  lastMessage: { text: string; createdAt: string; senderTelegramId: number } | null;
};

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

    const { data, error } = await supabaseAdmin.rpc("get_dating_matches", {
      p_telegram_id: validation.telegramId,
    });

    if (error || !data?.ok) {
      console.error("get_dating_matches error:", error || data);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    const matches: MatchRow[] = data.matches ?? [];

    // Локализуем под маркет ЗАПРАШИВАЮЩЕГО — это подсказка ему, каждый
    // видит icebreakers на своём языке независимо от языка партнёра.
    const market: Market =
      body.market === "ru" || body.market === "en" || body.market === "fi"
        ? body.market
        : "en";

    // Заготовленные фразы для начала переписки видны всем (даже без
    // Premium — отправку сообщения гейтит отдельно /api/dating/messages/
    // send), считаются по результатам тестов обеих сторон. Своих тестов
    // — одним запросом, партнёров — батчем, не по одному на мэтч.
    const selfSubmissions = await loadTestSubmissionsForTelegramId(
      validation.telegramId
    );
    const selfSummary = buildPersonalitySummary(selfSubmissions, market);

    const partnerIds = matches.map((m) => m.partnerTelegramId);
    const submissionsByPartner = await loadTestSubmissionsForTelegramIds(partnerIds);

    const matchesWithIcebreakers = matches.map((match) => {
      const partnerSummary = buildPersonalitySummary(
        submissionsByPartner.get(match.partnerTelegramId) ?? [],
        market
      );

      return {
        ...match,
        icebreakers: buildDatingIcebreakers(
          selfSummary,
          partnerSummary,
          match.partnerDisplayName,
          market
        ),
      };
    });

    return NextResponse.json({ ok: true, matches: matchesWithIcebreakers });
  } catch (error) {
    console.error("DATING MATCHES ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
