export function getMarket(): "ru" | "en" {
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem("couple-quizzes-lang");
    if (saved === "ru" || saved === "en") {
      return saved;
    }
  }

  return "ru";
}