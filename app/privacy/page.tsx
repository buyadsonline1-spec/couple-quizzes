import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Couple Quizzes",
  description: "How Couple Quizzes collects, uses, and protects your data.",
};

// Публичная страница, обязательна для App Store Connect (App Information
// -> Privacy Policy URL) и для App Privacy nutrition labels — Apple не
// пускает на ревью без неё. На английском намеренно: приложение
// распространяется глобально (один листинг, RU/EN/FI внутри), и это
// единственный язык, гарантированно читаемый и командой ревью Apple, и
// пользователем из любой страны.
export default function PrivacyPolicyPage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "40px 20px 80px",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: "#1f1d3a",
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 900 }}>
        Privacy Policy — Couple Quizzes
      </h1>
      <p style={{ color: "#6b6480" }}>Last updated: August 20, 2026</p>

      <p>
        Couple Quizzes (&quot;we&quot;, &quot;us&quot;, &quot;the app&quot;)
        is a quiz and poll app for couples, available as a Telegram Mini App
        and as a standalone iOS app. This policy explains what data we
        collect, why, and how you can control it.
      </p>

      <h2 style={sectionHeading}>1. Information we collect</h2>
      <ul>
        <li>
          <strong>Account identity.</strong> If you use the app inside
          Telegram, we receive your Telegram user ID, first/last name,
          username, and profile photo URL as provided by Telegram. If you use
          the standalone iOS app, you create an account with an email
          address and password, or with Sign in with Apple (in which case we
          receive only the name and email you choose to share, per Apple&apos;s
          own privacy controls).
        </li>
        <li>
          <strong>Profile details you provide.</strong> Gender, and any
          display name you set.
        </li>
        <li>
          <strong>App activity.</strong> Your answers to quizzes, polls, and
          games; points, levels, and streaks; whether you are paired with a
          partner and your shared progress with them.
        </li>
        <li>
          <strong>AI Psychologist conversations.</strong> If you use the
          optional AI Psychologist feature, the messages you send are
          processed by our AI provider (OpenAI) to generate a response. We
          store the conversation so you can continue it later.
        </li>
        <li>
          <strong>Subscription status.</strong> Whether you have an active
          Premium subscription, and which payment method was used (Telegram
          Stars, Apple In-App Purchase, or our payment partner Tribute) — we
          do not receive or store your card number or full payment details;
          those are handled entirely by Telegram, Apple, or Tribute.
        </li>
      </ul>

      <h2 style={sectionHeading}>2. How we use this information</h2>
      <ul>
        <li>To operate the app: show your quizzes, polls, points, and pair progress.</li>
        <li>To verify your identity and keep your account secure.</li>
        <li>To generate AI Psychologist responses to messages you send.</li>
        <li>To process and verify Premium purchases and keep your subscription active.</li>
        <li>To send you app-relevant notifications (e.g. your partner completed a poll), where supported by the platform.</li>
      </ul>
      <p>We do not sell your personal data, and we do not use it for third-party advertising.</p>

      <h2 style={sectionHeading}>3. Who we share it with</h2>
      <p>We use a small number of service providers to run the app. We share only what each one needs to do its job:</p>
      <ul>
        <li><strong>Supabase</strong> — our database and authentication provider, hosting all account and app-activity data described above.</li>
        <li><strong>OpenAI</strong> — processes messages you send to the AI Psychologist feature, solely to generate a response.</li>
        <li><strong>Telegram</strong> — if you use the app inside Telegram, Telegram provides your identity data and, if applicable, processes Telegram Stars payments.</li>
        <li><strong>Apple</strong> — if you use the standalone iOS app, Apple provides Sign in with Apple authentication and processes In-App Purchases, per Apple&apos;s own privacy policy.</li>
        <li><strong>Tribute</strong> — an optional third-party payment processor for Premium subscriptions.</li>
      </ul>
      <p>We do not share your data with anyone else, except where required by law.</p>

      <h2 style={sectionHeading}>4. Your partner and shared data</h2>
      <p>
        Couple Quizzes is built around pairs. When you pair with a partner,
        certain data — such as poll answers, points, and streaks tied to
        your pair — becomes visible to your partner within the app. This is
        core to how the app works and is why we ask you to only pair with
        someone you know and trust.
      </p>

      <h2 style={sectionHeading}>5. Data retention and deletion</h2>
      <p>
        We keep your data for as long as your account is active. You can
        request deletion of your account and associated data at any time by
        contacting us (see below) — we will delete your data within a
        reasonable time, except where we are required to keep certain
        records (e.g. payment records) for legal or accounting purposes.
      </p>

      <h2 style={sectionHeading}>6. Children&apos;s privacy</h2>
      <p>
        Couple Quizzes is not directed at children under 13, and we do not
        knowingly collect personal data from children under 13. If you
        believe a child has provided us with personal data, please contact
        us and we will delete it.
      </p>

      <h2 style={sectionHeading}>7. Your rights</h2>
      <p>
        Depending on where you live, you may have the right to access,
        correct, export, or delete your personal data, or to object to or
        restrict certain processing. To exercise any of these rights,
        contact us using the details below.
      </p>

      <h2 style={sectionHeading}>8. Changes to this policy</h2>
      <p>
        We may update this policy from time to time. If we make material
        changes, we will update the &quot;Last updated&quot; date above.
      </p>

      <h2 style={sectionHeading}>9. Contact us</h2>
      <p>
        Questions about this policy or your data? Message us on Telegram:{" "}
        <a
          href="https://t.me/Couple_quizzes_support"
          style={{ color: "#6b46ff" }}
        >
          @Couple_quizzes_support
        </a>
        .
      </p>
    </main>
  );
}

const sectionHeading: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  marginTop: 32,
};
