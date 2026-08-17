"use client";

import { supabase } from "./supabase";

// Phase 2 of the App Store plan: rather than touching every one of the
// ~25 places in app/page.tsx that read window.Telegram?.WebApp?.
// initData / .initDataUnsafe.user directly (high risk of breaking the
// live Telegram Mini App for a purely mechanical change), the
// Capacitor build installs a SHIM for window.Telegram.WebApp instead.
// Every existing call site keeps working completely untouched — it's
// still reading window.Telegram?.WebApp?.initData, it just gets a
// different kind of value back when running inside the iOS wrapper.
//
// The shimmed initData is not a real Telegram signature — it's the
// string "supabase-token:<jwt>", carrying the current Supabase Auth
// session's access token. The server (validateRequestAuth in
// lib/server/telegram-auth.ts) recognizes this prefix and validates it
// as a Supabase session instead of a Telegram HMAC signature. A real
// Telegram initData string can never start with this prefix (it's a
// urlencoded query string starting with "user=..."), so the dispatch
// is unambiguous.

const SUPABASE_TOKEN_PREFIX = "supabase-token:";

export function isCapacitorApp(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (
    window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
  ).Capacitor;
  if (capacitor?.isNativePlatform?.()) return true;

  // Тестовый флаг — до появления реальной iOS-сборки (ждём, пока
  // Артём поставит Xcode) это единственный способ прогнать экран
  // входа/шим живьём в обычном браузере. ?forceCapacitor=1 в URL —
  // намеренно ручной, ничего не включает сам по себе, никак не
  // затрагивает реальных Telegram-пользователей.
  if (typeof window.location !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.get("forceCapacitor") === "1") return true;
  }

  return false;
}

let cachedAccessToken: string | undefined;
let cachedDisplayName: string | undefined;
let cachedSyntheticTelegramId: number | undefined;
let shimInstalled = false;

// Called once bootstrap succeeds (the same way every existing flow
// learns the real telegramId from the server's response) — makes
// window.Telegram.WebApp.initDataUnsafe.user.id correct for the rest
// of the session, for the few display-only spots that read it
// (referral link generation, name fallbacks — never anything
// security-sensitive, the server never trusts this field for auth).
export function setSyntheticTelegramId(id: number) {
  cachedSyntheticTelegramId = id;
}

export function installCapacitorTelegramShim() {
  if (typeof window === "undefined" || !isCapacitorApp() || shimInstalled) {
    return;
  }
  shimInstalled = true;

  supabase.auth.onAuthStateChange((_event, session) => {
    cachedAccessToken = session?.access_token;
    cachedDisplayName =
      (session?.user.user_metadata?.full_name as string | undefined) ||
      (session?.user.user_metadata?.name as string | undefined) ||
      session?.user.email?.split("@")[0];
  });

  (window as unknown as { Telegram: Window["Telegram"] }).Telegram = {
    WebApp: {
      get initData() {
        return cachedAccessToken
          ? `${SUPABASE_TOKEN_PREFIX}${cachedAccessToken}`
          : undefined;
      },
      get initDataUnsafe() {
        // До первого успешного /api/bootstrap реальный синтетический
        // telegramId ещё не известен (сервер минтит его сам) — но
        // app/page.tsx на старте требует, чтобы user.id было truthy,
        // прежде чем вообще пытаться бутстрапиться (та же проверка,
        // что и для Telegram — там SDK иногда не готов сразу).
        // Отдаём временный отрицательный placeholder, пока не узнаем
        // настоящий id через setSyntheticTelegramId() — сам auth
        // никогда не зависит от этого поля, только initData (токен).
        return {
          user: {
            id: cachedSyntheticTelegramId ?? (cachedAccessToken ? -1 : undefined),
            first_name: cachedDisplayName ?? "Player",
          },
        };
      },
      // openTelegramLink/openInvoice остаются undefined — все места,
      // что их вызывают, уже проверяют `if (window.Telegram?.WebApp?.
      // openTelegramLink)` перед вызовом, так что в Capacitor-сборке
      // эти конкретные Telegram-специфичные кнопки просто аккуратно
      // no-op'ятся, ничего не падает.
    },
  };
}

export function hasSupabaseSession(): Promise<boolean> {
  return supabase.auth.getSession().then(({ data }) => Boolean(data.session));
}
