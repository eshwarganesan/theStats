/**
 * The browser's call to POST /api/account/delete (feature
 * 018-account-deletion). The session cookie goes along automatically;
 * the reply maps to the outcome both clients share.
 */
import { toDeleteAccountOutcome, type DeleteAccountOutcome } from "@thestats/app";

export async function requestAccountDeletion(password: string): Promise<DeleteAccountOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
  } catch {
    // No reply, so we can't tell whether the request got through; a
    // retry settles it (401 account_deleted counts as deleted).
    return { kind: "offline" };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // 204, or a body that isn't JSON
  }
  return toDeleteAccountOutcome(response.status, body);
}
