// Client Supabase con service-role key. DA USARE SOLO LATO SERVER (API route):
// questa chiave ha poteri elevati e NON deve mai avere il prefisso NEXT_PUBLIC_
// né finire nel codice eseguito dal browser.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
