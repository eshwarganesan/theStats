"use client";

import { useEffect, useRef, useState } from "react";
import { useGameStore } from "@/lib/store";
import { cn, formatClock, parseClock } from "@/lib/utils";

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
 * Owns the clock surface: always renders the styled formatted time and,
 * when the game is live and the clock is paused, layers in a tap-to-edit
 * mm:ss editor. Nudge controls (US2) are added on top of this in T012.
 */
export function ClockAdjuster() {
  const clockSeconds = useGameStore((s) => s.clockSeconds);
  const clockRunning = useGameStore((s) => s.clockRunning);
  const status = useGameStore((s) => s.status);
  const settings = useGameStore((s) => s.settings);
  const currentPeriod = useGameStore((s) => s.currentPeriod);
  const adjustClock = useGameStore((s) => s.adjustClock);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const editable = status === "live" && !clockRunning;
  const critical = clockSeconds < 60 && clockSeconds > 0 && status === "live";
  const periodMax =
    currentPeriod > settings.periods ? settings.overtimeSeconds : settings.periodSeconds;

  // If the editable surface gates off mid-edit (game ends, clock starts),
  // drop any in-flight draft so we don't leak stale state into the next
  // pause.
  useEffect(() => {
    if (!editable && editing) {
      setEditing(false);
    }
  }, [editable, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const display = (
    <span
      className={cn(
        "font-mono text-clock tabular leading-none",
        clockRunning ? "text-ink" : "text-ink-muted",
        critical && "text-accent",
      )}
      aria-live="off"
    >
      {formatClock(clockSeconds)}
    </span>
  );

  if (!editable) return display;

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
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        aria-label="Adjust clock time"
        onClick={() => {
          setDraft(formatMmSs(clockSeconds));
          setEditing(true);
        }}
        className="cursor-pointer bg-transparent border-0 p-0"
      >
        {display}
      </button>
      <span className="inline-flex flex-col gap-1">
        <button
          type="button"
          aria-label="+1s"
          onClick={() => adjustClock(useGameStore.getState().clockSeconds + 1)}
          disabled={clockSeconds >= periodMax}
          className={cn(
            "px-2 py-1 rounded border border-ink-muted text-sm font-medium",
            "hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed",
          )}
        >
          ▲
        </button>
        <button
          type="button"
          aria-label="-1s"
          onClick={() => adjustClock(useGameStore.getState().clockSeconds - 1)}
          disabled={clockSeconds <= 0}
          className={cn(
            "px-2 py-1 rounded border border-ink-muted text-sm font-medium",
            "hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed",
          )}
        >
          ▼
        </button>
      </span>
    </span>
  );
}
