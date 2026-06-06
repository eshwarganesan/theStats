/**
 * GET /auth/callback
 *
 * Email-confirmation callback. See
 * specs/005-user-auth/contracts/get_auth_callback.md.
 * Exchanges the `code` for a session via `exchangeCodeForSession`, then
 * 303-redirects to `next` (if it's a safe relative path) or `/`.
 */
import { logAuthEvent } from "@/lib/auth/log-auth-event";
import { createServerClient } from "@/lib/supabase/server";

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}_${Math.random()}`;
}

/** Same rule as Zod `nextField` in lib/auth/schemas.ts: only a single
 *  leading `/`, no protocol-relative `//evil.com` or absolute URLs. */
function safeNext(raw: string | null): string {
  if (!raw) return "/";
  if (raw.length > 512) return "/";
  if (!/^\/(?!\/)/.test(raw)) return "/";
  return raw;
}

function redirectResponse(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: location },
  });
}

export async function GET(request: Request): Promise<Response> {
  const reqId = requestId();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (!code) {
    logAuthEvent({
      handler: "callback",
      userId: null,
      outcome: "missing_code",
      requestId: reqId,
    });
    return redirectResponse("/login?error=missing_code");
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    logAuthEvent({
      handler: "callback",
      userId: null,
      outcome: "confirmation_failed",
      requestId: reqId,
    });
    return redirectResponse("/login?error=confirmation_failed");
  }

  logAuthEvent({
    handler: "callback",
    userId: data.user?.id ?? null,
    outcome: "ok",
    requestId: reqId,
  });
  return redirectResponse(next);
}
