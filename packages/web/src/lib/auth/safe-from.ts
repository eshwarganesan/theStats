/**
 * Open-redirect guard for the `from` query param that the login flow uses
 * to bounce a user back to a deep-linked page after sign-in.
 *
 * Accepts only same-origin relative paths — a single leading `/` that is
 * NOT followed by another `/` (which would be protocol-relative and could
 * be used to redirect to an attacker-controlled host). Also caps the
 * length so a pathological query cannot balloon the redirect URL.
 *
 * Callers MUST run values from `searchParams` or user-controlled input
 * through this before treating them as a navigation target. Middleware
 * composes `from` from `request.nextUrl.pathname + search` (guaranteed
 * same-origin) and the login page reads it back through this guard.
 */
export function safeFrom(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (raw.length > 512) return undefined;
  if (!/^\/(?!\/)/.test(raw)) return undefined;
  return raw;
}
