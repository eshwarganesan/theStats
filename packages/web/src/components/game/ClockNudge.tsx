"use client";

import { useGameStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface ClockNudgeProps {
  /** Seconds added per +1 click (or subtracted per −1 click). */
  stepSeconds: number;
  /** Short unit shown in the button aria-labels. */
  unitLabel: "s" | "m";
}

/**
 * ±N nudge buttons stacked vertically (▲ on top, ▼ on bottom). DOM
 * order is decrement → increment so keyboard tab order reads naturally;
 * visual order is reversed via `flex-col-reverse`. Configurable step
 * supports both per-second and per-minute adjustments.
 */
export function ClockNudge({ stepSeconds, unitLabel }: ClockNudgeProps) {
  const clockSeconds = useGameStore((s) => s.clockSeconds);
  const breakSeconds = useGameStore((s) => s.breakSeconds);
  const status = useGameStore((s) => s.status);
  const settings = useGameStore((s) => s.settings);
  const currentPeriod = useGameStore((s) => s.currentPeriod);
  const adjustClock = useGameStore((s) => s.adjustClock);

  const isBreak = status === "timeout" || status === "period-break";

  // During a break the active countdown lives in `breakSeconds` and is
  // capped by a generous 30-minute ceiling (per research.md R-006). During
  // live play the active value is `clockSeconds` and the cap is the
  // per-period (or overtime) length.
  const activeSeconds = isBreak ? breakSeconds : clockSeconds;
  const activeMax = isBreak
    ? 30 * 60
    : currentPeriod > settings.periods
      ? settings.overtimeSeconds
      : settings.periodSeconds;

  const count = unitLabel === "m" ? stepSeconds / 60 : stepSeconds;

  return (
    <span className="inline-flex flex-col-reverse gap-1">
      <button
        type="button"
        aria-label={`−${count}${unitLabel}`}
        onClick={() => {
          const state = useGameStore.getState();
          const live =
            state.status === "timeout" || state.status === "period-break"
              ? state.breakSeconds
              : state.clockSeconds;
          adjustClock(live - stepSeconds);
        }}
        disabled={activeSeconds < stepSeconds}
        className={cn(
          "px-2 py-1 rounded border border-ink-muted text-sm font-medium",
          "hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed",
        )}
      >
        ▼
      </button>
      <button
        type="button"
        aria-label={`+${count}${unitLabel}`}
        onClick={() => {
          const state = useGameStore.getState();
          const live =
            state.status === "timeout" || state.status === "period-break"
              ? state.breakSeconds
              : state.clockSeconds;
          adjustClock(live + stepSeconds);
        }}
        disabled={activeSeconds + stepSeconds > activeMax}
        className={cn(
          "px-2 py-1 rounded border border-ink-muted text-sm font-medium",
          "hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed",
        )}
      >
        ▲
      </button>
    </span>
  );
}
