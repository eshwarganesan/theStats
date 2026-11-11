import type { AccountNoticeKind } from "@thestats/app";
import { useSyncExternalStore } from "react";

import { forgetDeviceGame } from "@/lib/gameSync";
import { getSupabase } from "@/lib/supabase";

/**
 * What the app does once its account is gone (feature 018-account-deletion,
 * research R11): deleted from this device, or found deleted elsewhere.
 * It forgets the device's game, sets the notice the sign-in screen shows,
 * and signs out locally, which makes the auth wall show sign-in.
 */

// ─── Notice ─────────────────────────────────────────────────────────────

let notice: AccountNoticeKind | null = null;
const listeners = new Set<() => void>();

function setNotice(next: AccountNoticeKind | null): void {
  if (notice === next) return;
  notice = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The notice for the sign-in screen, outside React. */
export function getAccountNotice(): AccountNoticeKind | null {
  return notice;
}

/** The notice for the sign-in screen; re-renders when it changes. */
export function useAccountNotice(): AccountNoticeKind | null {
  return useSyncExternalStore(subscribe, getAccountNotice, getAccountNotice);
}

export function clearAccountNotice(): void {
  setNotice(null);
}

// ─── Own deletion ───────────────────────────────────────────────────────

let ownDeletionInProgress = false;

/**
 * Set while this device's own delete request is in flight, so a sync
 * request that finds the account gone can't swap in the other notice.
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

// ─── Cleanup ────────────────────────────────────────────────────────────

let handled = false;

/** A session was applied: a later loss of the account is news again. */
export function onSignedIn(): void {
  handled = false;
  clearAccountNotice();
}

/**
 * Runs once per signed-in session. The notice is set before signing out,
 * so the sign-in screen has it when the auth wall brings it up. Local
 * scope: the server already ended every session, so a global sign-out
 * would only fail.
 */
export async function handleAccountGone(kind: AccountNoticeKind): Promise<void> {
  if (handled) return;
  if (kind === "deleted-elsewhere" && ownDeletionInProgress) return;
  handled = true;
  forgetDeviceGame();
  setNotice(kind);
  try {
    await getSupabase().auth.signOut({ scope: "local" });
  } catch {
    // The keychain session may already be gone; the notice still stands.
  }
}
