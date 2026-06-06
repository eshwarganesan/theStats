/**
 * `requireAuth()` — for Server Components and Route Handlers that gate on a
 * signed-in user (per spec Clarification Q1, this is the helper future
 * account-gated routes use; the auth feature itself only consumes it via
 * the US3 demonstration `/account` route added in Phase 5).
 *
 * Behavior:
 *   - When a session exists, returns `{ user }` so the caller can read the
 *     user id / email.
 *   - When no session exists (or `getUser()` errors), redirects the user
 *     to `/login?from=<encoded path>`. The login page reads `from` to
 *     bounce the user back after a successful sign-in, satisfying FR-009.
 */
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";

export interface RequireAuthOptions {
  from?: string;
}

export async function requireAuth(opts?: RequireAuthOptions): Promise<{ user: User }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    const target = opts?.from
      ? `/login?from=${encodeURIComponent(opts.from)}`
      : "/login";
    redirect(target);
  }

  return { user: data.user };
}
