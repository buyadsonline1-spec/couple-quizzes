import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";
import { verifyAppleSignedTransaction } from "@/lib/server/apple-iap";

// Вызывается standalone iOS-клиентом (Capacitor) после успешной покупки
// через StoreKit 2 — тот же подход, что у Telegram Stars
// (createInvoiceLink + webhook) и Tribute (tribute-webhook), только
// источник события другой. Клиент присылает не сам факт оплаты, а
// подписанный Apple JWS (Transaction.jwsRepresentation) — сервер
// проверяет подпись сам (см. lib/server/apple-iap.ts), никогда не
// доверяя телу запроса напрямую.

const BUNDLE_ID = "com.couplequizzes.app";

// productId (App Store Connect) -> наш внутренний план в таблице
// subscriptions. Единственный план сейчас — обычный Premium на 30
// дней, тот же "premium_month", что уже пишут Stars и Tribute (их
// подписки взаимозаменяемы: checkIsPremium просто ищет активную
// строку по telegram_id, ей всё равно, какой provider её создал).
const PRODUCT_ID_TO_PLAN: Record<string, string> = {
  "com.couplequizzes.app.premium_month": "premium_month",
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

    const signedTransaction =
      typeof body.signedTransaction === "string" ? body.signedTransaction : "";

    if (!signedTransaction) {
      return NextResponse.json(
        { error: "signedTransaction is required" },
        { status: 400 }
      );
    }

    const payload = verifyAppleSignedTransaction(signedTransaction);

    if (!payload) {
      return NextResponse.json(
        { error: "Could not verify Apple transaction" },
        { status: 400 }
      );
    }

    if (payload.bundleId !== BUNDLE_ID) {
      console.error(
        "APPLE IAP bundleId mismatch:",
        payload.bundleId,
        "expected",
        BUNDLE_ID
      );
      return NextResponse.json({ error: "Bundle ID mismatch" }, { status: 400 });
    }

    const plan = PRODUCT_ID_TO_PLAN[payload.productId];

    if (!plan) {
      console.error("APPLE IAP unknown productId:", payload.productId);
      return NextResponse.json({ error: "Unknown product" }, { status: 400 });
    }

    // Возврат/чарджбэк — Apple ставит revocationDate. Не активируем,
    // сразу помечаем как отменённую (та же семантика, что
    // cancelled_subscription у Tribute).
    const isRevoked = Boolean(payload.revocationDate);

    const expiresAt = payload.expiresDate
      ? new Date(payload.expiresDate).toISOString()
      : new Date().toISOString();

    const { error } = await supabaseAdmin.from("subscriptions").upsert(
      {
        telegram_id: validation.telegramId,
        plan,
        status: isRevoked ? "cancelled" : "active",
        provider: "apple",
        provider_transaction_id: payload.originalTransactionId,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "telegram_id" }
    );

    if (error) {
      console.error("APPLE IAP UPSERT ERROR:", error);
      return NextResponse.json(
        { error: "Failed to save subscription" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      isPremium: !isRevoked,
      expiresAt,
    });
  } catch (error) {
    console.error("APPLE IAP VERIFY ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
