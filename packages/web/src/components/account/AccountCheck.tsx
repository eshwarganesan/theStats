"use client";

/**
 * On the signed-out pages (`/` and `/login`): if this browser remembers an
 * account, ask whether it still exists (feature 018-account-deletion,
 * research R6). That covers a browser whose session expired before it
 * could hear the account was deleted. Renders nothing.
 *
 * Kept light for public bundles: no game store and no Supabase, just
 * `fetch` and localStorage.
 */
import { useEffect } from "react";
import { fetchAccountExists } from "@/lib/account/device-account";
import { forgetRememberedAccount, readRememberedAccount } from "@/lib/persistence";

export function AccountCheck() {
  useEffect(() => {
    // The notice page handles its own clean-up (AccountNotice).
    if (new URLSearchParams(window.location.search).has("account")) return;
    const userId = readRememberedAccount();
    if (!userId) return;

    let active = true;
    void fetchAccountExists(userId).then((exists) => {
      if (!active || exists === null) return; // can't tell: ask on the next visit
      forgetRememberedAccount();
      if (!exists) window.location.replace("/?account=deleted-elsewhere");
    });
    return () => {
      active = false;
    };
  }, []);

  return null;
}
