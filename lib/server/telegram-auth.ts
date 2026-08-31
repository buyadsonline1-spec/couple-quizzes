import crypto from "crypto";
import { supabaseAdmin } from "./supabase-admin";

// Общая валидация Telegram initData для app/api/*/route.ts. Раньше
// была продублирована почти дословно в каждом route.ts — вынесено
// сюда для новых эндпоинтов (bootstrap, pair/state, poll/submit).
// Существующие route.ts со своей копией не трогаем без нужды —
// поведение идентично.

const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set");
}

export type TelegramInitDataValidation = {
  valid: boolean;
  telegramId?: number;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  photoUrl?: string | null;
  // "telegram" (по умолчанию, обратная совместимость) — вызывающий код
  // должен ещё сам синхронизировать профиль через bootstrap_profile.
  // "supabase" — profiles-ряд уже создан/обновлён внутри
  // validateSupabaseAuthToken (bootstrap_profile_from_auth), повторно
  // звать bootstrap_profile для него нельзя (та функция отклоняет
  // telegramId <= 0, а тут синтетический отрицательный id).
  authMethod?: "telegram" | "supabase";
  // Только для authMethod "supabase" — bootstrap_profile_from_auth уже
  // сходил в profiles за актуальными данными, /api/bootstrap читает их
  // отсюда вместо повторного RPC-вызова (bootstrap_profile отклоняет
  // синтетический отрицательный telegramId).
  soloPoints?: number;
  soloWeeklyPoints?: number;
  soloWeeklyPointsWeek?: string | null;
  displayNameCustom?: boolean;
  // Реальное сохранённое в profiles имя — в отличие от firstName выше
  // (который для supabase-пути — это имя из Apple/Google, а не то,
  // что пользователь мог вручную поменять в настройках аккаунта).
  dbFirstName?: string | null;
  dbLastName?: string | null;
  // start_param идёт из ТОЙ ЖЕ подписанной initData, что и telegramId —
  // используется в app/api/referral/claim/route.ts как криптографически
  // надёжный источник referrerTelegramId (вида "ref_<id>"), клиент не
  // может подделать его отдельно от telegramId. Для authMethod:
  // "supabase" всегда undefined — start_param специфичен для Telegram
  // Mini App, у standalone iOS-клиента (Phase 1) его источника нет.
  startParam?: string;
};

export function validateTelegramInitData(
  initData: string
): TelegramInitDataValidation {
  try {
    const params = new URLSearchParams(initData);

    const receivedHash = params.get("hash");
    const authDateRaw = params.get("auth_date");
    const userRaw = params.get("user");

    if (!receivedHash || !authDateRaw || !userRaw) {
      return { valid: false };
    }

    params.delete("hash");

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken!)
      .digest();

    const calculatedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    const receivedBuffer = Buffer.from(receivedHash, "hex");
    const calculatedBuffer = Buffer.from(calculatedHash, "hex");

    if (
      receivedBuffer.length !== calculatedBuffer.length ||
      !crypto.timingSafeEqual(receivedBuffer, calculatedBuffer)
    ) {
      return { valid: false };
    }

    const authDate = Number(authDateRaw);
    const now = Math.floor(Date.now() / 1000);

    // Не принимаем initData старше 24 часов.
    if (!Number.isFinite(authDate) || now - authDate > 86400) {
      return { valid: false };
    }

    const user = JSON.parse(userRaw);
    const telegramId = Number(user.id);

    if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
      return { valid: false };
    }

    return {
      valid: true,
      telegramId,
      firstName: typeof user.first_name === "string" ? user.first_name : null,
      lastName: typeof user.last_name === "string" ? user.last_name : null,
      username: typeof user.username === "string" ? user.username : null,
      photoUrl: typeof user.photo_url === "string" ? user.photo_url : null,
      authMethod: "telegram",
      startParam: params.get("start_param") ?? undefined,
    };
  } catch {
    return { valid: false };
  }
}

// Phase 1 iOS-приложения (план: standalone iOS app for the Apple App
// Store). Вне Telegram подписанного initData не существует вообще —
// не Mini App, значит Telegram ничего не подписывает. Новые клиенты
// (email/Sign in with Apple/телефон через Supabase Auth) присылают
// supabaseAccessToken вместо initData.
//
// Возвращает РОВНО ТОТ ЖЕ шейп TelegramInitDataValidation, что и
// validateTelegramInitData — только telegramId тут синтетический
// отрицательный id (см. supabase/ios_auth_foundation.sql,
// bootstrap_profile_from_auth). Благодаря одинаковому шейпу все RPC
// ниже по каждому route.ts остаются нетронутыми — они как принимали
// telegramId, так и принимают, не зная и не заботясь о том, откуда
// он взялся.
// Капаситоровский клиент (Phase 2) не трогает ни один из ~25 мест,
// что читают window.Telegram?.WebApp?.initData — вместо этого
// lib/platform.ts подменяет сам window.Telegram.WebApp шимом, чей
// initData возвращает "supabase-token:<jwt>" вместо настоящей
// Telegram-подписи. Настоящий Telegram initData никогда не начинается
// с этого префикса (это urlencoded query-string вида "user=..."), так
// что распознавание по префиксу однозначно и безопасно.
const SUPABASE_TOKEN_PREFIX = "supabase-token:";

export async function validateRequestAuth(body: {
  initData?: unknown;
  supabaseAccessToken?: unknown;
}): Promise<TelegramInitDataValidation> {
  if (
    typeof body.supabaseAccessToken === "string" &&
    body.supabaseAccessToken
  ) {
    return validateSupabaseAuthToken(body.supabaseAccessToken);
  }

  if (typeof body.initData === "string" && body.initData) {
    if (body.initData.startsWith(SUPABASE_TOKEN_PREFIX)) {
      return validateSupabaseAuthToken(
        body.initData.slice(SUPABASE_TOKEN_PREFIX.length)
      );
    }

    return validateTelegramInitData(body.initData);
  }

  return { valid: false };
}

async function validateSupabaseAuthToken(
  accessToken: string
): Promise<TelegramInitDataValidation> {
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);

    if (error || !data?.user) {
      return { valid: false };
    }

    const authUser = data.user;

    const displayName =
      (typeof authUser.user_metadata?.full_name === "string"
        ? authUser.user_metadata.full_name
        : null) ||
      (typeof authUser.user_metadata?.name === "string"
        ? authUser.user_metadata.name
        : null);

    const { data: bootstrapData, error: bootstrapError } =
      await supabaseAdmin.rpc("bootstrap_profile_from_auth", {
        p_auth_user_id: authUser.id,
        p_display_name: displayName,
        p_email: authUser.email ?? null,
      });

    if (bootstrapError || !bootstrapData?.ok) {
      console.error(
        "validateSupabaseAuthToken bootstrap error:",
        bootstrapError || bootstrapData
      );
      return { valid: false };
    }

    return {
      valid: true,
      telegramId: Number(bootstrapData.telegramId),
      firstName: displayName,
      lastName: null,
      username: null,
      photoUrl:
        typeof authUser.user_metadata?.avatar_url === "string"
          ? authUser.user_metadata.avatar_url
          : null,
      authMethod: "supabase",
      soloPoints: Number(bootstrapData.soloPoints ?? 0),
      soloWeeklyPoints: Number(bootstrapData.soloWeeklyPoints ?? 0),
      soloWeeklyPointsWeek: bootstrapData.soloWeeklyPointsWeek ?? null,
      displayNameCustom: Boolean(bootstrapData.displayNameCustom),
      dbFirstName: bootstrapData.firstName ?? null,
      dbLastName: bootstrapData.lastName ?? null,
    };
  } catch (error) {
    console.error("validateSupabaseAuthToken error:", error);
    return { valid: false };
  }
}
