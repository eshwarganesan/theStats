"use client";

import { useGameStore } from "@/lib/store";
import { cn, formatClock } from "@/lib/utils";

/**
 * Pure clock display. Subscribes to clock state and renders the styled
 * formatted time — no editing, no nudges, no mutation. Composition with
 * editing/nudge surfaces happens in `ClockPanel`.
 */
export function GameClock() {
  const clockSeconds = useGameStore((s) => s.clockSeconds);
  const clockRunning = useGameStore((s) => s.clockRunning);
  const status = useGameStore((s) => s.status);
  const breakSeconds = useGameStore((s) => s.breakSeconds);

  // During a timeout or between-period break, the clock area shows the
  // break countdown instead of the live game clock. Live game time is
  // preserved in `clockSeconds` and resumes when the break ends.
  const displaySeconds =
    status === "timeout" || status === "period-break" ? breakSeconds : clockSeconds;

  const critical =
    displaySeconds < 60 && displaySeconds > 0 && status === "live";

  return (
    <span
      className={cn(
        "font-display text-clock tabular leading-none",
        clockRunning ? "text-ink" : "text-ink-muted",
        critical && "text-accent",
      )}
      aria-live="off"
    >
      {formatClock(displaySeconds)}
    </span>
  );
}
