"use client";

/**
 * Watches for this browser's account disappearing (feature
 * 018-account-deletion). Mounted once in the signed-in layout; renders
 * nothing.
 *
 *   - Other tabs: when one tab finds the account gone it posts the notice
 *     kind on `ACCOUNT_CHANNEL`, and every other signed-in tab runs the
 *     same cleanup. A tab left on the live game page would otherwise
 *     write the deleted account's game back to localStorage (FR-008).
 *   - This tab's session: while signed in, it remembers the account, so a
 *     browser whose session later expires can still ask about it
 *     (`AccountCheck`). When this tab is signed out without having asked
 *     to be (a refresh that failed), it asks whether the account still
 *     exists, and cleans up if it doesn't (FR-009, research R6).
 */
import { useEffect } from "react";
import { parseAccountNoticeKind } from "@thestats/app";
import { handleAccountGone } from "@/lib/account/account-gone";
import {
  ACCOUNT_CHANNEL,
  fetchAccountExists,
  isOwnDeletionInProgress,
} from "@/lib/account/device-account";
import { readRememberedAccount, rememberAccount } from "@/lib/persistence";
import { createBrowserClient } from "@/lib/supabase/client";

async function checkRememberedAccount(): Promise<void> {
  // This browser's own deletion ends on its own notice.
  if (isOwnDeletionInProgress()) return;
  const userId = readRememberedAccount();
  if (!userId) return;
  if ((await fetchAccountExists(userId)) === false) handleAccountGone("deleted-elsewhere");
}

export function AccountWatcher() {
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(ACCOUNT_CHANNEL);
    channel.onmessage = (event: MessageEvent) => {
      const kind = parseAccountNoticeKind(event.data);
      if (kind) handleAccountGone(kind, { fromBroadcast: true });
    };
    return () => channel.close();
  }, []);

  useEffect(() => {
    const client = createBrowserClient();
    let active = true;
    void client.auth.getSession().then(({ data }) => {
      if (active && data.session) rememberAccount(data.session.user.id);
    });
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (session) {
        rememberAccount(session.user.id);
      } else if (event === "SIGNED_OUT") {
        void checkRememberedAccount();
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return null;
}
