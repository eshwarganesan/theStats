/**
 * Shared email + password sign-in flow behind both sign-in endpoints:
 *
 *   - POST /api/auth/sign-in — web. Cookie-bound client; the session is
 *     written to cookies by @supabase/ssr.
 *   - POST /api/auth/token   — iOS app. Stateless client; the session
 *     tokens are returned in the response body.
 *
 * Keeping one implementation means both clients get the same Zod
 * validation, FR-011 per-account + per-IP backoff, FR-005 unconfirmed
 * handling, and FR-007 / FR-015 non-enumerating error bodies.
 */
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { checkAuthAttempt, recordAuthAttempt, throttleKeys } from "@/lib/auth/attempt-throttle";
import { signInInput } from "@/lib/auth/schemas";
import { toJsonError } from "@/lib/auth/errors";
import { logAuthEvent } from "@/lib/auth/log-auth-event";
import type { Database } from "@/lib/supabase/database.types";

export function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}_${Math.random()}`;
}

export type PasswordSignInResult =
  | { ok: true; user: User | null; session: Session | null }
  | { ok: false; response: Response };

function unconfirmed(): Response {
  return toJsonError(
    "email_unconfirmed",
    "Please confirm your email before signing in.",
    { details: { resend_endpoint: "/api/auth/resend-confirmation" } },
  );
}

export async function passwordSignIn(
  request: Request,
  getClient: () => Promise<SupabaseClient<Database>> | SupabaseClient<Database>,
  handler: string,
): Promise<PasswordSignInResult> {
  const reqId = requestId();
  const fail = (response: Response): PasswordSignInResult => ({ ok: false, response });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    logAuthEvent({ handler, userId: null, outcome: "invalid_input:json", requestId: reqId });
    return fail(toJsonError("invalid_input", "Request body must be valid JSON."));
  }

  const parsed = signInInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue?.path[0] ?? "(root)");
    logAuthEvent({
      handler,
      userId: null,
      outcome: `invalid_input:${field}`,
      requestId: reqId,
    });
    return fail(
      toJsonError("invalid_input", "Please fix the highlighted fields and try again.", {
        details: { field, reason: issue?.message ?? "Invalid value." },
      }),
    );
  }

  const { email, password } = parsed.data;
  const supabase = await getClient();
  const keys = throttleKeys(email, request);

  // Throttle check (atomic Postgres RPC).
  const allowed = await checkAuthAttempt(keys);
  if (!allowed) {
    logAuthEvent({
      handler,
      userId: null,
      outcome: "internal_error:throttle_lookup",
      requestId: reqId,
    });
    return fail(toJsonError("internal_error", "Something went wrong."));
  }
  if (!allowed.allowed) {
    logAuthEvent({ handler, userId: null, outcome: "rate_limited", requestId: reqId });
    return fail(
      toJsonError("rate_limited", "Too many attempts. Please try again shortly.", {
        retryAfterSeconds: allowed.retryAfterSeconds,
      }),
    );
  }

  const result = await supabase.auth.signInWithPassword({ email, password });

  if (result.error) {
    await recordAuthAttempt(keys, false);
    const msg = result.error.message ?? "";
    const code = result.error.code ?? "";

    if (
      /rate.?limit/i.test(msg) ||
      code === "over_request_rate_limit" ||
      code === "over_email_send_rate_limit"
    ) {
      logAuthEvent({
        handler,
        userId: null,
        outcome: "rate_limited:provider",
        requestId: reqId,
      });
      return fail(
        toJsonError("rate_limited", "Too many attempts. Please try again shortly.", {
          retryAfterSeconds: 60,
        }),
      );
    }

    // Email-not-confirmed shows up here as a specific provider error.
    // FR-005: return 403 email_unconfirmed; FR-015: also sign out any
    // partial session the provider may have established.
    if (/email.*not.*confirm/i.test(msg) || code === "email_not_confirmed") {
      try {
        await supabase.auth.signOut();
      } catch {
        /* best-effort: defensive sign-out */
      }
      logAuthEvent({ handler, userId: null, outcome: "email_unconfirmed", requestId: reqId });
      return fail(unconfirmed());
    }

    // EVERY other auth error — invalid credentials, nonexistent user,
    // etc. — maps to the IDENTICAL generic 401 (FR-007 / FR-015).
    logAuthEvent({ handler, userId: null, outcome: "invalid_credentials", requestId: reqId });
    return fail(toJsonError("invalid_credentials", "Invalid email or password."));
  }

  // The provider returned no error but we still need to verify the user
  // is confirmed — older provider versions allow sign-in to succeed even
  // when email isn't confirmed.
  const user = result.data.user;
  if (user && !user.email_confirmed_at) {
    try {
      await supabase.auth.signOut();
    } catch {
      /* best-effort */
    }
    await recordAuthAttempt(keys, true);
    logAuthEvent({ handler, userId: user.id, outcome: "email_unconfirmed", requestId: reqId });
    return fail(unconfirmed());
  }

  await recordAuthAttempt(keys, true);
  logAuthEvent({ handler, userId: user?.id ?? null, outcome: "ok", requestId: reqId });

  return { ok: true, user, session: result.data.session };
}
