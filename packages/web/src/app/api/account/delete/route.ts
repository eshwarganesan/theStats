/**
 * POST /api/account/delete (feature 018-account-deletion).
 *
 * See specs/018-account-deletion/contracts/delete-account-api.md.
 *
 * Deletes the caller's own account, profile and saved games once they
 * confirm with their current password. One route for both clients: the
 * web app's session cookie and the iOS app's bearer token are verified by
 * `withAuthenticatedHandler`, and the account to delete is always the
 * verified caller's, never one named in the request.
 *
 * A repeat after a successful delete (a double submit, or a retry after a
 * lost response) is answered `401 account_deleted` by the wrapper, which
 * clients treat as "already deleted" (FR-014).
 */
import { DeleteAccountBodySchema } from "@thestats/app";
import {
  jsonError,
  logApiEvent,
  withAuthenticatedHandler,
  type AuthenticatedContext,
} from "@/lib/api/handler";
import { deleteOwnAccount } from "@/lib/account/delete-account";

const HANDLER = "account-delete";
const COMPONENT = "account-api";

async function handle(request: Request, ctx: AuthenticatedContext): Promise<Response> {
  // The specific outcome, next to the wrapper's entry/exit lines. Never
  // the password or the email address.
  const logOutcome = (outcome: string, status: number) =>
    logApiEvent({
      component: COMPONENT,
      handler: HANDLER,
      request_id: ctx.requestId,
      user_id: ctx.userId,
      auth: ctx.credential,
      outcome,
      status,
    });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    logOutcome("invalid_body", 400);
    return jsonError("invalid_body", "Enter your password to confirm.");
  }
  const parsed = DeleteAccountBodySchema.safeParse(raw);
  if (!parsed.success) {
    logOutcome("invalid_body", 400);
    return jsonError("invalid_body", "Enter your password to confirm.");
  }
  if (!ctx.email) {
    logOutcome("internal_error:no_email", 500);
    return jsonError("internal_error", "Something went wrong.");
  }

  const result = await deleteOwnAccount({
    request,
    userId: ctx.userId,
    email: ctx.email,
    password: parsed.data.password,
  });

  switch (result.kind) {
    case "deleted":
      if (ctx.credential === "cookie") {
        // Expire this browser's session cookies with the account.
        try {
          await ctx.supabase.auth.signOut({ scope: "local" });
        } catch {
          // best effort: the account is gone either way
        }
      }
      logOutcome("ok", 204);
      return new Response(null, { status: 204 });
    case "wrong-password":
      logOutcome("current_password_incorrect", 403);
      return jsonError("current_password_incorrect", "Current password is incorrect.");
    case "rate-limited":
      logOutcome("rate_limited", 429);
      return jsonError("rate_limited", "Too many attempts. Please try again shortly.", undefined, {
        retryAfterSeconds: result.retryAfterSeconds,
      });
    case "error":
      logOutcome(`internal_error:${result.stage}`, 500);
      return jsonError("internal_error", "Something went wrong.");
  }
}

const deleteAccount = withAuthenticatedHandler(HANDLER, handle, { component: COMPONENT });

export async function POST(request: Request): Promise<Response> {
  const response = await deleteAccount(request);
  // Every answer, the wrapper's 401s included, is about one user's account.
  response.headers.set("Cache-Control", "no-store");
  return response;
}
