"use client";

/**
 * Manual "Save" affordance for the live game header. Saves already flow
 * through automatically (write-through, feature 009-account-library); this
 * button force-flushes the pending state immediately and surfaces the write
 * status so a signed-in scorer can confirm the game is persisted on demand.
 *
 * Hidden for anonymous sessions, whose games live in localStorage only.
 */

import { useState } from "react";
import { useWriteThrough } from "@/components/shell/WriteThroughMount";
import { cn } from "@/lib/utils";

export function SaveGameButton() {
  const writeThrough = useWriteThrough();
  const [busy, setBusy] = useState(false);

  // No session ⇒ nothing to persist to the backend.
  if (!writeThrough?.signedIn) return null;

  const { saveNow, status } = writeThrough;

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      await saveNow();
    } finally {
      setBusy(false);
    }
  }

  const label =
    busy || status === "saving"
      ? "Saving…"
      : status === "saved"
        ? "Saved ✓"
        : status === "error"
          ? "Retry save"
          : "Save";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy || status === "saving"}
      className={cn(
        "h-8 px-3 inline-flex items-center text-xs font-mono uppercase tracking-widest",
        "border transition-colors disabled:opacity-60",
        status === "error"
          ? "border-danger text-danger hover:bg-danger/10"
          : status === "saved"
            ? "border-accent text-accent"
            : "border-surface-border text-ink-muted hover:text-ink hover:border-ink",
      )}
    >
      {label}
    </button>
  );
}
