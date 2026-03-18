import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const TRIBUTE_API_KEY = process.env.TRIBUTE_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TRIBUTE_API_KEY) {
  throw new Error("TRIBUTE_API_KEY is not set");
}

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is not set");
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
}

const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

type TributeWebhook = {
  name: string;
  created_at?: string;
  sent_at?: string;
  payload?: {
    telegram_user_id?: number;
    telegram_username?: string;
    expires_at?: string;
    subscription_id?: number;
    subscription_name?: string;
    period?: string;
    type?: string;
    trb_user_id?: string;
    cancel_reason?: string;
  };
};

function verifyTributeSignature(rawBody: string, signature: string) {
  const expected = crypto
    .createHmac("sha256", TRIBUTE_API_KEY as string)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(signature, "utf8")
    );
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("trbt-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing trbt-signature" },
        { status: 401 }
      );
    }

    if (!verifyTributeSignature(rawBody, signature)) {
      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 401 }
      );
    }

    const body = JSON.parse(rawBody) as TributeWebhook;

    const eventName = body.name;
    const telegramId = Number(body.payload?.telegram_user_id);
    const expiresAt = body.payload?.expires_at;

    if (!eventName || !telegramId) {
      return NextResponse.json(
        { error: "Invalid webhook payload" },
        { status: 400 }
      );
    }

    if (eventName === "new_subscription" || eventName === "renewed_subscription") {
      if (!expiresAt) {
        return NextResponse.json(
          { error: "Missing expires_at for subscription event" },
          { status: 400 }
        );
      }

      const { error } = await supabaseAdmin
        .from("subscriptions")
        .upsert(
          {
            telegram_id: telegramId,
            plan: "premium_month",
            status: "active",
            provider: "tribute",
            expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "telegram_id" }
        );

      if (error) {
        console.error("TRIBUTE UPSERT ERROR:", error);
        return NextResponse.json(
          { error: "Failed to save subscription" },
          { status: 500 }
        );
      }
    }

    if (eventName === "cancelled_subscription") {
      const { error } = await supabaseAdmin
        .from("subscriptions")
        .upsert(
          {
            telegram_id: telegramId,
            plan: "premium_month",
            status: "cancelled",
            provider: "tribute",
            expires_at: expiresAt || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "telegram_id" }
        );

      if (error) {
        console.error("TRIBUTE CANCEL ERROR:", error);
        return NextResponse.json(
          { error: "Failed to cancel subscription" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("TRIBUTE WEBHOOK ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}