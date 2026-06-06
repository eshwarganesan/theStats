/**
 * Supabase server client for Route Handlers and Server Components.
 *
 * Uses the anon key + the request's session cookie (RLS-respecting, per
 * Constitution Principle VI). Cookie reads/writes are bridged to Next's
 * async `cookies()` API. The middleware (packages/web/middleware.ts) is
 * responsible for refreshing the session cookie on every request.
 */
import "server-only";
import { createServerClient as createSSRServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServerEnv } from "@/env";
import type { Database } from "./database.types";

export async function createServerClient() {
  const env = getServerEnv();
  const cookieStore = await cookies();

  return createSSRServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // In Server Components, cookies() is read-only — writes throw.
          // Swallow because the middleware will refresh the cookie on the
          // next round-trip anyway. Route Handlers + Server Actions, where
          // writes ARE allowed, will succeed here.
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // intentional: read-only context
          }
        },
      },
    },
  );
}
