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

  const critical = clockSeconds < 60 && clockSeconds > 0 && status === "live";

  return (
    <span
      className={cn(
        "font-display text-clock tabular leading-none",
        clockRunning ? "text-ink" : "text-ink-muted",
        critical && "text-accent",
      )}
      aria-live="off"
    >
      {formatClock(clockSeconds)}
    </span>
  );
}
