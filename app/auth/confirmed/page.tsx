"use client";

import { useEffect, useState } from "react";
import type { Market } from "@/config/markets";

// Куда попадает пользователь после клика по ссылке подтверждения из
// письма Supabase (см. emailRedirectTo в app/page.tsx, AuthScreen).
// Раньше такой ссылки не было вообще — Supabase уводил на Site URL
// проекта, то есть на обычный "Старт" экран веб-версии приложения.
// Человек не понимал, что это, не видел никакого подтверждения и не
// знал, что нужно вернуться в отдельное iOS-приложение и войти там.
// Эта страница ничего не проверяет и не делает — Supabase уже
// подтвердил email на своей стороне ДО редиректа сюда, здесь только
// сообщение "всё готово, вернись в приложение".
//
// Язык: приходит в query (?lang=ru|en|fi) из ссылки, которую сама же
// AuthScreen формирует по getMarket() — но ссылка из письма может быть
// открыта и без query (старое письмо, ручной переход), поэтому есть
// разумный дефолт на английский.
const CONTENT: Record<
  Market,
  { title: string; body: string; note: string }
> = {
  ru: {
    title: "Почта подтверждена ✅",
    body: "Можешь закрыть эту страницу и вернуться в приложение Couple Quizzes — там уже можно войти с этим email и паролем.",
    note: "Это окно можно закрыть.",
  },
  en: {
    title: "Email confirmed ✅",
    body: "You can close this page and go back to the Couple Quizzes app — you can now sign in there with this email and password.",
    note: "You can close this window.",
  },
  fi: {
    title: "Sähköposti vahvistettu ✅",
    body: "Voit sulkea tämän sivun ja palata Couple Quizzes -sovellukseen — voit nyt kirjautua sisään tällä sähköpostilla ja salasanalla.",
    note: "Tämän ikkunan voi sulkea.",
  },
};

function detectLangFromQuery(): Market {
  if (typeof window === "undefined") return "en";
  const fromQuery = new URLSearchParams(window.location.search).get("lang");
  if (fromQuery === "ru" || fromQuery === "en" || fromQuery === "fi") {
    return fromQuery;
  }
  const nav =
    typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "";
  if (nav.startsWith("ru")) return "ru";
  if (nav.startsWith("fi")) return "fi";
  return "en";
}

export default function EmailConfirmedPage() {
  const [market, setMarket] = useState<Market>("en");

  useEffect(() => {
    setMarket(detectLangFromQuery());
  }, []);

  const text = CONTENT[market];

  return (
    <div
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        paddingTop: "calc(env(safe-area-inset-top) + 24px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
        background:
          "radial-gradient(circle, rgba(238,174,202,1) 0%, rgba(148,187,233,1) 100%)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          border: "1px solid rgba(255,255,255,0.6)",
          borderRadius: 24,
          boxShadow: "0 12px 35px rgba(37, 34, 78, 0.18)",
          padding: 28,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 48 }}>💌</div>
        <div
          style={{
            marginTop: 12,
            fontSize: 22,
            fontWeight: 900,
            color: "#1f1d3a",
          }}
        >
          {text.title}
        </div>
        <div
          style={{
            marginTop: 12,
            fontSize: 15,
            lineHeight: 1.5,
            color: "#3a345c",
          }}
        >
          {text.body}
        </div>
        <div style={{ marginTop: 16, fontSize: 13, color: "#7a749a" }}>
          {text.note}
        </div>
      </div>
    </div>
  );
}
