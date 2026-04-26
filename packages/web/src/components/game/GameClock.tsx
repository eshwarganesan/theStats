"use client";

import { useGameStore } from "@/lib/store";
import { formatClock, cn } from "@/lib/utils";

/**
 * Compact clock display. The play/stop button is not included here — it
 * lives in the main `ActionPad` so the scoreboard can stay informational.
 */
export function GameClock() {
  const clockSeconds = useGameStore((s) => s.clockSeconds);
  const clockRunning = useGameStore((s) => s.clockRunning);
  const status = useGameStore((s) => s.status);

  const critical = clockSeconds < 60 && clockSeconds > 0 && status === "live";

  return (
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
}
