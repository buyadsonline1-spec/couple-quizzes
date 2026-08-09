import crypto from "crypto";

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
    };
  } catch {
    return { valid: false };
  }
}
