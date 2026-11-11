"use client";

/**
 * The landing page's notice that the account is gone (feature
 * 018-account-deletion, contracts/account-gone-signals.md §3).
 *
 * It also clears what the browser still holds for the account. Most paths
 * clear it before navigating here, but middleware's redirect can't reach
 * localStorage, and a tab that was closing may have written the game back.
 * The text never names the account (FR-018).
 */
import { useEffect, useState } from "react";
import { ACCOUNT_NOTICE_TEXT, type AccountNoticeKind } from "@thestats/app";
import { clearDeviceGameData } from "@/lib/account/device-account";

export interface AccountNoticeProps {
  kind: AccountNoticeKind;
}

export function AccountNotice({ kind }: AccountNoticeProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    clearDeviceGameData();
  }, []);

  if (dismissed) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-4 px-5 md:px-8 py-3 border-b border-surface-border bg-surface-raised text-sm text-ink"
    >
      <span>{ACCOUNT_NOTICE_TEXT[kind]}</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="w-8 h-8 shrink-0 flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors"
      >
        ✕
      </button>
    </div>
  );
}
