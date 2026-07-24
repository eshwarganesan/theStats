"use client";

/**
 * A single library row (feature 009-account-library, US2).
 *
 * US2 slice: renders row-summary only — team names, formatted date +
 * start time, status pill, score. Continue / Review / Delete actions
 * are added in US3 (T053) and US4 (T069) respectively; keeping this
 * component free of them here means US2 is independently valuable and
 * shippable.
 */

import type { LibraryEntry as Entry } from "@/lib/games/types";
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
      </div>
      <div className="flex items-center gap-2 shrink-0 font-mono">
        <span className="text-lg text-ink">{entry.homeScore}</span>
        <span className="text-ink-dim">-</span>
        <span className="text-lg text-ink">{entry.awayScore}</span>
      </div>
    </li>
  );
}
