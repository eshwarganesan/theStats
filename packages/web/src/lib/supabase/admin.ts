/**
 * Supabase admin client — uses the `service_role` key and BYPASSES RLS.
 *
 * Constitution Principle VI: this client must NEVER ship to a browser
 * bundle and MUST only be used from explicitly justified server-side paths.
 * The justified uses (each recorded in its plan's Complexity Tracking):
 *   - `lib/auth/attempt-throttle.ts`: the brute-force backoff RPCs, which
 *     only `service_role` may execute (migration 0004);
 *   - `lib/account/delete-account.ts`: `auth.admin.deleteUser` for the
 *     verified caller's own account, after a throttled password check
 *     (feature 018);
 *   - `lib/account/account-status.ts`: `auth.admin.getUserById`, to tell a
 *     signed-out device whether its account still exists (feature 018).
 * Any new use must justify the bypass in its PR description.
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
