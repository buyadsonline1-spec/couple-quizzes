import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { supabaseAdmin } from "./supabase-admin";

dotenv.config({ path: ".env.local" });

const token = process.env.TELEGRAM_BOT_TOKEN;
const webAppUrl = process.env.WEB_APP_URL;
const giveawayChannelRaw =
  process.env.GIVEAWAY_CHANNEL?.trim();

if (!giveawayChannelRaw) {
  throw new Error("GIVEAWAY_CHANNEL is not set");
}

const giveawayChannel: string | number =
  giveawayChannelRaw.startsWith("-100")
    ? Number(giveawayChannelRaw)
    : giveawayChannelRaw;
const giveawayChannelUrl = process.env.GIVEAWAY_CHANNEL_URL;
const botUsername =
  process.env.BOT_USERNAME?.replace(/^@/, "") || "couple_quizzes_bot";

if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set");
}

if (!webAppUrl) {
  throw new Error("WEB_APP_URL is not set");
}


if (!giveawayChannelUrl) {
  throw new Error("GIVEAWAY_CHANNEL_URL is not set");
}

const bot = new TelegramBot(token, {
  polling: true,
});

console.log("🤖 Bot init");

// ======================================================
// ТИПЫ
// ======================================================

type GiveawayEntry = {
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  photo_url: string | null;
  subscription_verified: boolean;
  app_action_verified: boolean;
  pair_created: boolean;
  tickets: number;
  referral_count: number;
  status: "pending" | "verified" | "blocked" | "winner";
  created_at: string;
  verified_at: string | null;
};

type SubscriptionCheck = {
  subscribed: boolean;
  status: string;
};

// ======================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ======================================================

function normalizeTelegramId(value: unknown): number | null {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function getGiveawayReferralId(text?: string): number | null {
  if (!text) return null;

  const match = text.match(
    /^\/start(?:@\w+)?\s+giveaway_(\d+)$/i
  );

  if (!match) return null;

  return normalizeTelegramId(match[1]);
}

function getPersonalGiveawayLink(telegramId: number): string {
  return `https://t.me/${botUsername}?start=giveaway_${telegramId}`;
}

function isValidMemberStatus(
  member: TelegramBot.ChatMember
): boolean {
  if (
    member.status === "creator" ||
    member.status === "administrator" ||
    member.status === "member"
  ) {
    return true;
  }

  if (member.status === "restricted") {
    return Boolean(member.is_member);
  }

  return false;
}

async function checkSubscription(
  telegramId: number
): Promise<SubscriptionCheck> {
  try {
    const member = await bot.getChatMember(
      giveawayChannel,
      telegramId
    );

    console.log(
      "🔎 SUBSCRIPTION CHECK:",
      {
        telegramId,
        channel: giveawayChannel,
        status: member.status,
        isMember:
          "is_member" in member
            ? member.is_member
            : undefined,
      }
    );

    const subscribed =
      member.status === "creator" ||
      member.status === "administrator" ||
      member.status === "member" ||
      (
        member.status === "restricted" &&
        member.is_member === true
      );

    return {
      subscribed,
      status: member.status,
    };
  } catch (error) {
    console.error(
      "❌ CHECK SUBSCRIPTION ERROR:",
      {
        telegramId,
        channel: giveawayChannel,
        error,
      }
    );

    return {
      subscribed: false,
      status: "unknown",
    };
  }
}

async function getTelegramPhotoUrl(
  telegramId: number
): Promise<string | null> {
  try {
   const photos = await bot.getUserProfilePhotos(
  telegramId,
  {
    offset: 0,
    limit: 1,
  }
);

    const firstPhoto = photos.photos?.[0];
    const largestPhoto = firstPhoto?.[firstPhoto.length - 1];

    if (!largestPhoto) {
      return null;
    }

    const file = await bot.getFile(largestPhoto.file_id);

    if (!file.file_path) {
      return null;
    }

    return `https://api.telegram.org/file/bot${token}/${file.file_path}`;
  } catch (error) {
    console.error(
      "❌ GET TELEGRAM PHOTO ERROR:",
      telegramId,
      error
    );

    return null;
  }
}

async function getGiveawayEntry(
  telegramId: number
): Promise<GiveawayEntry | null> {
  const { data, error } = await supabaseAdmin
    .from("giveaway_entries")
    .select("*")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as GiveawayEntry | null;
}

async function createGiveawayEntry(
  user: TelegramBot.User
): Promise<GiveawayEntry> {
  const telegramId = normalizeTelegramId(user.id);

  if (!telegramId) {
    throw new Error("Invalid Telegram ID");
  }

  const existingEntry = await getGiveawayEntry(telegramId);

  if (existingEntry) {
    return existingEntry;
  }

  const photoUrl = await getTelegramPhotoUrl(telegramId);

  const { data, error } = await supabaseAdmin
    .from("giveaway_entries")
    .insert({
      telegram_id: telegramId,
      username: user.username || null,
      first_name: user.first_name || null,
      photo_url: photoUrl,
      subscription_verified: false,
      app_action_verified: false,
      pair_created: false,
      tickets: 1,
      referral_count: 0,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as GiveawayEntry;
}

async function savePendingReferral(
  inviterId: number,
  invitedId: number
): Promise<void> {
  if (inviterId === invitedId) {
    console.log("⚠️ Self-referral ignored:", invitedId);
    return;
  }

  const { data: inviter, error: inviterError } =
    await supabaseAdmin
      .from("giveaway_entries")
      .select("telegram_id")
      .eq("telegram_id", inviterId)
      .maybeSingle();

  if (inviterError) {
    throw inviterError;
  }

  // Ссылка могла быть получена от участника, который ещё
  // не нажал кнопку регистрации. Создавать фиктивного
  // пригласившего не будем.
  if (!inviter) {
    console.log(
      "⚠️ Inviter is not registered:",
      inviterId
    );
    return;
  }

  const { error } = await supabaseAdmin
    .from("giveaway_referrals")
    .upsert(
      {
        inviter_id: inviterId,
        invited_id: invitedId,
        status: "pending",
      },
      {
        onConflict: "invited_id",
        ignoreDuplicates: true,
      }
    );

  if (error) {
    throw error;
  }

  console.log(
    "✅ Pending referral saved:",
    inviterId,
    "→",
    invitedId
  );
}

async function updateSubscriptionStatus(
  telegramId: number,
  subscribed: boolean
): Promise<GiveawayEntry> {
  const currentEntry = await getGiveawayEntry(telegramId);

  if (!currentEntry) {
    throw new Error("Giveaway entry not found");
  }

  const canVerify =
    subscribed && currentEntry.app_action_verified;

  const nextStatus =
    currentEntry.status === "blocked" ||
    currentEntry.status === "winner"
      ? currentEntry.status
      : canVerify
        ? "verified"
        : "pending";

  const { data, error } = await supabaseAdmin
    .from("giveaway_entries")
    .update({
      subscription_verified: subscribed,
      status: nextStatus,
      verified_at: canVerify
        ? currentEntry.verified_at || new Date().toISOString()
        : null,
    })
    .eq("telegram_id", telegramId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as GiveawayEntry;
}

async function refreshGiveawayStats(
  telegramId: number
): Promise<GiveawayEntry> {
  const currentEntry = await getGiveawayEntry(telegramId);

  if (!currentEntry) {
    throw new Error("Giveaway entry not found");
  }

  const { count, error: referralError } =
    await supabaseAdmin
      .from("giveaway_referrals")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("inviter_id", telegramId)
      .eq("status", "verified");

  if (referralError) {
    throw referralError;
  }

  const verifiedReferralCount = count || 0;

  // 1 основной билет + по одному за подтверждённого друга.
  // Максимум — 5 билетов.
  const tickets = Math.min(
    5,
    1 + verifiedReferralCount
  );

  const { data, error } = await supabaseAdmin
    .from("giveaway_entries")
    .update({
      referral_count: verifiedReferralCount,
      tickets,
    })
    .eq("telegram_id", telegramId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as GiveawayEntry;
}

function getParticipationStatusText(
  entry: GiveawayEntry
): string {
  if (entry.status === "blocked") {
    return "⛔ Участие заблокировано";
  }

  if (entry.status === "winner") {
    return "🏆 Победитель";
  }

  if (
    entry.subscription_verified &&
    entry.app_action_verified
  ) {
    return "✅ Участие подтверждено";
  }

  if (!entry.subscription_verified) {
    return "⚠️ Не подтверждена подписка";
  }

  if (!entry.app_action_verified) {
    return "⏳ Пройди один тест или опрос";
  }

  return "⏳ Проверка участия";
}

function giveawayKeyboard(
  telegramId: number
): TelegramBot.InlineKeyboardMarkup {
  const personalLink =
    getPersonalGiveawayLink(telegramId);

  return {
    inline_keyboard: [
      [
        {
          text: "📢 Подписаться на канал",
          url: giveawayChannelUrl!,
        },
      ],
      [
        {
          text: "✅ Проверить участие",
          callback_data: "giveaway_check",
        },
      ],
      [
        {
          text: "💖 Открыть Couple Quizzes",
          web_app: {
            url: `${webAppUrl}?startapp=giveaway`,
          },
        },
      ],
      [
        {
          text: "👥 Пригласить друга",
          url:
            "https://t.me/share/url?" +
            new URLSearchParams({
              url: personalLink,
              text:
                "Участвуй в розыгрыше Couple Quizzes 💖\n" +
                "Можно выиграть сертификаты на 5000 ₽, 3000 ₽ и 1500 ₽!",
            }).toString(),
        },
      ],
      [
        {
          text: "📊 Мои шансы",
          callback_data: "giveaway_stats",
        },
      ],
    ],
  };
}

async function sendGiveawayCard(
  chatId: number,
  entry: GiveawayEntry
): Promise<void> {
  const personalLink =
    getPersonalGiveawayLink(entry.telegram_id);

  await bot.sendMessage(
    chatId,
  `🎁 Розыгрыш подарочных сертификатов от Couple Quizzes

🥇 1 место — Золотое яблоко, 5000 ₽
🥈 2 место — Wildberries, 3000 ₽
🥉 3 место — Яндекс Еда, 1500 ₽
${getParticipationStatusText(entry)}

🎟 Твои билеты: ${entry.tickets}
👥 Подтверждённых друзей: ${entry.referral_count}

Что нужно сделать:
1. Подписаться на канал
2. Открыть Couple Quizzes
3. Пройти один тест или опрос
4. Вернуться и нажать «Проверить участие»

Твоя персональная ссылка:
${personalLink}`,
    {
      reply_markup: giveawayKeyboard(
        entry.telegram_id
      ),
      disable_web_page_preview: true,
    }
  );
}

// ======================================================
// КНОПКА MINI APP В МЕНЮ TELEGRAM
// ======================================================

async function setMenuButton(): Promise<void> {
  try {
    await bot.setChatMenuButton({
      menu_button: {
        type: "web_app",
        text: "Открыть Couple Quizzes",
        web_app: {
          url: `${webAppUrl}?startapp=welcome`,
        },
      },
    });

    console.log("✅ Menu button set");
  } catch (error) {
    console.error(
      "❌ SET MENU BUTTON ERROR:",
      error
    );
  }
}

// ======================================================
// /start
// ======================================================

bot.onText(
  /^\/start(?:@\w+)?(?:\s+.*)?$/i,
  async (msg) => {
    try {
      const telegramId =
        normalizeTelegramId(msg.from?.id);

      if (!telegramId || !msg.from) {
        return;
      }

      console.log(
        "📩 /start received:",
        msg.text,
        "chat:",
        msg.chat.id
      );

      const inviterId =
        getGiveawayReferralId(msg.text);

      if (inviterId && inviterId !== telegramId) {
        try {
          await savePendingReferral(
            inviterId,
            telegramId
          );
        } catch (error) {
          console.error(
            "❌ SAVE REFERRAL ERROR:",
            error
          );
        }
      }

     await bot.sendMessage(
  msg.chat.id,
  `💖 Добро пожаловать в Couple Quizzes!

Здесь вы можете:
• проходить тесты и опросы для пары
• проверять вашу совместимость
• получать очки и награды
• выигрывать реальные призы`,
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
        [
          {
            text: "🎁 Участвовать в розыгрыше",
            callback_data: "giveaway_join",
          },
        ],
      ],
    },
  }
);

      console.log("✅ START message sent");
    } catch (error) {
      console.error(
        "❌ START HANDLER ERROR:",
        error
      );
    }
  }
);

// ======================================================
// CALLBACK-КНОПКИ
// ======================================================

bot.on("callback_query", async (query) => {
  const chatId = query.message?.chat.id;
  const user = query.from;
  const telegramId =
    normalizeTelegramId(user.id);

  if (!chatId || !telegramId) {
    return;
  }

  try {
    // Убирает бесконечную загрузку на кнопке.
    await bot.answerCallbackQuery(query.id);

    if (query.data === "giveaway_join") {
      const entry = await createGiveawayEntry(
        user
      );

      const subscription =
        await checkSubscription(telegramId);

      const updatedEntry =
        await updateSubscriptionStatus(
          telegramId,
          subscription.subscribed
        );

      await sendGiveawayCard(
        chatId,
        updatedEntry
      );

      return;
    }

    if (query.data === "giveaway_check") {
      let entry =
        await getGiveawayEntry(telegramId);

      if (!entry) {
        entry = await createGiveawayEntry(user);
      }

      const subscription =
        await checkSubscription(telegramId);

      entry = await updateSubscriptionStatus(
        telegramId,
        subscription.subscribed
      );

      entry = await refreshGiveawayStats(
        telegramId
      );

      if (!subscription.subscribed) {
        await bot.sendMessage(
          chatId,
          `❌ Подписка пока не найдена.

Подпишись на канал и затем снова нажми «Проверить участие».`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "📢 Подписаться",
                    url: giveawayChannelUrl!,
                  },
                ],
                [
                  {
                    text: "🔄 Проверить ещё раз",
                    callback_data:
                      "giveaway_check",
                  },
                ],
              ],
            },
          }
        );

        return;
      }

      if (!entry.app_action_verified) {
        await bot.sendMessage(
  chatId,
  `✅ Подписка подтверждена!

🎟 Ты получил +1 билет для участия в розыгрыше.

Увеличить количество билетов и свой шанс на выигрыш можно двумя способами:

• пройти любой тест или опрос в Couple Quizzes
• пригласить друзей по своей персональной ссылке`,
  {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "💖 Открыть Couple Quizzes",
            web_app: {
              url: `${webAppUrl}?startapp=giveaway`,
            },
          },
        ],
        [
          {
            text: "👥 Пригласить друзей",
            url:
              "https://t.me/share/url?" +
              new URLSearchParams({
                url: getPersonalGiveawayLink(telegramId),
                text:
                  "Участвуй в розыгрыше подарочных сертификатов от Couple Quizzes 💖",
              }).toString(),
          },
        ],
        [
          {
            text: "📊 Мои шансы",
            callback_data: "giveaway_stats",
          },
        ],
      ],
    },
  }
);

        return;
      }

      await sendGiveawayCard(chatId, entry);

      return;
    }

    if (query.data === "giveaway_stats") {
      let entry =
        await getGiveawayEntry(telegramId);

      if (!entry) {
        entry = await createGiveawayEntry(user);
      }

      entry = await refreshGiveawayStats(
        telegramId
      );

      await sendGiveawayCard(chatId, entry);
    }
  } catch (error) {
    console.error(
      "❌ CALLBACK QUERY ERROR:",
      error
    );

    await bot.sendMessage(
      chatId,
      "❗ Произошла ошибка. Попробуй ещё раз через несколько секунд."
    );
  }
});

// ======================================================
// УСПЕШНАЯ ОПЛАТА
// ======================================================

bot.on("successful_payment", async (msg) => {
  try {
    const payment = msg.successful_payment;

    if (!payment) {
      return;
    }

    const payload = JSON.parse(
      payment.invoice_payload
    );

    const telegramId =
      normalizeTelegramId(payload.telegramId);

    if (!telegramId) {
      throw new Error(
        "Invalid Telegram ID in invoice payload"
      );
    }

    const plan = String(
      payload.plan || "premium_month"
    );

    const expiresAt = new Date();
    expiresAt.setDate(
      expiresAt.getDate() + 30
    );

    const { error } = await supabaseAdmin
      .from("subscriptions")
      .upsert(
        {
          telegram_id: telegramId,
          plan,
          status: "active",
          expires_at:
            expiresAt.toISOString(),
          updated_at:
            new Date().toISOString(),
        },
        {
          onConflict: "telegram_id",
        }
      );

    if (error) {
      console.error(
        "❌ SUPABASE PAYMENT ERROR:",
        error
      );

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

    console.log(
      "✅ PAYMENT SUCCESS:",
      telegramId,
      plan
    );
  } catch (error) {
    console.error(
      "❌ PAYMENT HANDLER ERROR:",
      error
    );
  }
});

// ======================================================
// ЛОГ СООБЩЕНИЙ
// ======================================================

bot.on("message", (msg) => {
  console.log(
    "📨 Incoming message:",
    msg.text || "[non-text message]"
  );
});

// ======================================================
// ОШИБКИ
// ======================================================

bot.on("polling_error", (error) => {
  console.error(
    "❌ POLLING ERROR:",
    error.message
  );
});

bot.on("webhook_error", (error) => {
  console.error(
    "❌ WEBHOOK ERROR:",
    error.message
  );
});

// ======================================================
// ЗАПУСК
// ======================================================

async function startBot(): Promise<void> {
  try {
    await bot.deleteWebHook();

    console.log("✅ Webhook deleted");

    await setMenuButton();

    const giveawayChat = await bot.getChat(
  giveawayChannel
);

console.log(
  "✅ Giveaway channel connected:",
  {
    id: giveawayChat.id,
    title:
      "title" in giveawayChat
        ? giveawayChat.title
        : undefined,
    username:
      "username" in giveawayChat
        ? giveawayChat.username
        : undefined,
  }
);

    const me = await bot.getMe();

    console.log(
      `✅ Bot started: @${me.username}`
    );
  } catch (error) {
    console.error(
      "❌ BOT START ERROR:",
      error
    );
  }
}

void startBot();