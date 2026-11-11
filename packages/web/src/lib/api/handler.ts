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
 *
 * A credential whose account has been deleted gets its own answer,
 * `401 account_deleted`, so the device can sign out and clear its copy
 * of the account's games (feature 018, FR-009).
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
  /** The verified user's email, or null if the account has none. */
  email: string | null;
  /** Which credential the request carried. */
  credential: "cookie" | "bearer";
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
  | "account_deleted"
  | "invalid_body"
  | "invalid_query_params"
  | "invalid_id"
  | "idempotency_key_required"
  | "current_password_incorrect"
  | "not_found"
  | "finished_game_locked"
  | "rate_limited"
  | "internal_error";

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401,
  account_deleted: 401,
  invalid_body: 400,
  invalid_query_params: 400,
  invalid_id: 400,
  idempotency_key_required: 400,
  current_password_incorrect: 403,
  not_found: 404,
  finished_game_locked: 409,
  rate_limited: 429,
  internal_error: 500,
};

export interface JsonErrorExtra {
  /** Adds `retry_after_seconds` to the body and a `Retry-After` header. */
  retryAfterSeconds?: number;
}

export function jsonError(
  code: ErrorCode,
  message: string,
  status?: number,
  extra?: JsonErrorExtra,
): Response {
  const error: Record<string, unknown> = { code, message };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (extra?.retryAfterSeconds !== undefined) {
    error.retry_after_seconds = extra.retryAfterSeconds;
    headers["Retry-After"] = String(extra.retryAfterSeconds);
  }
  return new Response(JSON.stringify({ error }), {
    status: status ?? DEFAULT_STATUS[code],
    headers,
  });
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

type AuthResult =
  | { kind: "ok"; userId: string; email: string | null; supabase: ServerSupabase }
  | { kind: "deleted" }
  | { kind: "unauthenticated" };

/**
 * Supabase Auth answers `user_not_found` for a still-valid token whose
 * user no longer exists, and checks the user before the session, so this
 * is how a deleted account shows up (feature 018, research R5).
 */
function isDeletedAccount(error: { code?: string } | null): boolean {
  return error?.code === "user_not_found";
}

async function authenticate(
  credential: Exclude<Credential, { kind: "malformed" }>,
): Promise<AuthResult> {
  if (credential.kind === "bearer") {
    const supabase = createStatelessClient(credential.token);
    const { data, error } = await supabase.auth.getUser(credential.token);
    if (data.user && !error) {
      return { kind: "ok", userId: data.user.id, email: data.user.email ?? null, supabase };
    }
    return isDeletedAccount(error) ? { kind: "deleted" } : { kind: "unauthenticated" };
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (data.user && !error) {
    return { kind: "ok", userId: data.user.id, email: data.user.email ?? null, supabase };
  }
  if (!isDeletedAccount(error)) return { kind: "unauthenticated" };
  // Expire the dead session cookie, so the browser stops sending it.
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // best effort: the answer is the same either way
  }
  return { kind: "deleted" };
}

export interface ApiLogFields {
  component: string;
  handler: string;
  request_id: string;
  user_id: string | null;
  auth?: Credential["kind"];
  outcome: string;
  status?: number;
}

/** One structured log line (Constitution Principle VI, observability). */
export function logApiEvent(fields: ApiLogFields): void {
  console.log(
    JSON.stringify({
      component: fields.component,
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

export interface HandlerOptions {
  /** The `component` of the structured logs. Defaults to "games-api". */
  component?: string;
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
  opts: HandlerOptions = {},
): (request: Request) => Promise<Response> {
  const component = opts.component ?? "games-api";
  return async (request: Request): Promise<Response> => {
    const requestId = newRequestId();
    const credential = readCredential(request);
    const log = (userId: string | null, outcome: string, status?: number) =>
      logApiEvent({
        component,
        handler: handlerName,
        request_id: requestId,
        user_id: userId,
        auth: credential.kind,
        outcome,
        status,
      });
    log(null, "entry");

    if (credential.kind === "malformed") {
      log(null, "unauthenticated", 401);
      return jsonError("unauthenticated", "Sign in to continue.");
    }

    const auth = await authenticate(credential);
    if (auth.kind === "deleted") {
      log(null, "account_deleted", 401);
      return jsonError("account_deleted", "This account no longer exists.");
    }
    if (auth.kind === "unauthenticated") {
      log(null, "unauthenticated", 401);
      return jsonError("unauthenticated", "Sign in to continue.");
    }

    const ctx: AuthenticatedContext = {
      userId: auth.userId,
      email: auth.email,
      credential: credential.kind,
      supabase: auth.supabase,
      requestId,
    };
    try {
      const res = await handler(request, ctx);
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
