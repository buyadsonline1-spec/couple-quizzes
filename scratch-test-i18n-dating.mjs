import crypto from "crypto";
import fs from "fs";

const envText = fs.readFileSync(new URL("./.env.local", import.meta.url), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BASE_URL = process.env.WEB_APP_URL || "https://couple-quizzes.vercel.app";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const A = 9999003001;
const B = 9999003002;

function buildInitData(id, first_name) {
  const authDate = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams();
  params.set("user", JSON.stringify({ id, first_name }));
  params.set("auth_date", String(authDate));
  const dcs = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dcs).digest("hex");
  params.set("hash", hash);
  return params.toString();
}
async function api(path, initData, body = {}) {
  const res = await fetch(`${BASE_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData, ...body }) });
  return { status: res.status, json: await res.json().catch(() => null) };
}
async function rest(path, opts = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...opts, headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", ...(opts.headers || {}) } }).then((r) => r.json().catch(() => null));
}

const idA = buildInitData(A, "FiUser");
const idB = buildInitData(B, "EnUser");

await api("/api/bootstrap", idA);
await api("/api/bootstrap", idB);

await api("/api/test/submit", idA, { testId: "love-language", answers: [3, 3, 3, 0, 1] });
await api("/api/test/submit", idA, { testId: "personality-strengths", answers: [3, 3, 3, 0, 1] });
await api("/api/test/submit", idB, { testId: "love-language", answers: [2, 2, 2, 0, 1] });
await api("/api/test/submit", idB, { testId: "personality-strengths", answers: [2, 2, 2, 0, 1] });

console.log("=== profile save with market=fi for A ===");
const profFi = await api("/api/dating/profile", idA, { displayName: "FiUser", age: 25, bio: "", photoUrl: null, gender: "boy", seekingGender: "girl", market: "fi" });
console.log(JSON.stringify(profFi.json?.personalitySummary));

console.log("\n=== profile save with market=en for B ===");
const profEn = await api("/api/dating/profile", idB, { displayName: "EnUser", age: 24, bio: "", photoUrl: null, gender: "girl", seekingGender: "boy", market: "en" });
console.log(JSON.stringify(profEn.json?.personalitySummary));

console.log("\n=== match ===");
await api("/api/dating/swipe", idA, { toTelegramId: B, action: "like" });
const matchRes = await api("/api/dating/swipe", idB, { toTelegramId: A, action: "like" });
console.log(matchRes.json);

console.log("\n=== matches for A with market=fi (icebreakers should be Finnish) ===");
const matchesFi = await api("/api/dating/matches", idA, { market: "fi" });
console.log(JSON.stringify(matchesFi.json?.matches?.[0]?.icebreakers, null, 2));

console.log("\n=== matches for B with market=en (icebreakers should be English) ===");
const matchesEn = await api("/api/dating/matches", idB, { market: "en" });
console.log(JSON.stringify(matchesEn.json?.matches?.[0]?.icebreakers, null, 2));

console.log("\ncleanup...");
await rest(`profiles?telegram_id=eq.${A}`, { method: "DELETE" });
await rest(`profiles?telegram_id=eq.${B}`, { method: "DELETE" });
console.log("done");
