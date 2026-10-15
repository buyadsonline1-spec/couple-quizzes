import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { sendTelegramMessage, getAppLink } from "@/lib/server/telegram-notify";

// Вызывается только из pg_cron (Postgres), ежедневно, см.
// supabase/daily_bonus_reminder_cron.sql — секрет вместо
// validateRequestAuth, это не клиентский запрос.
//
// Получатели — RPC get_daily_bonus_reminder_recipients() (та же
// формула "сегодня" по Europe/Helsinki, что и в claim_daily_bonus,
// см. daily_bonus_server_side.sql): реальные telegram_id (> 0), кто
// ещё не забрал бонус сегодня.
const WEBHOOK_SECRET = process.env.INTERNAL_WEBHOOK_SECRET;

// Поднимаем лимит времени выполнения (работает на Vercel Pro+; на
// Hobby всё равно обрежется его собственным потолком — тогда просто
// отправится меньше за один запуск, не ошибка).
export const maxDuration = 300;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get("x-webhook-secret");
    if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: recipients, error } = await supabaseAdmin.rpc(
      "get_daily_bonus_reminder_recipients"
    );

    if (error) {
      console.error("GET_DAILY_BONUS_REMINDER_RECIPIENTS RPC ERROR:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    const ids: number[] = (recipients ?? []).map((row: { telegram_id: number }) => row.telegram_id);

    const text =
      "🎁 Не забудь забрать ежедневный бонус в Couple Quizzes — серия продолжает расти, чем дольше не пропускаешь!";
    const appLink = getAppLink();

    // Шлём пачками, не все разом — грубо укладываемся в ~20 сообщений/с
    // Telegram-лимита (тот же порядок, что и в bot/broadcast.ts).
    const BATCH_SIZE = 20;
    let sent = 0;

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((telegramId) =>
          sendTelegramMessage(telegramId, text, { buttonText: "Открыть приложение", buttonUrl: appLink }).catch(
            (err) => console.error(`daily-bonus-reminder send error for ${telegramId}:`, err)
          )
        )
      );
      sent += batch.length;
      if (i + BATCH_SIZE < ids.length) await sleep(1000);
    }

    return NextResponse.json({ ok: true, recipients: ids.length, sent });
  } catch (error) {
    console.error("DAILY BONUS REMINDER CRON ERROR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
