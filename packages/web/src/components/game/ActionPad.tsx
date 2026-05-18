"use client";

import { useGameStore } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface ActionPadProps {
  onEndPeriod: () => void;
  onStartNextPeriod: () => void;
}

/**
 * Returns the period-appropriate label for the "advance to next period"
 * button shown during a between-period break. Halftime falls between
 * adjacent regulation periods that straddle the half boundary, derived
 * from `settings.periods` (e.g., between periods 2 and 3 for a 4-period
 * game).
 */
function nextPeriodLabel(currentPeriod: number, periods: number): string {
  if (currentPeriod >= periods) return "Start Overtime";
  if (periods % 2 === 0 && currentPeriod === periods / 2) {
    return "Start Second Half";
  }
  return "Start Next Quarter";
}

/**
 * Central control column that sits between the two team panels.
 *
 * Responsibilities:
 *   - Start / stop the game clock
 *   - Trigger period transitions
 *   - End an in-progress timeout
 *   - Undo last action
 *   - Prompt the scorekeeper to select a player
 *
 * During a timeout or between-period break, the secondary controls
 * (Undo / End Period) are hidden so the scorekeeper sees only the
 * single primary action button appropriate to the current break state.
 */
export function ActionPad({ onEndPeriod, onStartNextPeriod }: ActionPadProps) {
  const status = useGameStore((s) => s.status);
  const clockRunning = useGameStore((s) => s.clockRunning);
  const clockSeconds = useGameStore((s) => s.clockSeconds);
  const currentPeriod = useGameStore((s) => s.currentPeriod);
  const settings = useGameStore((s) => s.settings);
  const startClock = useGameStore((s) => s.startClock);
  const stopClock = useGameStore((s) => s.stopClock);
  const startGame = useGameStore((s) => s.startGame);
  const endTimeout = useGameStore((s) => s.endTimeout);
  const undo = useGameStore((s) => s.undoLastEvent);
  const hasEvents = useGameStore((s) => s.events.length > 0);

  const inBreak = status === "timeout" || status === "period-break";

  const renderClockCTA = () => {
    if (status === "ready") {
      return (
        <Button size="xl" variant="primary" fullWidth onClick={startGame}>
          Tip Off
        </Button>
      );
    }

    if (status === "timeout") {
      return (
        <Button size="xl" variant="primary" fullWidth onClick={endTimeout}>
          End Timeout
        </Button>
      );
    }

    if (status === "period-break") {
      return (
        <Button size="xl" variant="primary" fullWidth onClick={onStartNextPeriod}>
          {nextPeriodLabel(currentPeriod, settings.periods)}
        </Button>
      );
    }

    if (status === "finished") {
      return (
        <div className="panel-raised w-full h-16 flex items-center justify-center">
          <span className="heading-display text-2xl text-accent">Final</span>
        </div>
      );
    }

    if (clockSeconds === 0) {
      return (
        <Button size="xl" variant="danger" fullWidth onClick={onEndPeriod}>
          End Period
        </Button>
      );
    }

    return (
      <Button
        size="xl"
        variant={clockRunning ? "secondary" : "primary"}
        fullWidth
        onClick={clockRunning ? stopClock : startClock}
        className={cn(clockRunning && "animate-pulse-ring")}
      >
        {clockRunning ? "Stop Clock" : "Start Clock"}
      </Button>
    );
  };

  return (
    <section className="panel flex flex-col gap-3 p-3">
      {renderClockCTA()}

      {/* Secondary controls hidden during timeouts and breaks so the
          scorekeeper sees a single contextual action button. */}
      {!inBreak ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="ghost"
            onClick={undo}
            disabled={!hasEvents}
            className="border border-surface-border"
          >
            ← Undo
          </Button>
          <Button
            variant="ghost"
            onClick={onEndPeriod}
            disabled={status !== "live"}
            className="border border-surface-border"
          >
            End Period
          </Button>
        </div>
      ) : null}

      {/* Hint text so the scorekeeper always knows the next step */}
      <p className="text-xs text-ink-dim font-mono leading-relaxed text-center px-2 mt-1">
        {status === "setup" && "Finalise setup to start."}
        {status === "ready" && "Tap ‘Tip Off’ when ready."}
        {status === "live" && "Tap a player, then pick an action."}
        {status === "timeout" && "Timeout — tap End Timeout to resume."}
        {status === "period-break" && "Break — review and continue."}
        {status === "finished" && "Game complete. Review scoresheet & stats."}
      </p>
    </section>
  );
}
