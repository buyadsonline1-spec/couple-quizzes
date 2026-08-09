import OpenAI from "openai";

// Ленивая инициализация (не на верхнем уровне модуля) — если
// OPENAI_API_KEY ещё не задан в окружении, роуты должны вернуть
// понятную 500-ошибку вместо падения при сборке/старте всего Next.js
// приложения (в отличие от TELEGRAM_BOT_TOKEN/SUPABASE_* — те всегда
// заданы, а этот ключ можно добавить позже).

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  if (!client) {
    client = new OpenAI({ apiKey });
  }

  return client;
}

export const AI_PSYCHOLOGIST_MODEL =
  process.env.OPENAI_PSYCHOLOGIST_MODEL || "gpt-5-mini";
