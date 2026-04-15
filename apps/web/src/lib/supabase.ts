import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Client-side Supabase client (uses anon key, respects RLS) */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** Server-side Supabase client (uses service role, bypasses RLS — use carefully) */
export function createServerClient() {
  return createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
