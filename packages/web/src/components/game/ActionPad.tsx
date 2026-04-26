"use client";

import { useGameStore } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface ActionPadProps {
  onEndPeriod: () => void;
  onStartNextPeriod: () => void;
}

/**
 * Central control column that sits between the two team panels.
 *
 * Responsibilities:
 *   - Start / stop the game clock
 *   - Trigger period transitions
 *   - Undo last action
 *   - Prompt the scorekeeper to select a player
 */
export function ActionPad({ onEndPeriod, onStartNextPeriod }: ActionPadProps) {
  const status = useGameStore((s) => s.status);
  const clockRunning = useGameStore((s) => s.clockRunning);
  const clockSeconds = useGameStore((s) => s.clockSeconds);
  const startClock = useGameStore((s) => s.startClock);
  const stopClock = useGameStore((s) => s.stopClock);
  const startGame = useGameStore((s) => s.startGame);
  const undo = useGameStore((s) => s.undoLastEvent);
  const hasEvents = useGameStore((s) => s.events.length > 0);

  const renderClockCTA = () => {
    if (status === "ready") {
      return (
        <Button size="xl" variant="primary" fullWidth onClick={startGame}>
          Tip Off
        </Button>
      );
    }

    if (status === "period-break") {
      return (
        <Button size="xl" variant="primary" fullWidth onClick={onStartNextPeriod}>
          Start Next Period
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

      {/* Hint text so the scorekeeper always knows the next step */}
      <p className="text-xs text-ink-dim font-mono leading-relaxed text-center px-2 mt-1">
        {status === "setup" && "Finalise setup to start."}
        {status === "ready" && "Tap ‘Tip Off’ when ready."}
        {status === "live" && "Tap a player, then pick an action."}
        {status === "period-break" && "Break — review and continue."}
        {status === "finished" && "Game complete. Review scoresheet & stats."}
      </p>
    </section>
  );
}
