/**
 * Stateless Supabase server client for requests that carry their
 * credentials explicitly instead of in cookies: POST /api/auth/token,
 * and the games API when the iOS app sends `Authorization: Bearer`.
 *
 * Anon key only, so RLS still applies. Unlike `createServerClient`, it
 * neither reads nor writes cookies and keeps any session in memory for
 * the lifetime of one request.
 *
 * Given an access token, every PostgREST request is sent with it, so
 * queries run as that user. The token is NOT verified here; callers
 * check it with `auth.getUser(token)` before trusting it.
 */
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/env";
import type { Database } from "./database.types";

export function createStatelessClient(accessToken?: string): SupabaseClient<Database> {
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
      ...(accessToken
        ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
        : {}),
    },
  );
}
