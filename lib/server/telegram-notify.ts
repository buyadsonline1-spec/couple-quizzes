// Отправка сообщений в Telegram напрямую через Bot API (fetch), без
// отдельного polling-процесса bot.ts — тот же приём, что уже
// используется в app/api/payments/create-stars-invoice (createInvoiceLink).
// Нужен для уведомлений, которые должны прийти пользователю, даже
// когда он не находится в приложении прямо сейчас (например, мэтч в
// Знакомствах, пока человек офлайн).

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME?.trim().replace(/^@/, "") || "couple_quizzes_bot";

export async function sendTelegramMessage(
  telegramId: number,
  text: string,
  options?: { buttonText?: string; buttonUrl?: string }
): Promise<void> {
  // Синтетические отрицательные id (standalone iOS/Supabase-Auth
  // аккаунты) не соответствуют реальному Telegram-чату — им отправлять
  // нечего и некуда.
  if (!Number.isFinite(telegramId) || telegramId <= 0) return;

  if (!BOT_TOKEN) {
    console.error("sendTelegramMessage: TELEGRAM_BOT_TOKEN is not set");
    return;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramId,
        text,
        disable_web_page_preview: true,
        reply_markup:
          options?.buttonText && options?.buttonUrl
            ? { inline_keyboard: [[{ text: options.buttonText, url: options.buttonUrl }]] }
            : undefined,
      }),
    });

    if (!response.ok) {
      // Не бросаем (см. комментарий ниже про некритичность), но без
      // этого лога типичные причины несостоявшейся доставки (юзер
      // заблокировал бота, chat not found) были бы не видны вообще —
      // fetch сам по себе не бросает на 4xx/5xx.
      console.error(
        `sendTelegramMessage: Telegram API responded ${response.status} for ${telegramId}:`,
        await response.text()
      );
    }
  } catch (error) {
    // Уведомление — не критичная часть флоу (сам мэтч уже сохранён в
    // БД к этому моменту), поэтому только логируем, не бросаем ошибку
    // дальше и не роняем сам API route.
    console.error(`sendTelegramMessage error for ${telegramId}:`, error);
  }
}

export function getDatingAppLink(): string {
  return `https://t.me/${BOT_USERNAME}?startapp=dating`;
}
