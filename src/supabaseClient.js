import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// supabase is null when env vars are not configured yet
const isConfigured =
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl !== "YOUR_SUPABASE_URL_HERE" &&
  supabaseAnonKey !== "YOUR_SUPABASE_ANON_KEY_HERE" &&
  supabaseUrl.startsWith("http");

export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
