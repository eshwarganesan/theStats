/**
 * GET /api/account/status?userId=<uuid> (feature 018-account-deletion).
 *
 * See specs/018-account-deletion/contracts/account-status-api.md.
 *
 * Public by design: its callers are devices whose session already expired,
 * asking whether the account they were signed in to was deleted, so they
 * can clear their copy and show the notice (FR-009). It answers one
 * boolean about a random UUID and nothing else.
 */
import { AccountStatusQuerySchema } from "@thestats/app";
import { jsonError, logApiEvent } from "@/lib/api/handler";
import { accountExists } from "@/lib/account/account-status";

const HANDLER = "account-status";
const COMPONENT = "account-api";

function newRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}_${Math.random()}`;
}

function noStore(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request): Promise<Response> {
  const requestId = newRequestId();
  // The id asked about isn't logged as a user id: the caller isn't authenticated.
  const log = (outcome: string, status?: number) =>
    logApiEvent({
      component: COMPONENT,
      handler: HANDLER,
      request_id: requestId,
      user_id: null,
      outcome,
      status,
    });
  log("entry");

  const parsed = AccountStatusQuerySchema.safeParse({
    userId: new URL(request.url).searchParams.get("userId") ?? undefined,
  });
  if (!parsed.success) {
    log("invalid_query_params", 400);
    return noStore(jsonError("invalid_query_params", "userId must be a UUID."));
  }

  const exists = await accountExists(parsed.data.userId);
  if (exists === null) {
    log("internal_error", 500);
    return noStore(jsonError("internal_error", "Something went wrong."));
  }

  log(exists ? "exists" : "missing", 200);
  return noStore(Response.json({ exists }));
}
