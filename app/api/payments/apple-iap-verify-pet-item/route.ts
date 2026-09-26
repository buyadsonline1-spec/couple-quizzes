import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateRequestAuth } from "@/lib/server/telegram-auth";
import { verifyAppleSignedTransaction } from "@/lib/server/apple-iap";
import { PET_ITEM_STARS } from "@/lib/server/pet-items";

// Apple-эквивалент app/api/payments/create-stars-invoice (plan
// "pet_item") + bot.ts handlePetItemPayment — те же вещи для питомца,
// но оплаченные через StoreKit 2 вместо Telegram Stars. Один товар в
// App Store Connect (см. APPLE_PET_ITEM_PRODUCT_ID в
// lib/applePurchase.ts) на все вещи разом — какую именно вещь выдать,
// решает itemId, который присылает клиент, ПРОВЕРЕННЫЙ по общему
// списку PET_ITEM_STARS (тому же, что и у Telegram-пути), а не
// произвольная строка.
//
// В отличие от Premium (app/api/payments/apple-iap-verify), это
// одноразовое потребляемое действие — apple_iap_pet_item_transactions
// (supabase/apple_iap_pet_item_ledger.sql) не даёt использовать один и
// тот же signedTransaction дважды с разными itemId, чтобы получить
// все вещи за одну покупку.

const BUNDLE_ID = "com.couplequizzes.app";
const PET_ITEM_PRODUCT_ID = "com.couplequizzes.app.pet_item";

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
    const itemId = typeof body.itemId === "string" ? body.itemId : "";

    if (!signedTransaction || !itemId) {
      return NextResponse.json(
        { error: "signedTransaction and itemId are required" },
        { status: 400 }
      );
    }

    if (!PET_ITEM_STARS[itemId]) {
      console.error("APPLE IAP PET ITEM unknown itemId:", itemId);
      return NextResponse.json({ error: "Unknown item" }, { status: 400 });
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
        "APPLE IAP PET ITEM bundleId mismatch:",
        payload.bundleId,
        "expected",
        BUNDLE_ID
      );
      return NextResponse.json({ error: "Bundle ID mismatch" }, { status: 400 });
    }

    if (payload.productId !== PET_ITEM_PRODUCT_ID) {
      console.error("APPLE IAP PET ITEM unknown productId:", payload.productId);
      return NextResponse.json({ error: "Unknown product" }, { status: 400 });
    }

    if (payload.revocationDate) {
      return NextResponse.json({ error: "Transaction was refunded" }, { status: 400 });
    }

    // Первая вставка с этим transaction_id — единственная, что пройдёт
    // (primary key). Если уже был использован, повторная выдача
    // отклоняется здесь, до вызова grant_pair_pet_item.
    const { error: ledgerError } = await supabaseAdmin
      .from("apple_iap_pet_item_transactions")
      .insert({
        transaction_id: payload.transactionId,
        telegram_id: validation.telegramId,
        item_id: itemId,
      });

    if (ledgerError) {
      if (ledgerError.code === "23505") {
        return NextResponse.json(
          { error: "Transaction already used" },
          { status: 409 }
        );
      }
      console.error("APPLE IAP PET ITEM ledger insert error:", ledgerError);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc("grant_pair_pet_item", {
      p_telegram_id: validation.telegramId,
      p_item_id: itemId,
    });

    if (error || !data?.ok) {
      console.error("APPLE IAP PET ITEM grant error:", error || data);
      return NextResponse.json(
        { error: "Failed to grant item" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, itemId });
  } catch (error) {
    console.error("APPLE IAP PET ITEM VERIFY ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
