/**
 * POST /api/auth/sign-in
 *
 * See specs/005-user-auth/contracts/post_sign_in.md.
 *
 * Constraint highlights:
 *   - FR-007 / FR-015: wrong password and nonexistent email MUST return
 *     byte-identical 401 bodies (no enumeration).
 *   - FR-005: if the user authenticates but their email is unconfirmed,
 *     return 403 email_unconfirmed AND sign them back out so no session
 *     cookie survives.
 *   - FR-011: per-account + per-IP exponential backoff via Postgres RPC.
 */
import { z } from "zod";
import { signInInput } from "@/lib/auth/schemas";
import { toJsonError } from "@/lib/auth/errors";
import { logAuthEvent } from "@/lib/auth/log-auth-event";
import { createServerClient } from "@/lib/supabase/server";

const allowedSchema = z.object({
  allowed: z.boolean(),
  retry_after_seconds: z.number().int().nonnegative(),
});

function emailKey(email: string): string {
  return `e:${email}`;
}
function ipKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd ? (fwd.split(",")[0] ?? "").trim() : "unknown";
  return `ip:${ip || "unknown"}`;
}
function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}_${Math.random()}`;
}

export async function POST(request: Request): Promise<Response> {
  const reqId = requestId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    logAuthEvent({ handler: "sign-in", userId: null, outcome: "invalid_input:json", requestId: reqId });
    return toJsonError("invalid_input", "Request body must be valid JSON.");
  }

  const parsed = signInInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue?.path[0] ?? "(root)");
    logAuthEvent({
      handler: "sign-in",
      userId: null,
      outcome: `invalid_input:${field}`,
      requestId: reqId,
    });
    return toJsonError("invalid_input", "Please fix the highlighted fields and try again.", {
      details: { field, reason: issue?.message ?? "Invalid value." },
    });
  }

  const { email, password } = parsed.data;
  const supabase = await createServerClient();
  const keys = [emailKey(email), ipKey(request)];

  // Throttle check (atomic Postgres RPC).
  const allowedResult = await supabase.rpc("is_auth_attempt_allowed", { p_keys: keys });
  if (allowedResult.error) {
    logAuthEvent({
      handler: "sign-in",
      userId: null,
      outcome: "internal_error:throttle_lookup",
      requestId: reqId,
    });
    return toJsonError("internal_error", "Something went wrong.");
  }
  const allowed = allowedSchema.parse(allowedResult.data);
  if (!allowed.allowed) {
    logAuthEvent({
      handler: "sign-in",
      userId: null,
      outcome: "rate_limited",
      requestId: reqId,
    });
    return toJsonError("rate_limited", "Too many attempts. Please try again shortly.", {
      retryAfterSeconds: allowed.retry_after_seconds,
    });
  }

  const result = await supabase.auth.signInWithPassword({ email, password });

  if (result.error) {
    await supabase.rpc("record_auth_attempt", { p_keys: keys, p_success: false });
    const msg = result.error.message ?? "";
    const code = result.error.code ?? "";

    if (
      /rate.?limit/i.test(msg) ||
      code === "over_request_rate_limit" ||
      code === "over_email_send_rate_limit"
    ) {
      logAuthEvent({
        handler: "sign-in",
        userId: null,
        outcome: "rate_limited:provider",
        requestId: reqId,
      });
      return toJsonError("rate_limited", "Too many attempts. Please try again shortly.", {
        retryAfterSeconds: 60,
      });
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
      logAuthEvent({
        handler: "sign-in",
        userId: null,
        outcome: "email_unconfirmed",
        requestId: reqId,
      });
      return toJsonError(
        "email_unconfirmed",
        "Please confirm your email before signing in.",
        { details: { resend_endpoint: "/api/auth/resend-confirmation" } },
      );
    }

    // EVERY other auth error — invalid credentials, nonexistent user,
    // etc. — maps to the IDENTICAL generic 401 (FR-007 / FR-015).
    logAuthEvent({
      handler: "sign-in",
      userId: null,
      outcome: "invalid_credentials",
      requestId: reqId,
    });
    return toJsonError("invalid_credentials", "Invalid email or password.");
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
    await supabase.rpc("record_auth_attempt", { p_keys: keys, p_success: true });
    logAuthEvent({
      handler: "sign-in",
      userId: user.id,
      outcome: "email_unconfirmed",
      requestId: reqId,
    });
    return toJsonError(
      "email_unconfirmed",
      "Please confirm your email before signing in.",
      { details: { resend_endpoint: "/api/auth/resend-confirmation" } },
    );
  }

  await supabase.rpc("record_auth_attempt", { p_keys: keys, p_success: true });
  logAuthEvent({
    handler: "sign-in",
    userId: user?.id ?? null,
    outcome: "ok",
    requestId: reqId,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
