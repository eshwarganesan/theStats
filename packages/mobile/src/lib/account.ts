import { parseAccountStatus, toDeleteAccountOutcome, type DeleteAccountOutcome } from "@thestats/app";

import { getEnv } from "@/env";
import { beginOwnDeletion, endOwnDeletion, handleAccountGone } from "@/lib/accountGone";
import { getSupabase } from "@/lib/supabase";

/**
 * Deletes the signed-in account (feature 018-account-deletion) with
 * POST /api/account/delete, the same endpoint the web uses.
 *
 * It sends the request itself rather than through `apiFetch`: a 401 here
 * isn't a stale token to refresh, and `account_deleted` means an earlier
 * attempt already went through (a retry after a lost reply), so it counts
 * as deleted rather than as news from elsewhere.
 */
export async function deleteAccount(password: string): Promise<DeleteAccountOutcome> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { kind: "signed-out" };

  beginOwnDeletion();
  try {
    let response: Response;
    try {
      response = await fetch(`${getEnv().apiUrl}/api/account/delete`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ password }),
      });
    } catch {
      return { kind: "offline" };
    }

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // 204, or a body that isn't JSON
    }
    const outcome = toDeleteAccountOutcome(response.status, body);
    if (outcome.kind === "deleted") await handleAccountGone("deleted");
    return outcome;
  } finally {
    endOwnDeletion();
  }
}

/**
 * Asks GET /api/account/status whether `userId` still has an account: how
 * a signed-out app finds out its last account was deleted (research R6).
 * No token is sent; there may be none left. Null when it can't tell.
 */
export async function checkAccountExists(userId: string): Promise<boolean | null> {
  let response: Response;
  try {
    response = await fetch(
      `${getEnv().apiUrl}/api/account/status?userId=${encodeURIComponent(userId)}`,
      { headers: { Accept: "application/json" } },
    );
  } catch {
    return null;
  }
  if (response.status !== 200) return null;
  try {
    return parseAccountStatus(await response.json())?.exists ?? null;
  } catch {
    return null;
  }
}
