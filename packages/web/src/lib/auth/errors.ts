/**
 * Typed error model for the auth Route Handlers.
 *
 * Per Constitution Principle VI ("Errors returned to the client MUST follow
 * a single shape `{ error: { code, message } }`"). Every code maps to one
 * HTTP status; `rate_limited` additionally sets the `Retry-After` header
 * and `retry_after_seconds` in the body.
 *
 * Returns a Web `Response` rather than `NextResponse` so the helper is
 * trivially testable in jsdom and runs identically in Edge + Node runtimes.
 */

export type AuthErrorCode =
  | "invalid_input"
  | "email_exists"
  | "invalid_credentials"
  | "email_unconfirmed"
  | "rate_limited"
  | "missing_code"
  | "internal_error";

export const AUTH_ERROR_STATUS: Record<AuthErrorCode, number> = {
  invalid_input: 400,
  email_exists: 409,
  invalid_credentials: 401,
  email_unconfirmed: 403,
  rate_limited: 429,
  missing_code: 400,
  internal_error: 500,
};

export interface AuthErrorOptions {
  details?: Record<string, unknown>;
  retryAfterSeconds?: number;
}

export function toJsonError(
  code: AuthErrorCode,
  message: string,
  opts?: AuthErrorOptions,
): Response {
  const body: Record<string, unknown> = { code, message };
  if (opts?.details) body.details = opts.details;
  if (typeof opts?.retryAfterSeconds === "number") {
    body.retry_after_seconds = opts.retryAfterSeconds;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof opts?.retryAfterSeconds === "number") {
    headers["Retry-After"] = String(opts.retryAfterSeconds);
  }

  return new Response(JSON.stringify({ error: body }), {
    status: AUTH_ERROR_STATUS[code],
    headers,
  });
}
