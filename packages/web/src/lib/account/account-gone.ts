"use client";

/**
 * The browser's cleanup once its account is gone (feature
 * 018-account-deletion, research R9): deleted from this browser, or found
 * deleted from somewhere else.
 *
 * Signed-in pages only, because it resets the game store. Public pages
 * use `clearDeviceGameData` directly.
 */
import type { AccountNoticeKind } from "@thestats/app";
import { useGameStore } from "@/lib/store";
import {
  ACCOUNT_CHANNEL,
  clearDeviceGameData,
  isOwnDeletionInProgress,
} from "@/lib/account/device-account";

let handled = false;

/** Tells this browser's other tabs, so none writes the game back (FR-008). */
function tellOtherTabs(kind: AccountNoticeKind): void {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(ACCOUNT_CHANNEL);
    channel.postMessage(kind);
    channel.close();
  } catch {
    // best effort: other tabs fall back to the next request they make
  }
}

export interface AccountGoneOptions {
  /** True when another tab sent the news, so it isn't posted again. */
  fromBroadcast?: boolean;
}

/**
 * Resets the store, clears the browser's copy of the account's games,
 * tells the other tabs, and loads the landing page with the notice. The
 * full page load drops every in-memory controller and timer.
 */
export function handleAccountGone(kind: AccountNoticeKind, opts: AccountGoneOptions = {}): void {
  if (handled) return;
  // This browser's own deletion ends with "deleted"; a request it races
  // with mustn't swap in the other notice.
  if (kind === "deleted-elsewhere" && isOwnDeletionInProgress()) return;
  handled = true;
  useGameStore.getState().resetAll();
  clearDeviceGameData();
  if (!opts.fromBroadcast) tellOtherTabs(kind);
  window.location.assign(`/?account=${kind}`);
}
