export type Market = "ru" | "en";

export function getMarket(): Market {
  if (typeof window === "undefined") return "ru";

  const value = new URLSearchParams(window.location.search).get("market");
  return value === "en" ? "en" : "ru";
}