"use client";

import { ClockAdjuster } from "./ClockAdjuster";

/**
 * Compact clock display. Delegates to `ClockAdjuster` which owns the
 * styled formatted time and, when the game is live and the clock is
 * paused, layers in tap-to-edit and nudge controls. The play/stop button
 * is not included here — it lives in the main `ActionPad` so the
 * scoreboard can stay informational.
 */
export function GameClock() {
  return <ClockAdjuster />;
}
