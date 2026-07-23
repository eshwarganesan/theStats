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
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type ServerSupabase = SupabaseClient<Database>;

export interface AuthenticatedContext {
  /** Supabase user id (auth.users.id) verified against the session cookie. */
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

interface LogFields {
  handler: string;
  request_id: string;
  user_id: string | null;
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
      outcome: fields.outcome,
      status: fields.status,
      timestamp: new Date().toISOString(),
    }),
  );
}

/**
 * Wrap a Route Handler so that it (a) requires a signed-in Supabase user,
 * (b) emits entry/exit structured logs, and (c) uniformly returns the shared
 * error envelope on failures.
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
    logEvent({
      handler: handlerName,
      request_id: requestId,
      user_id: null,
      outcome: "entry",
    });

    const supabase = await createServerClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      logEvent({
        handler: handlerName,
        request_id: requestId,
        user_id: null,
        outcome: "unauthenticated",
        status: 401,
      });
      return jsonError("unauthenticated", "Sign in to continue.");
    }

    try {
      const res = await handler(request, {
        userId: data.user.id,
        supabase,
        requestId,
      });
      logEvent({
        handler: handlerName,
        request_id: requestId,
        user_id: data.user.id,
        outcome: "ok",
        status: res.status,
      });
      return res;
    } catch (err) {
      logEvent({
        handler: handlerName,
        request_id: requestId,
        user_id: data.user.id,
        outcome: "internal_error",
        status: 500,
      });
      // Do NOT leak err.message to the client — Principle VI.
      void err;
      return jsonError("internal_error", "Something went wrong.");
    }
  };
}
