/**
 * Stateless Supabase server client for token-returning endpoints
 * (POST /api/auth/token, used by the iOS app).
 *
 * Anon key only, so RLS still applies. Unlike `createServerClient`, it
 * neither reads nor writes cookies and keeps the session in memory for
 * the lifetime of one request: the handler hands the tokens back in the
 * response body and the native client stores them.
 */
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/env";
import type { Database } from "./database.types";

export function createStatelessClient(): SupabaseClient<Database> {
  const env = getPublicEnv();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
}
