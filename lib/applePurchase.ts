import { registerPlugin } from "@capacitor/core";

// Мост к ios/App/App/ApplePurchasePlugin.swift — локальному
// (не npm) Capacitor-плагину этого проекта, зарегистрированному
// вручную в AppBridgeViewController.capacitorDidLoad(). jsName в
// плагине — "ApplePurchase", он и есть имя для registerPlugin.
export interface ApplePurchaseResult {
  jwsRepresentation: string;
  transactionId: string;
}

export interface ApplePurchasePlugin {
  purchase(options: { productId: string }): Promise<ApplePurchaseResult>;
  // Guideline 3.1.1 — сихронизирует локальный StoreKit-стейт с Apple
  // (AppStore.sync()) и возвращает уже существующую активную покупку
  // productId, если она есть; отклоняет с "NO_PURCHASES_TO_RESTORE",
  // если восстанавливать нечего.
  restore(options: { productId: string }): Promise<ApplePurchaseResult>;
}

export const ApplePurchase = registerPlugin<ApplePurchasePlugin>(
  "ApplePurchase"
);

// Единственный продукт Premium сейчас — должен совпадать с ключом в
// PRODUCT_ID_TO_PLAN (app/api/payments/apple-iap-verify/route.ts) и с
// тем, что будет создано в App Store Connect.
export const APPLE_PREMIUM_MONTH_PRODUCT_ID =
  "com.couplequizzes.app.premium_month";
