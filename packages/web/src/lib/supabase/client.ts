/**
 * Supabase browser client for Client Components.
 *
 * Uses the anon key only (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). RLS is the real
 * security boundary; this client is safe to instantiate in the browser
 * bundle. Per Constitution Principle VI, this file MUST NOT reach for the
 * service-role key in any branch.
 */
import { createBrowserClient as createSSRBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/env";
import type { Database } from "./database.types";

export function createBrowserClient() {
  const env = getPublicEnv();
  return createSSRBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
