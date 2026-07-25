"use client";

type GiveawayActionType = "test" | "poll";

export async function confirmGiveawayAction(
  actionType: GiveawayActionType
): Promise<boolean> {
  try {
    if (typeof window === "undefined") {
      return false;
    }

    const initData =
      window.Telegram?.WebApp?.initData ?? "";

    if (!initData) {
      console.warn(
        "Giveaway action was not confirmed: Telegram initData is missing"
      );

      return false;
    }

    const response = await fetch(
      "/api/giveaway/complete-action",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          initData,
          actionType,
        }),
      }
    );

    const result = await response
      .json()
      .catch(() => null);

    if (!response.ok) {
      console.error(
        "Giveaway action confirmation failed:",
        result
      );

      return false;
    }

    return result?.success === true;
  } catch (error) {
    console.error(
      "Giveaway action confirmation error:",
      error
    );

    return false;
  }
}