import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://eudiyzokazypcalizcls.supabase.co";

const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1ZGl5em9rYXp5cGNhbGl6Y2xzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzgyOTgsImV4cCI6MjA4ODgxNDI5OH0.CLGd4sfjRcXsCRku1hN6ncldBe7wPrxTtFkUpM9wz_A";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);