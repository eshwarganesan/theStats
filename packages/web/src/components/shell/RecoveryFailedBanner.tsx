"use client";

import { useStorageAvailability } from "@/lib/storageAvailability";

/**
 * Non-blocking dismissable banner surfaced when the persisted game
 * record could not be parsed on load (FR-008).
 */
export function RecoveryFailedBanner() {
  const { recoveryFailed, dismissRecoveryFailed } = useStorageAvailability();
  if (!recoveryFailed) return null;

  return (
    <div
      role="status"
      className="w-full bg-amber-500/10 border-b border-amber-500/30 text-amber-200 px-4 py-2 flex items-center justify-between gap-3 text-sm"
    >
      <span>Your previous game could not be recovered.</span>
      <button
        type="button"
        onClick={dismissRecoveryFailed}
        aria-label="Dismiss"
        className="text-xs uppercase tracking-widest text-amber-200/80 hover:text-amber-100"
      >
        Dismiss
      </button>
    </div>
  );
}
