"use client";

import { useEffect } from "react";

import { writeClockCheckpoint } from "@/lib/persistence";
import { useGameStore } from "@/lib/store";

/**
 * Writes the live clock value to a `localStorage` checkpoint so a
 * refresh restores within ≤1 s of the value the clock showed at the
 * moment of refresh (FR-005/FR-006/SC-002, Q1 clarification).
 *
 * Cadence:
 *   - While `clockRunning` is true OR status is `timeout`/`period-break`,
 *     write the current `{ clockSeconds, breakSeconds, savedAt }` once
 *     per second.
 *   - On `pagehide` and on `visibilitychange: hidden`, write
 *     synchronously regardless of the interval timing.
 *
 * The hook deliberately uses `setInterval` rather than the existing
 * `requestAnimationFrame` clock loop: rAF runs at ~60 Hz, and writing
 * to localStorage at that rate would regress Principle IV's 100 ms
 * action-to-UI budget once event history grows. 1 Hz keeps writes
 * cheap and is well within the ≤1 s drift target.
 */
export function useClockCheckpoint(): void {
  const clockRunning = useGameStore((s) => s.clockRunning);
  const status = useGameStore((s) => s.status);

  const isCounting =
    clockRunning || status === "timeout" || status === "period-break";

  useEffect(() => {
    if (!isCounting) return;

    const writeNow = () => {
      const { clockSeconds, breakSeconds } = useGameStore.getState();
      writeClockCheckpoint({
        schemaVersion: 1,
        clockSeconds,
        breakSeconds,
        savedAt: Date.now(),
      });
    };

    // Take a first sample immediately so a refresh in the first second
    // still has a fresh checkpoint to read.
    writeNow();
    const intervalId = window.setInterval(writeNow, 1000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") writeNow();
    };
    const onPageHide = () => {
      writeNow();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [isCounting]);
}
