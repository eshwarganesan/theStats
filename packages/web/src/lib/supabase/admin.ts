/**
 * Supabase admin client — uses the `service_role` key and BYPASSES RLS.
 *
 * Constitution Principle VI: this client must NEVER ship to a browser
 * bundle and MUST only be used from explicitly justified server-side paths
 * (currently: the `purge_unconfirmed_users` cron job; any future admin
 * route must justify the bypass in its PR description).
 *
 * The `import "server-only"` line below makes any client-side import a
 * BUILD-TIME error rather than a runtime leak.
 */
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/env";
import type { Database } from "./database.types";

export function createAdminClient(): SupabaseClient<Database> {
  const env = getServerEnv();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
