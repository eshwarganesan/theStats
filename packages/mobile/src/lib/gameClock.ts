import { writeClockCheckpoint, type GameState } from "@thestats/app";
import { useEffect } from "react";
import { AppState } from "react-native";

import { deviceStorage } from "@/lib/storage";
import { useGameStore } from "@/lib/store";

/** How often the running clock advances. Plenty for a tenths display. */
export const CLOCK_TICK_MS = 50;

/**
 * Whether the game clock or a timeout / period-break countdown is
 * running. A break that has already counted down to zero isn't.
 */
export function isClockCounting(
  s: Pick<GameState, "clockRunning" | "status" | "breakSeconds">,
): boolean {
  if (s.clockRunning) return true;
  return (s.status === "timeout" || s.status === "period-break") && s.breakSeconds > 0;
}

/**
 * Drives the game clock: while it (or a break countdown) is running,
 * feeds the elapsed time to the store's `tickClock`, like web's
 * `useGameClock`. Two differences for iOS:
 *   - elapsed time comes from `Date.now()`, so when the app returns from
 *     the background (frames and timers stop there, the game doesn't) the
 *     next tick catches the clock up;
 *   - it ticks every CLOCK_TICK_MS instead of every frame, since each tick
 *     re-saves the game and a ProMotion iPad draws 120 frames a second.
 *
 * Mount once for the whole app, so the clock keeps running on every
 * screen.
 */
export function useGameClock(): void {
  const counting = useGameStore(isClockCounting);
  const tick = useGameStore((s) => s.tickClock);

  useEffect(() => {
    if (!counting) return;
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      tick(now - last);
      last = now;
    }, CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, [counting, tick]);
}

function writeCheckpoint(): void {
  const { clockSeconds, breakSeconds } = useGameStore.getState();
  writeClockCheckpoint(deviceStorage, {
    schemaVersion: 1,
    clockSeconds,
    breakSeconds,
    savedAt: Date.now(),
  });
}

/**
 * Keeps the clock checkpoint current, so a relaunch after iOS ends the
 * app restores the clock (paused) where it was, as a refresh does on
 * web. Writes once a second while the clock is counting, when it stops,
 * and whenever the app leaves the foreground.
 */
export function useClockCheckpoint(): void {
  const counting = useGameStore(isClockCounting);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") writeCheckpoint();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!counting) return;
    writeCheckpoint();
    const id = setInterval(writeCheckpoint, 1_000);
    return () => {
      clearInterval(id);
      writeCheckpoint();
    };
  }, [counting]);
}
