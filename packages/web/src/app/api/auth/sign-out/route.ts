/**
 * POST /api/auth/sign-out
 *
 * See specs/005-user-auth/contracts/post_sign_out.md.
 *
 * Idempotent: unauthenticated callers receive the same 204 No Content as
 * a signed-in caller whose session was invalidated. Cookies are cleared
 * via @supabase/ssr's setAll bridge — no explicit Set-Cookie work needed
 * in this handler.
 */
import { logAuthEvent } from "@/lib/auth/log-auth-event";
import { toJsonError } from "@/lib/auth/errors";
import { createServerClient } from "@/lib/supabase/server";

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}_${Math.random()}`;
}

export async function POST(_request: Request): Promise<Response> {
  const reqId = requestId();
  try {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    const userId = data?.user?.id ?? null;

    if (userId) {
      await supabase.auth.signOut();
    }

    logAuthEvent({ handler: "sign-out", userId, outcome: "ok", requestId: reqId });
    return new Response(null, { status: 204 });
  } catch {
    logAuthEvent({
      handler: "sign-out",
      userId: null,
      outcome: "internal_error",
      requestId: reqId,
    });
    return toJsonError("internal_error", "Something went wrong.");
  }
}
