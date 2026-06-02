/**
 * Structured-log helper for auth Route Handlers, per Constitution
 * Principle VI ("Every Route Handler MUST emit a structured log on entry
 * and on exit (including the error path) with at least a request ID, the
 * handler name, the authenticated user ID (if any), and the outcome").
 *
 * Emits a single JSON line via `console.log` for now. Replace with the
 * project's error tracker once one is configured (tracked as a follow-up
 * in research.md "Open follow-ups").
 */

export interface AuthLogContext {
  handler: string;
  userId: string | null;
  outcome: string;
  requestId: string;
}

export function logAuthEvent(ctx: AuthLogContext): void {
  const line = JSON.stringify({
    component: "auth",
    handler: ctx.handler,
    user_id: ctx.userId,
    outcome: ctx.outcome,
    request_id: ctx.requestId,
    timestamp: new Date().toISOString(),
  });
  console.log(line);
}
