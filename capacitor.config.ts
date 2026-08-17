import type { CapacitorConfig } from "@capacitor/cli";

// Native iOS wrapper (Phase 2 of the App Store plan) — wraps the live
// production Next.js deployment in a WKWebView shell rather than a
// static bundle. The app's API routes are dynamic (server-rendered),
// so a static export isn't an option anyway; loading the real URL
// also means every `git push` to main updates the iOS app's content
// instantly, no App Store re-submission needed for content/bugfix
// changes (only for native shell/config changes like this file).
const config: CapacitorConfig = {
  appId: "com.couplequizzes.app",
  appName: "Couple Quizzes",
  webDir: "public",
  server: {
    url: "https://couple-quizzes.vercel.app",
    cleartext: false,
  },
};

export default config;
