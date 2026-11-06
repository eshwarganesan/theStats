/**
 * Shared Route Handler wrapper for feature 009-account-library.
 *
 * Per Constitution Principle VI: every non-public Route Handler MUST:
 *   1. Verify the caller's Supabase session server-side (no client-sent user IDs).
 *   2. Return a uniform `{ error: { code, message } }` envelope on failure.
 *   3. Emit a structured log line on entry and on exit.
 *
 * `withAuthenticatedHandler` centralizes these three responsibilities so
 * individual route files stay focused on their business logic. The wrapped
 * handler receives the verified `userId` plus the same Supabase client used
 * to verify the session, so downstream queries automatically go through the
 * user's JWT and respect RLS.
 *
 * Two credentials are accepted (see `readCredential`): the browser's
 * session cookie, and `Authorization: Bearer <access token>` from the iOS
 * app. Both are verified with Supabase Auth (`getUser`), which also
 * rejects a token whose session has been signed out, so the two paths
 * get the same checks.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { createStatelessClient } from "@/lib/supabase/stateless";
import type { Database } from "@/lib/supabase/database.types";

export type ServerSupabase = SupabaseClient<Database>;

export interface AuthenticatedContext {
  /** Supabase user id (auth.users.id) verified against the request's
   *  session cookie or bearer token. */
  userId: string;
  /** Supabase client bound to the caller's session — all queries flow
   *  through RLS. Do NOT swap in the service-role client here. */
  supabase: ServerSupabase;
  /** Correlation id emitted in structured logs. */
  requestId: string;
}

type AuthenticatedHandler = (
  request: Request,
  ctx: AuthenticatedContext,
) => Promise<Response>;

export type ErrorCode =
  | "unauthenticated"
  | "invalid_body"
  | "invalid_query_params"
  | "invalid_id"
  | "idempotency_key_required"
  | "not_found"
  | "finished_game_locked"
  | "internal_error";

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401,
  invalid_body: 400,
  invalid_query_params: 400,
  invalid_id: 400,
  idempotency_key_required: 400,
  not_found: 404,
  finished_game_locked: 409,
  internal_error: 500,
};

export function jsonError(
  code: ErrorCode,
  message: string,
  status?: number,
): Response {
  return new Response(
    JSON.stringify({ error: { code, message } }),
    {
      status: status ?? DEFAULT_STATUS[code],
      headers: { "Content-Type": "application/json" },
    },
  );
}

function newRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}_${Math.random()}`;
}

export type Credential =
  | { kind: "cookie" }
  | { kind: "bearer"; token: string }
  | { kind: "malformed" };

const BEARER_SCHEME = /^Bearer(\s|$)/i;
const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * Which credential a request carries. A Bearer `Authorization` header
 * takes precedence over cookies, and a malformed one is rejected rather
 * than ignored, so a request that meant to use a token never runs under
 * a cookie session instead. Other schemes (e.g. Basic auth added by a
 * proxy in front of the site) aren't ours and leave the cookie in charge.
 */
export function readCredential(request: Request): Credential {
  const header = request.headers.get("Authorization")?.trim();
  if (!header || !BEARER_SCHEME.test(header)) return { kind: "cookie" };
  const token = BEARER.exec(header)?.[1];
  return token ? { kind: "bearer", token } : { kind: "malformed" };
}

async function authenticate(
  credential: Exclude<Credential, { kind: "malformed" }>,
): Promise<{ userId: string; supabase: ServerSupabase } | null> {
  if (credential.kind === "bearer") {
    const supabase = createStatelessClient(credential.token);
    const { data, error } = await supabase.auth.getUser(credential.token);
    return error || !data.user ? null : { userId: data.user.id, supabase };
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.getUser();
  return error || !data.user ? null : { userId: data.user.id, supabase };
}

interface LogFields {
  handler: string;
  request_id: string;
  user_id: string | null;
  auth: Credential["kind"];
  outcome: string;
  status?: number;
}

function logEvent(fields: LogFields): void {
  console.log(
    JSON.stringify({
      component: "games-api",
      handler: fields.handler,
      request_id: fields.request_id,
      user_id: fields.user_id,
      auth: fields.auth,
      outcome: fields.outcome,
      status: fields.status,
      timestamp: new Date().toISOString(),
    }),
  );
}

/**
 * Wrap a Route Handler so that it (a) requires a signed-in Supabase user
 * (session cookie or bearer token), (b) emits entry/exit structured logs,
 * and (c) uniformly returns the shared error envelope on failures.
 *
 * The wrapped handler receives the verified user id plus a session-bound
 * Supabase client. RLS enforces authorization; this wrapper only enforces
 * authentication.
 */
export function withAuthenticatedHandler(
  handlerName: string,
  handler: AuthenticatedHandler,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const requestId = newRequestId();
    const credential = readCredential(request);
    const log = (userId: string | null, outcome: string, status?: number) =>
      logEvent({
        handler: handlerName,
        request_id: requestId,
        user_id: userId,
        auth: credential.kind,
        outcome,
        status,
      });
    log(null, "entry");

    const auth = credential.kind === "malformed" ? null : await authenticate(credential);
    if (!auth) {
      log(null, "unauthenticated", 401);
      return jsonError("unauthenticated", "Sign in to continue.");
    }

    try {
      const res = await handler(request, { ...auth, requestId });
      log(auth.userId, "ok", res.status);
      return res;
    } catch (err) {
      log(auth.userId, "internal_error", 500);
      // Do NOT leak err.message to the client — Principle VI.
      void err;
      return jsonError("internal_error", "Something went wrong.");
    }
  };
}
