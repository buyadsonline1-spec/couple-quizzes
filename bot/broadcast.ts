// Рассылка сообщения всем реальным Telegram-пользователям бота.
//
// Источник списка получателей — public.profiles.telegram_id (кроме
// синтетических отрицательных id standalone iOS-аккаунтов, см.
// lib/server/telegram-auth.ts): это все, кто хотя бы раз открывал
// Mini App и прошёл bootstrap_profile. Telegram Bot API не даёт
// способа получить список пользователей бота напрямую — можно писать
// только тем, чей telegram_id мы уже где-то сохранили сами.
//
// Запуск (всегда сначала --dry-run, чтобы увидеть кому реально уйдёт):
//   npx tsx bot/broadcast.ts --message-file ./broadcast.txt --dry-run
//   npx tsx bot/broadcast.ts --message-file ./broadcast.txt
//
// Опционально:
//   --parse-mode HTML                 форматирование текста (HTML/Markdown/MarkdownV2)
//   --button-text "Открыть приложение" --button-url "https://t.me/BOT_USERNAME/app"
//   --limit 100                       ограничить рассылку первыми N получателями (тест на своих)
//   --rate 20                         сообщений в секунду (по умолчанию 20, Telegram лимит ~30/с)

import dotenv from "dotenv";
import fs from "fs";
import TelegramBot from "node-telegram-bot-api";
import { supabaseAdmin } from "./supabase-admin";

dotenv.config({ path: ".env.local" });

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

// polling: false — этот скрипт только отправляет, не слушает апдейты.
// Он не должен запускаться одновременно с bot.ts на одном токене ради
// приёма сообщений, но для sendMessage конфликта нет — это разные вещи.
const bot = new TelegramBot(token, { polling: false });

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };
  return {
    messageFile: get("--message-file"),
    dryRun: args.includes("--dry-run"),
    parseMode: get("--parse-mode") as TelegramBot.ParseMode | undefined,
    buttonText: get("--button-text"),
    buttonUrl: get("--button-url"),
    limit: get("--limit") ? Number(get("--limit")) : undefined,
    ratePerSecond: get("--rate") ? Number(get("--rate")) : 20,
  };
}

async function loadRecipients(limit?: number): Promise<number[]> {
  // .gt(0) — только реальные Telegram id; синтетические (standalone
  // iOS) отрицательные и у них всё равно нет Telegram-чата для отправки.
  let query = supabaseAdmin
    .from("profiles")
    .select("telegram_id")
    .gt("telegram_id", 0)
    .order("telegram_id", { ascending: true });

  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => row.telegram_id as number);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const opts = parseArgs();

  if (!opts.messageFile) {
    console.error(
      "Использование: npx tsx bot/broadcast.ts --message-file ./broadcast.txt [--dry-run] [--parse-mode HTML] [--button-text \"...\"] [--button-url \"...\"] [--limit N] [--rate 20]"
    );
    process.exit(1);
  }

  const text = fs.readFileSync(opts.messageFile, "utf8").trim();
  if (!text) {
    console.error("Файл сообщения пуст.");
    process.exit(1);
  }

  const recipients = await loadRecipients(opts.limit);
  console.log(`Получателей: ${recipients.length}`);
  console.log("--- Текст сообщения ---");
  console.log(text);
  console.log("-----------------------");

  if (opts.dryRun) {
    console.log(
      `[DRY RUN] Ничего не отправлено. Убери --dry-run, чтобы отправить реально ${recipients.length} пользователям.`
    );
    return;
  }

  const replyMarkup: TelegramBot.SendMessageOptions["reply_markup"] =
    opts.buttonText && opts.buttonUrl
      ? { inline_keyboard: [[{ text: opts.buttonText, url: opts.buttonUrl }]] }
      : undefined;

  const delayMs = Math.ceil(1000 / Math.max(1, opts.ratePerSecond));

  let sent = 0;
  let blocked = 0;
  let failed = 0;
  const failedIds: number[] = [];

  for (const telegramId of recipients) {
    try {
      await bot.sendMessage(telegramId, text, {
        parse_mode: opts.parseMode,
        reply_markup: replyMarkup,
        disable_web_page_preview: true,
      });
      sent++;
    } catch (error: any) {
      // 403 — пользователь заблокировал бота или удалил аккаунт,
      // это ожидаемо на любой большой рассылке, не ошибка скрипта.
      const code = error?.response?.body?.error_code;

      if (code === 403) {
        blocked++;
      } else if (code === 429) {
        // Telegram сам просит подождать retry_after секунд.
        const retryAfter = error?.response?.body?.parameters?.retry_after ?? 5;
        console.warn(`Rate limited, жду ${retryAfter}с...`);
        await sleep(retryAfter * 1000);
        // Повторная попытка этому же получателю.
        try {
          await bot.sendMessage(telegramId, text, {
            parse_mode: opts.parseMode,
            reply_markup: replyMarkup,
            disable_web_page_preview: true,
          });
          sent++;
        } catch {
          failed++;
          failedIds.push(telegramId);
        }
      } else {
        failed++;
        failedIds.push(telegramId);
        console.error(`Ошибка для ${telegramId}:`, error?.message || error);
      }
    }

    if ((sent + blocked + failed) % 50 === 0) {
      console.log(`Прогресс: ${sent + blocked + failed}/${recipients.length}`);
    }

    await sleep(delayMs);
  }

  console.log("\n=== Готово ===");
  console.log(`Успешно отправлено: ${sent}`);
  console.log(`Заблокировали бота: ${blocked}`);
  console.log(`Другие ошибки: ${failed}`);
  if (failedIds.length > 0) {
    console.log("ID с ошибками:", failedIds.join(", "));
  }
}

main().catch((error) => {
  console.error("BROADCAST FAILED:", error);
  process.exit(1);
});
