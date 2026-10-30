/**
 * FR-011 per-account + per-IP brute-force backoff, shared by the
 * sign-in, token, sign-up and resend-confirmation handlers.
 *
 * The backing RPCs (`is_auth_attempt_allowed`, `record_auth_attempt`)
 * are executable by `service_role` only (migration 0004). Before that,
 * anyone holding the public anon key could call `record_auth_attempt`
 * directly to reset their own backoff or lock out someone else's
 * account. This module is the single place that calls them, through the
 * admin client.
 *
 * Service-role justification (Constitution Principle VI): the admin
 * client is used ONLY for these two RPCs, which touch nothing but
 * `public.auth_attempts`. Every user-facing auth call stays on the anon
 * or cookie client.
 */
import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const allowedSchema = z.object({
  allowed: z.boolean(),
  retry_after_seconds: z.number().int().nonnegative(),
});

export interface AttemptAllowance {
  allowed: boolean;
  retryAfterSeconds: number;
}

/** Throttle keys for one attempt: the normalized email and the client IP. */
export function throttleKeys(email: string, request: Request): string[] {
  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd ? (fwd.split(",")[0] ?? "").trim() : "unknown";
  return [`e:${email}`, `ip:${ip || "unknown"}`];
}

/**
 * Returns whether another attempt is allowed now, or `null` if the
 * lookup failed (callers answer 500 rather than fail open).
 */
export async function checkAuthAttempt(keys: string[]): Promise<AttemptAllowance | null> {
  const { data, error } = await createAdminClient().rpc("is_auth_attempt_allowed", {
    p_keys: keys,
  });
  if (error) return null;
  const parsed = allowedSchema.safeParse(data);
  if (!parsed.success) return null;
  return {
    allowed: parsed.data.allowed,
    retryAfterSeconds: parsed.data.retry_after_seconds,
  };
}

/** Records an attempt's outcome: success resets the backoff, failure grows it. */
export async function recordAuthAttempt(keys: string[], success: boolean): Promise<void> {
  await createAdminClient().rpc("record_auth_attempt", {
    p_keys: keys,
    p_success: success,
  });
}
