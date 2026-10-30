/**
 * POST /api/auth/resend-confirmation
 *
 * See specs/005-user-auth/contracts/post_resend_confirmation.md.
 *
 * Per FR-015 the response body MUST be identical regardless of whether
 * the email is registered + unconfirmed, registered + confirmed, or
 * unknown — otherwise the endpoint becomes an account-enumeration oracle.
 * We therefore ALWAYS return 200 { ok: true } once the request is
 * structurally valid and within the throttle window.
 */
import { resendInput } from "@/lib/auth/schemas";
import { checkAuthAttempt, recordAuthAttempt, throttleKeys } from "@/lib/auth/attempt-throttle";
import { toJsonError } from "@/lib/auth/errors";
import { logAuthEvent } from "@/lib/auth/log-auth-event";
import { createServerClient } from "@/lib/supabase/server";

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}_${Math.random()}`;
}

export async function POST(request: Request): Promise<Response> {
  const reqId = requestId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    logAuthEvent({
      handler: "resend-confirmation",
      userId: null,
      outcome: "invalid_input:json",
      requestId: reqId,
    });
    return toJsonError("invalid_input", "Request body must be valid JSON.");
  }

  const parsed = resendInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue?.path[0] ?? "(root)");
    logAuthEvent({
      handler: "resend-confirmation",
      userId: null,
      outcome: `invalid_input:${field}`,
      requestId: reqId,
    });
    return toJsonError("invalid_input", "Please fix the highlighted fields and try again.", {
      details: { field, reason: issue?.message ?? "Invalid value." },
    });
  }

  const { email } = parsed.data;
  const supabase = await createServerClient();
  const keys = throttleKeys(email, request);

  const allowed = await checkAuthAttempt(keys);
  if (!allowed) {
    logAuthEvent({
      handler: "resend-confirmation",
      userId: null,
      outcome: "internal_error:throttle_lookup",
      requestId: reqId,
    });
    return toJsonError("internal_error", "Something went wrong.");
  }
  if (!allowed.allowed) {
    logAuthEvent({
      handler: "resend-confirmation",
      userId: null,
      outcome: "rate_limited",
      requestId: reqId,
    });
    return toJsonError("rate_limited", "Too many attempts. Please try again shortly.", {
      retryAfterSeconds: allowed.retryAfterSeconds,
    });
  }

  // Best-effort provider call. We deliberately ignore any error here so
  // the response cannot be used to enumerate accounts; we record the
  // outcome in our internal log + throttle table only.
  const providerResult = await supabase.auth.resend({ type: "signup", email });
  const providerOk = !providerResult.error;
  await recordAuthAttempt(keys, providerOk);
  logAuthEvent({
    handler: "resend-confirmation",
    userId: null,
    outcome: providerOk ? "ok" : `provider_error:${providerResult.error?.code ?? "unknown"}`,
    requestId: reqId,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
