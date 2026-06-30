"use client";

import { useState } from "react";
import { useGameStore } from "@/lib/store";
import { TeamPanel } from "@/components/game/TeamPanel";
import { ActionPad } from "@/components/game/ActionPad";
import { GameLog } from "@/components/game/GameLog";
import { ActionModal } from "@/components/game/ActionModal";
import { SubstitutionModal } from "@/components/game/SubstitutionModal";
import type { Side } from "@thestats/core";

/**
 * Live scoring console.
 *
 * Layout follows a broadcast console idiom:
 *
 *   ┌──────────────┬──────────────┬──────────────┐
 *   │  Home Team   │  Action Pad  │  Away Team   │
 *   │              │              │              │
 *   ├──────────────┴──────────────┴──────────────┤
 *   │                Play-by-Play                │
 *   └────────────────────────────────────────────┘
 *
 * On mobile the columns stack and the log sits below.
 */
export default function LiveGamePage() {
  const endPeriod = useGameStore((s) => s.endPeriod);
  const startNextPeriod = useGameStore((s) => s.startNextPeriod);
  const recordTimeout = useGameStore((s) => s.recordTimeout);

  // Transient UI state: which player is selected for the action modal, and
  // which team is being substituted. `capturedClockAt` freezes the game clock
  // reading at the moment of tap, so the recorded event reflects when the
  // action happened — not when the user finished picking from the modal.
  const [selectedAction, setSelectedAction] = useState<{
    side: Side;
    playerId: string;
    capturedClockAt: number;
  } | null>(null);
  const [subSide, setSubSide] = useState<Side | null>(null);

  const handlePlayerTap = (side: Side) => (playerId: string) => {
    const capturedClockAt = useGameStore.getState().clockSeconds;
    setSelectedAction({ side, playerId, capturedClockAt });
  };

  return (
    <>
      <div className="h-full grid grid-cols-1 lg:grid-cols-[1fr,320px,1fr] gap-4 min-h-0">
        <div className="min-h-[300px]">
          <TeamPanel
            side="home"
            onPlayerTap={handlePlayerTap("home")}
            onSubstitutionClick={() => setSubSide("home")}
            onTimeoutClick={() => recordTimeout("home")}
            selectedPlayerId={
              selectedAction?.side === "home" ? selectedAction.playerId : null
            }
          />
        </div>

        <div className="lg:row-span-1">
          <ActionPad
            onEndPeriod={endPeriod}
            onStartNextPeriod={startNextPeriod}
          />
        </div>

        <div className="min-h-[300px]">
          <TeamPanel
            side="away"
            onPlayerTap={handlePlayerTap("away")}
            onSubstitutionClick={() => setSubSide("away")}
            onTimeoutClick={() => recordTimeout("away")}
            selectedPlayerId={
              selectedAction?.side === "away" ? selectedAction.playerId : null
            }
          />
        </div>

        {/* Game log — spans full width below the three columns */}
        <div className="lg:col-span-3 min-h-[200px] max-h-[320px]">
          <GameLog />
        </div>
      </div>

      <ActionModal
        open={selectedAction !== null}
        onClose={() => setSelectedAction(null)}
        side={selectedAction?.side ?? null}
        playerId={selectedAction?.playerId ?? null}
        capturedClockAt={selectedAction?.capturedClockAt ?? null}
      />

      <SubstitutionModal
        open={subSide !== null}
        onClose={() => setSubSide(null)}
        side={subSide}
      />
    </>
  );
}
