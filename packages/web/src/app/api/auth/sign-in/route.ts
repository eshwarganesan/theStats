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
 *
 * The flow itself lives in `passwordSignIn`, shared with the iOS app's
 * POST /api/auth/token. This handler binds it to the cookie client, so
 * the session lands in cookies and the body is just `{ ok: true }`.
 */
import { passwordSignIn } from "@/lib/auth/password-sign-in";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(request: Request): Promise<Response> {
  const result = await passwordSignIn(request, createServerClient, "sign-in");
  if (!result.ok) return result.response;

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
