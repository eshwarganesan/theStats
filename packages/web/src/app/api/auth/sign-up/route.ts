/**
 * POST /api/auth/sign-up
 *
 * See specs/005-user-auth/contracts/post_sign_up.md for the full contract.
 * Per Constitution Principle VI: Zod-validate body at the boundary, run the
 * per-account + per-IP brute-force throttle, call Supabase Auth, map any
 * provider error to the project's typed error model, record the attempt
 * outcome, emit a structured log line.
 */
import { z } from "zod";
import { signUpInput } from "@/lib/auth/schemas";
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
    logAuthEvent({ handler: "sign-up", userId: null, outcome: "invalid_input:json", requestId: reqId });
    return toJsonError("invalid_input", "Request body must be valid JSON.");
  }

  const parsed = signUpInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue?.path[0] ?? "(root)");
    logAuthEvent({
      handler: "sign-up",
      userId: null,
      outcome: `invalid_input:${field}`,
      requestId: reqId,
    });
    return toJsonError("invalid_input", "Please fix the highlighted fields and try again.", {
      details: { field, reason: issue?.message ?? "Invalid value." },
    });
  }

  const { email, password, next } = parsed.data;
  const supabase = await createServerClient();
  const keys = [emailKey(email), ipKey(request)];

  // Throttle check (per-account + per-IP, atomic in Postgres).
  const allowedResult = await supabase.rpc("is_auth_attempt_allowed", { p_keys: keys });
  if (allowedResult.error) {
    logAuthEvent({
      handler: "sign-up",
      userId: null,
      outcome: "internal_error:throttle_lookup",
      requestId: reqId,
    });
    return toJsonError("internal_error", "Something went wrong.");
  }
  const allowed = allowedSchema.parse(allowedResult.data);
  if (!allowed.allowed) {
    logAuthEvent({
      handler: "sign-up",
      userId: null,
      outcome: "rate_limited",
      requestId: reqId,
    });
    return toJsonError("rate_limited", "Too many attempts. Please try again shortly.", {
      retryAfterSeconds: allowed.retry_after_seconds,
    });
  }

  const origin = new URL(request.url).origin;
  const emailRedirectTo = next
    ? `${origin}/auth/callback?next=${encodeURIComponent(next)}`
    : `${origin}/auth/callback`;

  const signUpResult = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo },
  });

  if (signUpResult.error) {
    await supabase.rpc("record_auth_attempt", { p_keys: keys, p_success: false });
    const msg = signUpResult.error.message ?? "";
    const code = signUpResult.error.code ?? "";

    if (
      /already (?:registered|exists)/i.test(msg) ||
      code === "user_already_exists" ||
      code === "email_exists"
    ) {
      logAuthEvent({ handler: "sign-up", userId: null, outcome: "email_exists", requestId: reqId });
      return toJsonError(
        "email_exists",
        "An account already exists for this email. Sign in instead.",
      );
    }

    // Password-policy / weak-password rejections from the provider.
    // FR-003 / R5: surface the provider's reason verbatim.
    if (
      /password/i.test(msg) ||
      code === "weak_password" ||
      code === "password_too_short"
    ) {
      logAuthEvent({
        handler: "sign-up",
        userId: null,
        outcome: "invalid_input:password",
        requestId: reqId,
      });
      return toJsonError("invalid_input", "Please fix the highlighted fields and try again.", {
        details: { field: "password", reason: msg || "Password rejected by the auth provider." },
      });
    }

    // Provider-level rate limit (GoTrue's per-IP throttle). Surface as our
    // standard 429 rather than a 500 so the client gets a meaningful retry.
    if (
      /rate.?limit/i.test(msg) ||
      /too many/i.test(msg) ||
      code === "over_email_send_rate_limit" ||
      code === "over_request_rate_limit"
    ) {
      logAuthEvent({
        handler: "sign-up",
        userId: null,
        outcome: "rate_limited:provider",
        requestId: reqId,
      });
      return toJsonError(
        "rate_limited",
        "Too many attempts. Please try again shortly.",
        { retryAfterSeconds: 60 },
      );
    }

    logAuthEvent({
      handler: "sign-up",
      userId: null,
      outcome: `internal_error:${code || "unknown"}:${msg.slice(0, 200)}`,
      requestId: reqId,
    });
    return toJsonError("internal_error", "Something went wrong.");
  }

  // Duplicate-email obfuscation: when the project has email confirmation
  // enabled, signUp returns a *fake* user with an empty `identities` array
  // for already-registered emails rather than an explicit error. Detect and
  // map to 409 per FR-004 ("MUST tell the user a matching account already
  // exists when a duplicate sign-up is attempted").
  const identities = signUpResult.data.user?.identities;
  if (signUpResult.data.user && Array.isArray(identities) && identities.length === 0) {
    await supabase.rpc("record_auth_attempt", { p_keys: keys, p_success: false });
    logAuthEvent({
      handler: "sign-up",
      userId: null,
      outcome: "email_exists:obfuscated",
      requestId: reqId,
    });
    return toJsonError(
      "email_exists",
      "An account already exists for this email. Sign in instead.",
    );
  }

  await supabase.rpc("record_auth_attempt", { p_keys: keys, p_success: true });
  logAuthEvent({
    handler: "sign-up",
    userId: signUpResult.data.user?.id ?? null,
    outcome: "ok",
    requestId: reqId,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
