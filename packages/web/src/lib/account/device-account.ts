/**
 * What this browser holds for its account (feature 018-account-deletion).
 *
 * Runs on public pages too, so it must stay light: it never imports the
 * game store or Supabase, and reads replies with type guards rather than
 * Zod. Clearing reaches storage through `@/lib/persistence`, which owns
 * every localStorage call.
 */
import { parseAccountStatus } from "@thestats/app";
import { clearPersistedGame, forgetRememberedAccount } from "@/lib/persistence";

/** The tabs of one browser tell each other the account is gone on this channel. */
export const ACCOUNT_CHANNEL = "thestats.account";

/**
 * Removes everything the browser holds for the account: the game, its
 * clock checkpoint and the remembered account (FR-008).
 */
export function clearDeviceGameData(): void {
  clearPersistedGame();
  forgetRememberedAccount();
}

let ownDeletionInProgress = false;

/**
 * Set while this browser's own delete request is in flight, so the
 * "deleted elsewhere" signals it triggers can't race the "deleted" notice.
 */
export function beginOwnDeletion(): void {
  ownDeletionInProgress = true;
}

export function endOwnDeletion(): void {
  ownDeletionInProgress = false;
}

export function isOwnDeletionInProgress(): boolean {
  return ownDeletionInProgress;
}

/**
 * Asks GET /api/account/status whether `userId` still has an account
 * (research R6). Null when it can't tell: offline, a server error or an
 * unexpected reply. Callers keep what they have and ask again later.
 */
export async function fetchAccountExists(userId: string): Promise<boolean | null> {
  let response: Response;
  try {
    response = await fetch(`/api/account/status?userId=${encodeURIComponent(userId)}`, {
      cache: "no-store",
    });
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
