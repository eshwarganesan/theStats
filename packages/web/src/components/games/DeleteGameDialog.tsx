"use client";

/**
 * Confirmation dialog for deleting a saved game (feature 009-account-library,
 * US4 / FR-025).
 *
 * Two variants that share the same shell:
 *   - **finished game**: generic destructive confirmation.
 *   - **in-progress game**: warning names the event count and the
 *     current period so the user cannot delete a live-scoring session
 *     without seeing what it contained.
 *
 * On confirm, calls `DELETE /api/games/[id]` and hands control back via
 * `onDeleted`. On cancel, closes without a network call.
 */

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { LibraryEntry } from "@/lib/games/types";

export interface DeleteGameDialogProps {
  entry: LibraryEntry;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteGameDialog({
  entry,
  open,
  onClose,
  onDeleted,
}: DeleteGameDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isInProgress = entry.status === "in-progress";
  const title = isInProgress ? "Delete this in-progress game?" : "Delete this game?";

  async function handleDelete(): Promise<void> {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/games/${entry.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        throw new Error(`delete failed: ${res.status}`);
      }
      onDeleted();
    } catch {
      setError("Couldn't delete this game. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => void handleDelete()}
            disabled={pending}
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm text-ink">
        <p>
          <span className="font-medium">{entry.homeTeamName}</span>
          <span className="text-ink-dim"> vs </span>
          <span className="font-medium">{entry.awayTeamName}</span>
        </p>
        {isInProgress ? (
          <p className="text-ink-dim">
            You&rsquo;ll lose{" "}
            <span className="text-ink font-medium">
              {entry.eventCount} event{entry.eventCount === 1 ? "" : "s"}
            </span>{" "}
            recorded in Period {entry.currentPeriod}. This can&rsquo;t be undone.
          </p>
        ) : (
          <p className="text-ink-dim">
            This game&rsquo;s statsheet and play-by-play will be permanently
            removed from your account. This can&rsquo;t be undone.
          </p>
        )}
        {error ? <p className="text-danger">{error}</p> : null}
      </div>
    </Modal>
  );
}
