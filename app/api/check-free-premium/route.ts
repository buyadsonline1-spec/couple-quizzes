import { NextResponse } from "next/server";
import TelegramBot from "node-telegram-bot-api";
import { supabaseAdmin } from "@/bot/supabase-admin";

const bot = new TelegramBot(
  process.env.TELEGRAM_BOT_TOKEN!,
  { polling: false }
);

const RELATIONS_CHANNEL = -1003903610001;
const CQ_CHANNEL = -1003660140515;

export async function POST(req: Request) {
  try {
    const { telegramId } = await req.json();

    if (!telegramId) {
      return NextResponse.json(
        { success: false, error: "No telegramId" },
        { status: 400 }
      );
    }

    const relationMember = await bot.getChatMember(
      RELATIONS_CHANNEL,
      telegramId
    );

    const cqMember = await bot.getChatMember(
      CQ_CHANNEL,
      telegramId
    );

    const allowedStatuses = [
      "member",
      "administrator",
      "creator",
    ];

    const subscribed =
      allowedStatuses.includes(relationMember.status) &&
      allowedStatuses.includes(cqMember.status);

    if (!subscribed) {
      return NextResponse.json({
        success: false,
        subscribed: false,
      });
    }

    const { error: subscriptionError } = await supabaseAdmin
  .from("subscriptions")
  .upsert(
    {
      telegram_id: Number(telegramId),
      plan: "free_premium",
      status: "active",
      expires_at: null,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "telegram_id",
    }
  );

if (subscriptionError) {
  console.error(
    "FREE PREMIUM UPSERT ERROR:",
    subscriptionError
  );

  return NextResponse.json(
    {
      success: false,
      error: "Failed to activate Premium",
    },
    {
      status: 500,
    }
  );
}

    return NextResponse.json({
      success: true,
      subscribed: true,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
      },
      {
        status: 500,
      }
    );
  }
}