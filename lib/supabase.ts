// Client Supabase lato browser (la sicurezza è garantita dalle policy RLS).
import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anon);

let client: ReturnType<typeof createBrowserClient> | null = null;

export function supabase() {
  if (!url || !anon) {
    throw new Error(
      "Mancano NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY: copia .env.example in .env.local e compila i valori."
    );
  }
  if (!client) client = createBrowserClient(url, anon);
  return client;
}
