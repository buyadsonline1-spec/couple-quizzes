import { NextResponse } from "next/server";
import TelegramBot from "node-telegram-bot-api";
import { supabaseAdmin } from "@/bot/supabase-admin";

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, {
  polling: false,
});

const RELATIONS_CHANNEL = -1003903610001;
const CQ_CHANNEL = -1003660140515;

const allowedStatuses = [
  "member",
  "administrator",
  "creator",
];

export async function POST(req: Request) {
  try {
    const { telegramId } = await req.json();

    if (!telegramId) {
      return NextResponse.json(
        {
          success: false,
          error: "No telegramId",
        },
        {
          status: 400,
        }
      );
    }

    console.log("Checking Premium for:", telegramId);

    const relationMember = await bot.getChatMember(
      RELATIONS_CHANNEL,
      telegramId
    );

    const cqMember = await bot.getChatMember(
      CQ_CHANNEL,
      telegramId
    );

    console.log("Relation channel:", relationMember.status);
    console.log("CQ channel:", cqMember.status);

    const subscribed =
      allowedStatuses.includes(relationMember.status) &&
      allowedStatuses.includes(cqMember.status);

    if (!subscribed) {
      return NextResponse.json({
        success: false,
        subscribed: false,
        relationStatus: relationMember.status,
        cqStatus: cqMember.status,
      });
    }

    const { error } = await supabaseAdmin
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

    if (error) {
      console.error("SUPABASE ERROR:", error);

      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        {
          status: 500,
        }
      );
    }

    console.log("Premium activated:", telegramId);

    return NextResponse.json({
      success: true,
      subscribed: true,
    });
  } catch (error) {
    console.error("FREE PREMIUM ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
      }
    );
  }
}