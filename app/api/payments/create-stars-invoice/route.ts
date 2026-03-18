import { NextRequest, NextResponse } from "next/server";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const telegramId = body?.telegramId;
    const plan = body?.plan;

    if (!telegramId) {
      return NextResponse.json(
        { error: "telegramId is required" },
        { status: 400 }
      );
    }

    if (plan !== "premium_month") {
      return NextResponse.json(
        { error: "Unknown plan" },
        { status: 400 }
      );
    }

    if (!BOT_TOKEN) {
      return NextResponse.json(
        { error: "TELEGRAM_BOT_TOKEN is missing" },
        { status: 500 }
      );
    }

    const payload = JSON.stringify({
      telegramId,
      plan,
    });

    const tgRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Couple Quizzes Premium",
          description:
            "Полный доступ ко всем тестам, опросам и функциям Couple Quizzes",
          payload,
          currency: "XTR",
          prices: [
            {
              label: "Premium на 30 дней",
              amount: 299,
            },
          ],
        }),
      }
    );

    const tgData = await tgRes.json();

    if (!tgData.ok) {
      return NextResponse.json(
        { error: tgData.description || "Failed to create invoice link" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      invoiceLink: tgData.result,
    });
  } catch (error) {
    console.error("CREATE STARS INVOICE ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}