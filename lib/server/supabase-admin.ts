import { createClient } from "@supabase/supabase-js";

// Общий service-role клиент для app/api/*/route.ts. Раньше каждый
// route.ts инстанцировал свой собственный клиент с одинаковым
// boilerplate — вынесено сюда, чтобы не дублировать в новых роутах
// (bootstrap, pair/state, poll/submit и т.д.).

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL is not set");
}

if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
