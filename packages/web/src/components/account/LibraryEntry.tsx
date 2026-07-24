"use client";

/**
 * A single library row (feature 009-account-library, US2 + US3).
 *
 * US3 adds a "Continue" button for in-progress games. On click the row
 * fetches `GET /api/games/[id]` to pull the full record, feeds it to
 * `store.hydrateFromLibrary()`, and navigates to `/`. FR-017 requires
 * that we never silently clobber an in-progress local game — if the
 * store rejects the hydrate with `local_game_present`, we surface a
 * confirmation dialog and only re-hydrate with `force: true` on user
 * confirmation.
 *
 * Review / Delete actions land in US4 (T069).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LibraryEntry as Entry, SavedGameRecord } from "@/lib/games/types";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useGameStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export interface LibraryEntryProps {
  entry: Entry;
}

function formatStartedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function LibraryEntry({ entry }: LibraryEntryProps) {
  const isFinished = entry.status === "finished";
  const router = useRouter();
  const hydrate = useGameStore((s) => s.hydrateFromLibrary);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmForce, setConfirmForce] = useState<SavedGameRecord | null>(null);

  async function loadAndHydrate(force = false): Promise<void> {
    setError(null);
    const res = await fetch(`/api/games/${entry.id}`);
    if (!res.ok) {
      setError("Couldn't load the game. Please try again.");
      return;
    }
    const parsed = (await res.json()) as { game: SavedGameRecord };
    const result = hydrate(parsed.game.state, { force });
    if (!result.ok) {
      // FR-017: the store refused because there is an in-progress local
      // game. Surface the confirmation dialog.
      setConfirmForce(parsed.game);
      return;
    }
    router.push("/");
  }

  function handleContinue(): void {
    startTransition(() => {
      void loadAndHydrate(false);
    });
  }

  function handleConfirmForce(): void {
    if (!confirmForce) return;
    const record = confirmForce;
    setConfirmForce(null);
    const result = hydrate(record.state, { force: true });
    if (result.ok) router.push("/");
  }

  return (
    <li className="panel px-4 py-3 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-ink font-medium truncate">{entry.homeTeamName}</span>
          <span className="text-ink-dim text-sm">vs</span>
          <span className="text-ink font-medium truncate">{entry.awayTeamName}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-dim mt-1">
          <time dateTime={entry.startedAt}>{formatStartedAt(entry.startedAt)}</time>
          <span aria-hidden="true">·</span>
          <span
            className={cn(
              "px-1.5 py-0.5 uppercase tracking-wider text-[10px] font-mono",
              isFinished
                ? "bg-surface-hover text-ink"
                : "bg-accent/15 text-accent",
            )}
          >
            {isFinished ? "Final" : "In progress"}
          </span>
        </div>
        {error ? <p className="text-xs text-danger mt-1">{error}</p> : null}
      </div>
      <div className="flex items-center gap-2 shrink-0 font-mono">
        <span className="text-lg text-ink">{entry.homeScore}</span>
        <span className="text-ink-dim">-</span>
        <span className="text-lg text-ink">{entry.awayScore}</span>
      </div>
      {!isFinished ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={handleContinue}
        >
          {pending ? "Loading…" : "Continue"}
        </Button>
      ) : null}

      <Modal
        open={confirmForce !== null}
        onClose={() => setConfirmForce(null)}
        title="Replace your in-progress game?"
        size="sm"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmForce(null)}
            >
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleConfirmForce}>
              Replace
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink">
          You already have a game in progress on this device. Opening this
          one from your library will replace it. This can&rsquo;t be undone.
        </p>
      </Modal>
    </li>
  );
}
