import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Couple Quizzes",
  description: "Telegram Mini App",
};

// viewportFit: "cover" — без него env(safe-area-inset-*) в CSS всегда
// равен 0, даже на устройствах с вырезом/динамическим островом.
// Внутри Telegram это было не важно — там свой header держит контент
// подальше от выреза. В standalone iOS-сборке (Capacitor,
// WKWebView на весь экран) контент без этого залезает под вырез и
// под home indicator снизу — стало заметно только сейчас, когда
// впервые тестируем полноэкранный режим вне Telegram.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        {children}
      </body>
    </html>
  );
}
