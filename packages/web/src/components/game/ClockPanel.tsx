"use client";

import { useGameStore } from "@/lib/store";
import { ClockEditor } from "./ClockEditor";
import { ClockNudge } from "./ClockNudge";
import { GameClock } from "./GameClock";

/**
 * Container for the clock surface. Renders the read-only `GameClock`
 * unless the game is live and paused, in which case it surfaces the
 * `ClockEditor` (tap-to-edit) and `ClockNudge` (±1s) controls. During a
 * timeout or between-period break the countdown is read-only — the
 * only path to leave the break early is the ActionPad's primary button
 * (per spec FR-014, revised 2026-05-18).
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
