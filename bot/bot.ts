import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { supabaseAdmin } from "./supabase-admin";

dotenv.config({ path: ".env.local" });

// ======================================================
// ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ
// ======================================================

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const webAppUrl = process.env.WEB_APP_URL?.trim();

const giveawayChannelRaw =
  process.env.GIVEAWAY_CHANNEL?.trim();

const giveawayChannelUrl =
  process.env.GIVEAWAY_CHANNEL_URL?.trim();

const botUsername =
  process.env.BOT_USERNAME?.trim().replace(/^@/, "") ||
  "couple_quizzes_bot";

if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set");
}

if (!webAppUrl) {
  throw new Error("WEB_APP_URL is not set");
}

if (!giveawayChannelRaw) {
  throw new Error("GIVEAWAY_CHANNEL is not set");
}

if (!giveawayChannelUrl) {
  throw new Error("GIVEAWAY_CHANNEL_URL is not set");
}

// Числовой ID канала преобразуем в number.
// Например: -1003660140515
const giveawayChannel: string | number =
  /^-?\d+$/.test(giveawayChannelRaw)
    ? Number(giveawayChannelRaw)
    : giveawayChannelRaw;

// Итоги: 1 августа 2026 года, 15:00 МСК.
// 15:00 МСК = 12:00 UTC.
const GIVEAWAY_END_AT =
  new Date("2026-08-01T12:00:00.000Z");

// ======================================================
// ИНИЦИАЛИЗАЦИЯ БОТА
// ======================================================

const bot = new TelegramBot(token, {
  polling: true,
});

console.log("🤖 Bot init");

// ======================================================
// ТИПЫ
// ======================================================

type GiveawayStatus =
  | "pending"
  | "verified"
  | "blocked"
  | "winner";

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

  status: GiveawayStatus;

  created_at: string;
  verified_at: string | null;
  updated_at?: string;
};

type SubscriptionCheck = {
  subscribed: boolean;
  status: string;
};

// ======================================================
// ОБЩИЕ ФУНКЦИИ
// ======================================================

function isGiveawayClosed(): boolean {
  return new Date() >= GIVEAWAY_END_AT;
}

function normalizeTelegramId(
  value: unknown
): number | null {
  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0
  ) {
    return null;
  }

  return parsed;
}

function getGiveawayReferralId(
  text?: string
): number | null {
  if (!text) {
    return null;
  }

  const match = text.match(
    /^\/start(?:@\w+)?\s+giveaway_(\d+)$/i
  );

  if (!match) {
    return null;
  }

  return normalizeTelegramId(match[1]);
}

function getPersonalGiveawayLink(
  telegramId: number
): string {
  return (
    `https://t.me/${botUsername}` +
    `?start=giveaway_${telegramId}`
  );
}

function getShareUrl(
  telegramId: number
): string {
  const personalLink =
    getPersonalGiveawayLink(telegramId);

  return (
    "https://t.me/share/url?" +
    new URLSearchParams({
      url: personalLink,
      text:
        "Участвуй в розыгрыше подарочных сертификатов " +
        "от Couple Quizzes 💖",
    }).toString()
  );
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

  if (
    member.status === "restricted" &&
    member.is_member === true
  ) {
    return true;
  }

  return false;
}

// ======================================================
// ПРОВЕРКА ПОДПИСКИ
// ======================================================

async function checkSubscription(
  telegramId: number
): Promise<SubscriptionCheck> {
  try {
    const member = await bot.getChatMember(
      giveawayChannel,
      telegramId
    );

    const subscribed =
      isValidMemberStatus(member);

    console.log("🔎 SUBSCRIPTION CHECK:", {
      telegramId,
      channel: giveawayChannel,
      status: member.status,
      subscribed,
      isMember:
        "is_member" in member
          ? member.is_member
          : undefined,
    });

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

// ======================================================
// ФОТО ПРОФИЛЯ TELEGRAM
// ======================================================

async function getTelegramPhotoUrl(
  telegramId: number
): Promise<string | null> {
  try {
    const photos =
      await bot.getUserProfilePhotos(
        telegramId,
        {
          offset: 0,
          limit: 1,
        }
      );

    const firstPhoto =
      photos.photos?.[0];

    const largestPhoto =
      firstPhoto?.[
        firstPhoto.length - 1
      ];

    if (!largestPhoto) {
      return null;
    }

    const file = await bot.getFile(
      largestPhoto.file_id
    );

    if (!file.file_path) {
      return null;
    }

    return (
      `https://api.telegram.org/file/` +
      `bot${token}/${file.file_path}`
    );
  } catch (error) {
    console.error(
      "❌ GET TELEGRAM PHOTO ERROR:",
      telegramId,
      error
    );

    return null;
  }
}

// ======================================================
// РАБОТА С GIVEAWAY_ENTRIES
// ======================================================

async function getGiveawayEntry(
  telegramId: number
): Promise<GiveawayEntry | null> {
  const { data, error } =
    await supabaseAdmin
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
  const telegramId =
    normalizeTelegramId(user.id);

  if (!telegramId) {
    throw new Error(
      "Invalid Telegram ID"
    );
  }

  const existingEntry =
    await getGiveawayEntry(telegramId);

  if (existingEntry) {
    return existingEntry;
  }

  const photoUrl =
    await getTelegramPhotoUrl(
      telegramId
    );

  const { data, error } =
    await supabaseAdmin
      .from("giveaway_entries")
      .insert({
        telegram_id: telegramId,
        username:
          user.username || null,
        first_name:
          user.first_name || null,
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

  console.log(
    "✅ GIVEAWAY ENTRY CREATED:",
    telegramId
  );

  return data as GiveawayEntry;
}

async function updateSubscriptionStatus(
  telegramId: number,
  subscribed: boolean
): Promise<GiveawayEntry> {
  const currentEntry =
    await getGiveawayEntry(telegramId);

  if (!currentEntry) {
    throw new Error(
      "Giveaway entry not found"
    );
  }

  const fullyVerified =
    subscribed &&
    currentEntry.app_action_verified;

  let nextStatus:
    GiveawayStatus =
    currentEntry.status;

  if (
    currentEntry.status !== "blocked" &&
    currentEntry.status !== "winner"
  ) {
    nextStatus = fullyVerified
      ? "verified"
      : "pending";
  }

  const { data, error } =
    await supabaseAdmin
      .from("giveaway_entries")
      .update({
        subscription_verified:
          subscribed,

        status: nextStatus,

        verified_at:
          fullyVerified
            ? currentEntry.verified_at ||
              new Date().toISOString()
            : null,
      })
      .eq(
        "telegram_id",
        telegramId
      )
      .select("*")
      .single();

  if (error) {
    throw error;
  }

  return data as GiveawayEntry;
}

// ======================================================
// РЕФЕРАЛЫ
// ======================================================

async function savePendingReferral(
  inviterId: number,
  invitedId: number
): Promise<void> {
  if (inviterId === invitedId) {
    console.log(
      "⚠️ Self-referral ignored:",
      invitedId
    );

    return;
  }

  // Проверяем, что пригласивший
  // действительно зарегистрирован.
  const { data: inviter, error } =
    await supabaseAdmin
      .from("giveaway_entries")
      .select("telegram_id")
      .eq("telegram_id", inviterId)
      .maybeSingle();

  if (error) {
    throw error;
  }

  if (!inviter) {
    console.log(
      "⚠️ Inviter is not registered:",
      inviterId
    );

    return;
  }

  // invited_id уникален.
  // Один человек может засчитаться
  // только одному пригласившему.
  const { error: referralError } =
    await supabaseAdmin
      .from("giveaway_referrals")
      .upsert(
        {
          inviter_id: inviterId,
          invited_id: invitedId,
          status: "pending",
          subscription_verified:
            false,
          app_action_verified:
            false,
        },
        {
          onConflict: "invited_id",
          ignoreDuplicates: true,
        }
      );

  if (referralError) {
    throw referralError;
  }

  console.log(
    "✅ PENDING REFERRAL SAVED:",
    inviterId,
    "→",
    invitedId
  );
}

async function refreshGiveawayStats(
  telegramId: number
): Promise<GiveawayEntry> {
  const currentEntry =
    await getGiveawayEntry(telegramId);

  if (!currentEntry) {
    throw new Error(
      "Giveaway entry not found"
    );
  }

  const {
    count,
    error: referralError,
  } = await supabaseAdmin
    .from("giveaway_referrals")
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq(
      "inviter_id",
      telegramId
    )
    .eq("status", "verified");

  if (referralError) {
    throw referralError;
  }

  const verifiedReferralCount =
    count || 0;

  // 1 билет за подписку.
  // +1 билет за каждого подтверждённого друга.
  // +1 билет за тест/опрос.
  // Максимум 5 билетов.
  const appActionBonus =
    currentEntry.app_action_verified
      ? 1
      : 0;

  const tickets = Math.min(
    5,
    1 +
      verifiedReferralCount +
      appActionBonus
  );

  const { data, error } =
    await supabaseAdmin
      .from("giveaway_entries")
      .update({
        referral_count:
          verifiedReferralCount,
        tickets,
      })
      .eq(
        "telegram_id",
        telegramId
      )
      .select("*")
      .single();

  if (error) {
    throw error;
  }

  return data as GiveawayEntry;
}

async function verifyReferralForInvitedUser(
  invitedId: number
): Promise<void> {
  // Переводим только pending → verified.
  // Повторное нажатие не даст
  // второй билет и уведомление.
  const {
    data: referral,
    error,
  } = await supabaseAdmin
    .from("giveaway_referrals")
    .update({
      status: "verified",
      subscription_verified: true,
      verified_at:
        new Date().toISOString(),
    })
    .eq("invited_id", invitedId)
    .eq("status", "pending")
    .select("inviter_id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  // Пользователь мог прийти
  // не по персональной ссылке.
  if (!referral) {
    return;
  }

  const inviterId =
    normalizeTelegramId(
      referral.inviter_id
    );

  if (!inviterId) {
    return;
  }

  const inviterEntry =
    await refreshGiveawayStats(
      inviterId
    );

  try {
    await bot.sendMessage(
      inviterId,
      `🎉 Твой друг принял участие в розыгрыше!

🎟 Тебе начислен +1 дополнительный билет.

👥 Подтверждённых друзей: ${inviterEntry.referral_count}
🎫 Всего билетов: ${inviterEntry.tickets}

Приглашай друзей и увеличивай свой шанс на победу 💖`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text:
                  "📊 Мои шансы",
                callback_data:
                  "giveaway_stats",
              },
            ],
            [
              {
                text:
                  "👥 Пригласить ещё друга",
                url:
                  getShareUrl(
                    inviterId
                  ),
              },
            ],
          ],
        },
      }
    );
  } catch (notificationError) {
    // Даже если пригласивший
    // заблокировал бота,
    // билет сохраняется.
    console.error(
      "❌ REFERRAL NOTIFICATION ERROR:",
      inviterId,
      notificationError
    );
  }

  console.log(
    "✅ REFERRAL VERIFIED:",
    inviterId,
    "→",
    invitedId
  );
}

// ======================================================
// ТЕКСТ СТАТУСА
// ======================================================

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
    return "✅ Все условия выполнены";
  }

  if (
    !entry.subscription_verified
  ) {
    return (
      "⚠️ Подписка на канал " +
      "ещё не подтверждена"
    );
  }

  return "✅ Подписка подтверждена";
}

// ======================================================
// КЛАВИАТУРА РОЗЫГРЫША
// ======================================================

function giveawayKeyboard(
  telegramId: number
): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text:
            "📢 Подписаться на канал",
          url: giveawayChannelUrl,
        },
      ],
      [
        {
          text:
            "✅ Проверить участие",
          callback_data:
            "giveaway_check",
        },
      ],
      [
        {
          text:
            "💖 Открыть Couple Quizzes",
          web_app: {
            url:
              `${webAppUrl}` +
              "?startapp=giveaway",
          },
        },
      ],
      [
        {
          text:
            "👥 Пригласить друга",
          url:
            getShareUrl(
              telegramId
            ),
        },
      ],
      [
        {
          text: "📊 Мои шансы",
          callback_data:
            "giveaway_stats",
        },
      ],
    ],
  };
}

// ======================================================
// КАРТОЧКА РОЗЫГРЫША
// ======================================================

async function sendGiveawayCard(
  chatId: number,
  entry: GiveawayEntry
): Promise<void> {
  const personalLink =
    getPersonalGiveawayLink(
      entry.telegram_id
    );

  await bot.sendMessage(
    chatId,
    `🎁 Розыгрыш подарочных сертификатов от Couple Quizzes

🥇 1 место — Золотое яблоко, 5000 ₽
🥈 2 место — Wildberries, 3000 ₽
🥉 3 место — Яндекс Еда, 1500 ₽

${getParticipationStatusText(entry)}

🎟 Твои билеты: ${entry.tickets}
👥 Подтверждённых друзей: ${entry.referral_count}

После подтверждения подписки ты получаешь первый билет.

Увеличить количество билетов и шанс на выигрыш можно:

• пройдя любой тест или опрос в Couple Quizzes
• приглашая друзей по своей персональной ссылке

📅 Итоги: 1 августа 2026 года в 15:00 МСК

Твоя персональная ссылка:
${personalLink}`,
    {
      reply_markup:
        giveawayKeyboard(
          entry.telegram_id
        ),

      disable_web_page_preview:
        true,
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
        text:
          "Открыть Couple Quizzes",
        web_app: {
          url:
            `${webAppUrl}` +
            "?startapp=welcome",
        },
      },
    });

    console.log(
      "✅ Menu button set"
    );
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
        normalizeTelegramId(
          msg.from?.id
        );

      if (
        !telegramId ||
        !msg.from
      ) {
        return;
      }

      console.log(
        "📩 /start received:",
        msg.text,
        "chat:",
        msg.chat.id
      );

      const inviterId =
        getGiveawayReferralId(
          msg.text
        );

      if (
        inviterId &&
        inviterId !== telegramId
      ) {
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
                  text:
                    "💖 Открыть Couple Quizzes",
                  web_app: {
                    url: webAppUrl,
                  },
                },
              ],
              [
                {
                  text:
                    "🎁 Участвовать в розыгрыше",
                  callback_data:
                    "giveaway_join",
                },
              ],
            ],
          },
        }
      );

      console.log(
        "✅ START message sent"
      );
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

bot.on(
  "callback_query",
  async (query) => {
    const chatId =
      query.message?.chat.id;

    const user = query.from;

    const telegramId =
      normalizeTelegramId(
        user.id
      );

    if (
      !chatId ||
      !telegramId
    ) {
      return;
    }

    try {
      // Убираем загрузку
      // с нажатой кнопки.
      await bot.answerCallbackQuery(
        query.id
      );

      // После дедлайна запрещаем
      // новые участия и проверки.
      if (
        isGiveawayClosed() &&
        (
          query.data ===
            "giveaway_join" ||
          query.data ===
            "giveaway_check"
        )
      ) {
        await bot.sendMessage(
          chatId,
          `⏰ Розыгрыш завершён!

Итоги подводятся 1 августа 2026 года в 15:00 МСК.

Победителей объявим в канале Couple Quizzes 💖`
        );

        return;
      }

      // ================================================
      // УЧАСТВОВАТЬ
      // ================================================

      if (
        query.data ===
        "giveaway_join"
      ) {
        await createGiveawayEntry(
          user
        );

        const subscription =
          await checkSubscription(
            telegramId
          );

        let updatedEntry =
          await updateSubscriptionStatus(
            telegramId,
            subscription.subscribed
          );

        if (
          subscription.subscribed
        ) {
          await verifyReferralForInvitedUser(
            telegramId
          );
        }

        updatedEntry =
          await refreshGiveawayStats(
            telegramId
          );

        await sendGiveawayCard(
          chatId,
          updatedEntry
        );

        return;
      }

      // ================================================
      // ПРОВЕРИТЬ УЧАСТИЕ
      // ================================================

      if (
        query.data ===
        "giveaway_check"
      ) {
        let entry =
          await getGiveawayEntry(
            telegramId
          );

        if (!entry) {
          entry =
            await createGiveawayEntry(
              user
            );
        }

        const subscription =
          await checkSubscription(
            telegramId
          );

        entry =
          await updateSubscriptionStatus(
            telegramId,
            subscription.subscribed
          );

        if (
          subscription.subscribed
        ) {
          await verifyReferralForInvitedUser(
            telegramId
          );
        }

        entry =
          await refreshGiveawayStats(
            telegramId
          );

        if (
          !subscription.subscribed
        ) {
          await bot.sendMessage(
            chatId,
            `❌ Подписка пока не найдена.

Подпишись на канал, затем нажми «Проверить ещё раз».`,
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text:
                        "📢 Подписаться",
                      url:
                        giveawayChannelUrl,
                    },
                  ],
                  [
                    {
                      text:
                        "🔄 Проверить ещё раз",
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

        if (
          !entry.app_action_verified
        ) {
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
                      text:
                        "💖 Открыть Couple Quizzes",
                      web_app: {
                        url:
                          `${webAppUrl}` +
                          "?startapp=giveaway",
                      },
                    },
                  ],
                  [
                    {
                      text:
                        "👥 Пригласить друзей",
                      url:
                        getShareUrl(
                          telegramId
                        ),
                    },
                  ],
                  [
                    {
                      text:
                        "📊 Мои шансы",
                      callback_data:
                        "giveaway_stats",
                    },
                  ],
                ],
              },
            }
          );

          return;
        }

        await sendGiveawayCard(
          chatId,
          entry
        );

        return;
      }

      // ================================================
      // МОИ ШАНСЫ
      // ================================================

      if (
        query.data ===
        "giveaway_stats"
      ) {
        let entry =
          await getGiveawayEntry(
            telegramId
          );

        if (!entry) {
          entry =
            await createGiveawayEntry(
              user
            );
        }

        entry =
          await refreshGiveawayStats(
            telegramId
          );

        await sendGiveawayCard(
          chatId,
          entry
        );

        return;
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
  }
);

// ======================================================
// УСПЕШНАЯ ОПЛАТА PREMIUM
// ======================================================

bot.on(
  "successful_payment",
  async (msg) => {
    try {
      const payment =
        msg.successful_payment;

      if (!payment) {
        return;
      }

      const payload =
        JSON.parse(
          payment.invoice_payload
        );

      const telegramId =
        normalizeTelegramId(
          payload.telegramId
        );

      if (!telegramId) {
        throw new Error(
          "Invalid Telegram ID in invoice payload"
        );
      }

      const plan = String(
        payload.plan ||
          "premium_month"
      );

      const expiresAt =
        new Date();

      expiresAt.setDate(
        expiresAt.getDate() + 30
      );

      const { error } =
        await supabaseAdmin
          .from("subscriptions")
          .upsert(
            {
              telegram_id:
                telegramId,
              plan,
              status: "active",
              expires_at:
                expiresAt.toISOString(),
              updated_at:
                new Date().toISOString(),
            },
            {
              onConflict:
                "telegram_id",
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
  }
);

// ======================================================
// ЛОГ ВХОДЯЩИХ СООБЩЕНИЙ
// ======================================================

bot.on("message", (msg) => {
  console.log(
    "📨 Incoming message:",
    msg.text ||
      "[non-text message]"
  );
});

// ======================================================
// ОШИБКИ
// ======================================================

bot.on(
  "polling_error",
  (error) => {
    console.error(
      "❌ POLLING ERROR:",
      error.message
    );
  }
);

bot.on(
  "webhook_error",
  (error) => {
    console.error(
      "❌ WEBHOOK ERROR:",
      error.message
    );
  }
);

// ======================================================
// ЗАПУСК
// ======================================================

async function startBot(): Promise<void> {
  try {
    await bot.deleteWebHook();

    console.log(
      "✅ Webhook deleted"
    );

    await setMenuButton();

    const giveawayChat =
      await bot.getChat(
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