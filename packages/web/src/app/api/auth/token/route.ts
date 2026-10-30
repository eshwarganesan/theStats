/**
 * POST /api/auth/token
 *
 * Email + password sign-in for native clients (the iOS app). Runs the
 * same flow as POST /api/auth/sign-in — Zod validation, FR-011 backoff,
 * FR-005 unconfirmed handling, FR-007 / FR-015 identical 401s — via
 * `passwordSignIn`, but on a stateless client: no cookies are set and
 * the session is returned in the body for the app to keep in the
 * device keychain.
 *
 * 200 body:
 *   { access_token, refresh_token, expires_at, token_type,
 *     user: { id, email } }
 * Errors use the shared `{ error: { code, message, ... } }` shape.
 */
import { toJsonError } from "@/lib/auth/errors";
import { passwordSignIn } from "@/lib/auth/password-sign-in";
import { createStatelessClient } from "@/lib/supabase/stateless";

export async function POST(request: Request): Promise<Response> {
  const result = await passwordSignIn(request, createStatelessClient, "token");
  if (!result.ok) return result.response;

  const { session, user } = result;
  if (!session || !user) {
    return toJsonError("internal_error", "Something went wrong.");
  }

  return new Response(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at ?? null,
      token_type: session.token_type,
      user: { id: user.id, email: user.email ?? null },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // Tokens must never land in a shared or browser cache.
        "Cache-Control": "no-store",
      },
    },
  );
}
