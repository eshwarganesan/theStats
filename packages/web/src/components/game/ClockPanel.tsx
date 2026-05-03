"use client";

import { useGameStore } from "@/lib/store";
import { ClockEditor } from "./ClockEditor";
import { ClockNudge } from "./ClockNudge";
import { GameClock } from "./GameClock";

/**
 * Container for the clock surface. Renders the read-only `GameClock`
 * unless the game is live and paused, in which case it surfaces the
 * `ClockEditor` (tap-to-edit) and `ClockNudge` (±1s) controls.
 */
export function ClockPanel() {
  const clockRunning = useGameStore((s) => s.clockRunning);
  const status = useGameStore((s) => s.status);

  const editable = status === "live" && !clockRunning;

  if (!editable) return <GameClock />;

  return (
    <span className="inline-flex items-center gap-2">
      <ClockNudge stepSeconds={60} unitLabel="m" />
      <ClockEditor />
      <ClockNudge stepSeconds={1} unitLabel="s" />
    </span>
  );
}
