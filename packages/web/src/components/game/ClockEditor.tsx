"use client";

import { useEffect, useRef, useState } from "react";
import { useGameStore } from "@/lib/store";
import { cn, parseClock } from "@/lib/utils";
import { GameClock } from "./GameClock";

/**
 * The editor's pre-fill always uses mm:ss so a sub-60 clock value
 * (which `formatClock` would render as `SS.T`) still gets an editable
 * `00:SS` representation.
 */
function formatMmSs(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Tap-to-edit overlay for the clock. Renders the styled time wrapped in
 * a button trigger; when tapped, swaps to an mm:ss input that commits on
 * Enter or blur and discards on Escape. Should only be mounted when the
 * clock is editable — the parent (`ClockPanel`) owns that gating, so
 * unmounting cleanly discards any in-flight draft.
 */
export function ClockEditor() {
  const clockSeconds = useGameStore((s) => s.clockSeconds);
  const adjustClock = useGameStore((s) => s.adjustClock);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (editing) {
    const commit = () => {
      const parsed = parseClock(draft);
      if (parsed !== null) adjustClock(parsed);
      setEditing(false);
    };

    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9:]*"
        maxLength={5}
        value={draft}
        aria-label="Clock time, minutes and seconds"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
        onBlur={commit}
        className={cn(
          "font-mono text-clock tabular leading-none bg-transparent",
          "outline-none border-b border-ink-muted focus:border-ink",
          "w-[5ch] text-center text-ink",
        )}
      />
    );
  }

  return (
    <button
      type="button"
      aria-label="Adjust clock time"
      onClick={() => {
        setDraft(formatMmSs(clockSeconds));
        setEditing(true);
      }}
      className="cursor-pointer bg-transparent border-0 p-0"
    >
      <GameClock />
    </button>
  );
}
