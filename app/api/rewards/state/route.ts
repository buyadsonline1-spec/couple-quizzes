import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateTelegramInitData } from "@/lib/server/telegram-auth";

// Раньше история призов колеса (wonRewards) и счётчики (spinsInfo)
// жили только в React state / localStorage, заполняясь исключительно
// как побочный эффект вызова /api/rewards/spin — при переустановке
// приложения или смене устройства пропадали, хотя реальная история
// уже давно и полностью лежит в public.wheel_spins на сервере (сам
// spin уже был server-authoritative, не хватало только чтения при
// открытии экрана). Этот эндпоинт закрывает именно это.

function todayInHelsinki(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Helsinki",
  });
}

function formatWonAt(createdAt: string): string {
  const date = new Date(createdAt);
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Helsinki",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

const DAILY_SPIN_LIMIT = 3;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const initData = typeof body.initData === "string" ? body.initData : "";

    const validation = validateTelegramInitData(initData);

    if (!validation.valid || !validation.telegramId) {
      return NextResponse.json(
        { error: "Invalid Telegram data" },
        { status: 401 }
      );
    }

    const telegramId = validation.telegramId;

    const [{ data: profile }, { data: spinRows, error: spinsError }] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("wheel_bonus_spins")
          .eq("telegram_id", telegramId)
          .maybeSingle(),
        supabaseAdmin
          .from("wheel_spins")
          .select(
            "id, item_id, item_title, category_id, category_title, spent_points, market, outcome_type, bonus_value, spin_source, spin_date, created_at"
          )
          .eq("telegram_id", telegramId)
          .order("created_at", { ascending: true }),
      ]);

    if (spinsError) {
      console.error("REWARDS STATE spins error:", spinsError);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    const rows = spinRows ?? [];
    const today = todayInHelsinki();

    const paidSpinsToday = rows.filter(
      (row) => row.spin_date === today && row.spin_source === "paid"
    ).length;

    const bonusSpinCredits = profile?.wheel_bonus_spins ?? 0;

    const wonRewards = rows.map((row) => ({
      spinId: row.id,
      itemId: row.item_id,
      title: row.item_title,
      categoryId: row.category_id,
      categoryTitle: row.category_title,
      wonAt: formatWonAt(row.created_at),
      spentPoints: row.spent_points,
      // Не хранятся по-строчно (не имеют смысла для прошлых записей) —
      // отдаём текущие значения на момент запроса для всех элементов.
      spinsUsedToday: paidSpinsToday,
      spinsRemainingToday: Math.max(0, DAILY_SPIN_LIMIT - paidSpinsToday),
      market: row.market,
      outcomeType: row.outcome_type,
      bonusValue: row.bonus_value,
      spinSource: row.spin_source,
      bonusSpinCredits,
    }));

    return NextResponse.json({
      ok: true,
      wonRewards,
      spinsInfo: {
        used: paidSpinsToday,
        remaining: Math.max(0, DAILY_SPIN_LIMIT - paidSpinsToday),
        bonusCredits: bonusSpinCredits,
      },
    });
  } catch (error) {
    console.error("REWARDS STATE ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
