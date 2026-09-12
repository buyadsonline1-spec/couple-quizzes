import { NextRequest, NextResponse } from "next/server";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Единый справочник платных планов Stars-инвойсов. plan — единственный
// источник истины и для цены (тут), и для того, что именно начислить
// после оплаты (bot/bot.ts, successful_payment) — клиент не может
// подменить цену/длительность, присылая что-то своё в теле запроса.
const PLANS: Record<
  string,
  { title: string; description: string; label: string; amount: number; requiresTarget?: boolean }
> = {
  premium_month: {
    title: "Couple Quizzes Premium",
    description: "Полный доступ ко всем тестам, опросам и функциям Couple Quizzes",
    label: "Premium на 30 дней",
    amount: 149,
  },
  dating_superlike: {
    title: "Суперлайк",
    description: "Анкета сразу окажется в топе списка «Лайки мне» у получателя, с отдельным уведомлением",
    label: "Суперлайк",
    amount: 50,
    requiresTarget: true,
  },
  dating_boost_30m: {
    title: "Буст анкеты · 30 минут",
    description: "Анкета показывается первой в ленте у всех подходящих пользователей 30 минут",
    label: "Буст на 30 минут",
    amount: 150,
  },
  dating_boost_3h: {
    title: "Буст анкеты · 3 часа",
    description: "Анкета показывается первой в ленте у всех подходящих пользователей 3 часа",
    label: "Буст на 3 часа",
    amount: 250,
  },
  dating_boost_24h: {
    title: "Буст анкеты · 24 часа",
    description: "Анкета показывается первой в ленте у всех подходящих пользователей 24 часа",
    label: "Буст на 24 часа",
    amount: 500,
  },
};

// Вещи для питомца, доступные только за Stars (не за очки) — тот же
// принцип, что и у dating_superlike: клиент присылает только itemId,
// цену и допустимость решает сервер. Список id должен совпадать с
// grant_pair_pet_item (supabase/pair_pets_unlocks.sql) — иначе оплата
// пройдёт, а выдать вещь боту будет нечего.
const PET_ITEM_STARS: Record<string, { title: string; amount: number }> = {
  hat_crown: { title: "Корона для питомца", amount: 40 },
  acc_medal: { title: "Медаль для питомца", amount: 35 },
  room_space: { title: "Комната «Космос» для питомца", amount: 60 },
};

export async function POST(req: NextRequest) {
  try {
    if (!BOT_TOKEN) {
      return NextResponse.json(
        { error: "TELEGRAM_BOT_TOKEN is missing" },
        { status: 500 }
      );
    }

    const body = await req.json();
    console.log("CREATE INVOICE BODY:", body);
    console.log("BOT TOKEN EXISTS:", !!BOT_TOKEN);

    const telegramId = body?.telegramId;
    const plan = body?.plan;

    if (!telegramId) {
      return NextResponse.json(
        { error: "telegramId is required" },
        { status: 400 }
      );
    }

    // pet_item — отдельная ветка: один "план" на все Stars-вещи
    // питомца, цена берётся из PET_ITEM_STARS по itemId (клиент
    // присылает только id, не сумму), а не заводить в PLANS запись
    // на каждую вещь по отдельности.
    const petItemId = plan === "pet_item" && typeof body?.itemId === "string" ? body.itemId : undefined;
    const petItemConfig = petItemId ? PET_ITEM_STARS[petItemId] : undefined;

    const planConfig =
      plan === "pet_item"
        ? petItemConfig
          ? {
              title: "Couple Quizzes — вещь для питомца",
              description: petItemConfig.title,
              label: petItemConfig.title,
              amount: petItemConfig.amount,
              requiresTarget: false,
            }
          : undefined
        : typeof plan === "string"
          ? PLANS[plan]
          : undefined;

    if (!planConfig) {
      return NextResponse.json(
        { error: "Unknown plan" },
        { status: 400 }
      );
    }

    const toTelegramId = Number(body?.toTelegramId);

    if (planConfig.requiresTarget && !Number.isFinite(toTelegramId)) {
      return NextResponse.json(
        { error: "toTelegramId is required for this plan" },
        { status: 400 }
      );
    }

    const payload = JSON.stringify({
      telegramId,
      plan,
      ...(planConfig.requiresTarget ? { toTelegramId } : {}),
      ...(petItemId ? { itemId: petItemId } : {}),
    });

    const tgRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: planConfig.title,
          description: planConfig.description,
          payload,
          currency: "XTR",
          prices: [
            {
              label: planConfig.label,
              amount: planConfig.amount,
            },
          ],
        }),
      }
    );

    const tgData = await tgRes.json();
    console.log("TELEGRAM CREATE INVOICE RESPONSE:", tgData);

    if (!tgData.ok) {
      return NextResponse.json(
        { error: tgData.description || "Failed to create invoice link" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      invoiceLink: tgData.result,
    });
  } catch (error) {
    console.error("CREATE STARS INVOICE ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}