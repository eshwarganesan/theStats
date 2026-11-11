/**
 * Deletes the caller's own account (feature 018-account-deletion, research
 * R1–R2), behind POST /api/account/delete.
 *
 *   1. The same per-account + per-IP backoff as sign-in, on the same keys,
 *      so wrong passwords here count toward the sign-in limit (FR-004).
 *   2. A password check through Supabase Auth on a stateless client, which
 *      leaves the caller's own session and cookies untouched (FR-003).
 *   3. A hard delete of the Auth user. Its sessions, profile, games and
 *      game_writes go with it in one transaction through `on delete
 *      cascade` (FR-005, FR-006). `auth_attempts` stays (FR-017).
 *
 * Service-role justification (Constitution Principle VI): only Supabase's
 * admin API can delete an Auth user, and the id is always the verified
 * caller's own, after a throttled password check. See plan.md,
 * Complexity Tracking.
 */
import "server-only";
import { checkAuthAttempt, recordAuthAttempt, throttleKeys } from "@/lib/auth/attempt-throttle";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStatelessClient } from "@/lib/supabase/stateless";

export interface DeleteOwnAccountInput {
  request: Request;
  /** The verified caller's id. Never taken from the request body. */
  userId: string;
  /** The verified caller's email. */
  email: string;
  password: string;
}

export type DeleteOwnAccountResult =
  | { kind: "deleted" }
  | { kind: "wrong-password" }
  | { kind: "rate-limited"; retryAfterSeconds: number }
  | { kind: "error"; stage: "throttle" | "delete" };

/** Supabase Auth's "no such user": a 404, or the `user_not_found` code. */
function isMissingUser(error: { status?: number; code?: string } | null): boolean {
  return error?.status === 404 || error?.code === "user_not_found";
}

export async function deleteOwnAccount(input: DeleteOwnAccountInput): Promise<DeleteOwnAccountResult> {
  // Normalized like sign-in's schema does, so both share the `e:<email>` key.
  const email = input.email.trim().toLowerCase();
  const keys = throttleKeys(email, input.request);

  const allowance = await checkAuthAttempt(keys);
  if (!allowance) return { kind: "error", stage: "throttle" };
  if (!allowance.allowed) {
    return { kind: "rate-limited", retryAfterSeconds: allowance.retryAfterSeconds };
  }

  const verifier = createStatelessClient();
  const admin = createAdminClient();

  const check = await verifier.auth.signInWithPassword({ email, password: input.password });
  if (check.error) {
    // A duplicate of a deletion that just finished fails here too; it
    // already got what it asked for (FR-014).
    const lookup = await admin.auth.admin.getUserById(input.userId);
    if (isMissingUser(lookup.error)) return { kind: "deleted" };
    await recordAuthAttempt(keys, false);
    return { kind: "wrong-password" };
  }
  await recordAuthAttempt(keys, true);

  const { error } = await admin.auth.admin.deleteUser(input.userId, false);
  if (!error || isMissingUser(error)) return { kind: "deleted" };

  // Nothing was deleted. Don't leave the check's session behind; local
  // scope ends only that session, not the caller's other ones.
  try {
    await verifier.auth.signOut({ scope: "local" });
  } catch {
    // best effort
  }
  return { kind: "error", stage: "delete" };
}
