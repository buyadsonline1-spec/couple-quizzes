import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { supabaseAdmin } from "./supabase-admin";

dotenv.config({ path: ".env.local" });

const token = process.env.TELEGRAM_BOT_TOKEN;
const webAppUrl = process.env.WEB_APP_URL;

if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
if (!webAppUrl) throw new Error("WEB_APP_URL is not set");

const bot = new TelegramBot(token, { polling: true });

console.log("🤖 Bot started");

// =======================
// 🔘 КНОПКА В МЕНЮ TG
// =======================
async function setMenuButton() {
  try {
    await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        menu_button: {
          type: "web_app",
          text: "Открыть Couple Quizzes",
          web_app: {
            url: webAppUrl,
          },
        },
      }),
    });

    console.log("✅ Menu button set");
  } catch (e) {
    console.error("❌ setMenuButton error:", e);
  }
}

setMenuButton();

// =======================
// 🚀 /start
// =======================
bot.on("message", async (msg) => {
  try {
    console.log("📩 Message:", msg.text);

    if (!msg.text) return;

    if (msg.text === "/start" || msg.text.startsWith("/start ")) {
      await bot.sendMessage(
        msg.chat.id,
        `💖 Добро пожаловать в Couple Quizzes!

Здесь вы можете:
• проходить тесты и опросы для пары  
• проверять вашу совместимость  
• получать очки и награды  
• выигрывать реальные призы  

Нажми кнопку ниже, чтобы открыть приложение 👇`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "💖 Открыть Couple Quizzes",
                  web_app: {
                    url: webAppUrl,
                  },
                },
              ],
            ],
          },
        }
      );
    }
  } catch (error) {
    console.error("❌ START HANDLER ERROR:", error);
  }
});

// =======================
// 💳 УСПЕШНАЯ ОПЛАТА
// =======================
bot.on("successful_payment", async (msg) => {
  try {
    const payment = msg.successful_payment;
    if (!payment) return;

    const payload = JSON.parse(payment.invoice_payload);
    const telegramId = Number(payload.telegramId);
    const plan = String(payload.plan || "premium_month");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const { error } = await supabaseAdmin
      .from("subscriptions")
      .upsert(
        {
          telegram_id: telegramId,
          plan,
          status: "active",
          expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "telegram_id" }
      );

    if (error) {
      console.error("SUPABASE ERROR:", error);

      await bot.sendMessage(
        msg.chat.id,
        "❗ Оплата прошла, но при активации Premium произошла ошибка."
      );
      return;
    }

    await bot.sendMessage(
      msg.chat.id,
      "🎉 Оплата прошла успешно! Premium активирован на 30 дней."
    );

    console.log("✅ PAYMENT SUCCESS:", telegramId, plan);
  } catch (error) {
    console.error("❌ PAYMENT HANDLER ERROR:", error);
  }
});