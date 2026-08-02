import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    "Supabase env vars are missing. Copy .env.example to .env.local and fill in your project values. " +
      "Realtime features will not connect until this is set.",
  );
}

// createClient throws synchronously on an empty/invalid URL, which would
// crash the entire app before it could even render. Falling back to a
// syntactically valid placeholder lets the app load normally; any actual
// realtime connection attempt then simply fails at runtime (handled as a
// "disconnected" state) instead of the whole page going blank.
export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : "https://placeholder.supabase.co",
  isSupabaseConfigured ? supabaseAnonKey : "placeholder-anon-key",
);
