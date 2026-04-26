"use client";

import { useMemo } from "react";
import { useGameStore } from "@/lib/store";
import { computeStats } from "@/lib/stats";
import type { Side } from "@/lib/types";
import { FOUL_OUT_THRESHOLD } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface TeamPanelProps {
  side: Side;
  onPlayerTap: (playerId: string) => void;
  onSubstitutionClick: () => void;
  onTimeoutClick: () => void;
  selectedPlayerId: string | null;
}

export function TeamPanel({
  side,
  onPlayerTap,
  onSubstitutionClick,
  onTimeoutClick,
  selectedPlayerId,
}: TeamPanelProps) {
  const team = useGameStore((s) => (side === "home" ? s.homeTeam : s.awayTeam));
  const homeTeam = useGameStore((s) => s.homeTeam);
  const awayTeam = useGameStore((s) => s.awayTeam);
  const settings = useGameStore((s) => s.settings);
  const events = useGameStore((s) => s.events);
  const period = useGameStore((s) => s.currentPeriod);
  const onCourt = useGameStore((s) => s.onCourt[side]);

  const stats = useMemo(
    () => computeStats(events, homeTeam, awayTeam, settings, period),
    [events, homeTeam, awayTeam, settings, period],
  );

  const teamStats = stats[side];
  const foulOutAt = FOUL_OUT_THRESHOLD[settings.format];

  // Players currently on court, in the order they appear on `onCourt`
  const courtPlayers = onCourt
    .map((id) => team.roster.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const sideAccent =
    side === "home"
      ? "border-l-home"
      : "border-l-away";

  return (
    <section className={cn("panel flex flex-col border-l-2", sideAccent)}>
      <header className="h-12 px-4 flex items-center justify-between border-b border-surface-border">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="inline-block w-2 h-2 shrink-0"
            style={{ background: team.color }}
            aria-hidden
          />
          <h3 className="heading-display text-base truncate">{team.name}</h3>
        </div>
        <span className="label-eyebrow">
          Team fouls: <span className="text-ink font-mono">{teamStats.fouls}</span>
        </span>
      </header>

      {/* On-court grid */}
      <div className="grid grid-cols-3 md:grid-cols-5 gap-2 p-3 flex-1 content-start">
        {courtPlayers.map((player) => {
          const playerStats = teamStats.players.find((p) => p.playerId === player.id);
          const fouls = playerStats?.fouls ?? 0;
          const points = playerStats?.points ?? 0;
          const isSelected = selectedPlayerId === player.id;
          const warningFouls = fouls >= foulOutAt - 1;

          return (
            <button
              key={player.id}
              type="button"
              onClick={() => onPlayerTap(player.id)}
              className={cn(
                "relative aspect-square p-2 flex flex-col items-center justify-center",
                "bg-surface-raised border transition-all duration-150",
                "hover:border-accent hover:bg-surface-hover",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                isSelected
                  ? "border-accent shadow-accent-glow"
                  : "border-surface-border",
              )}
              aria-pressed={isSelected}
              aria-label={`${player.name}, number ${player.number}, ${points} points, ${fouls} fouls`}
            >
              <span className="font-display text-3xl leading-none tabular">
                {player.number}
              </span>
              <span className="text-[0.65rem] text-ink-muted uppercase mt-1 truncate w-full text-center font-mono">
                {player.name.split(" ").slice(-1)[0]}
              </span>
              {/* Points pip */}
              <span className="absolute top-1 left-1 text-[0.6rem] font-mono text-ink-dim tabular">
                {points} PT
              </span>
              {/* Fouls pips */}
              <span
                className={cn(
                  "absolute top-1 right-1 text-[0.6rem] font-mono tabular",
                  warningFouls ? "text-danger" : "text-ink-dim",
                )}
              >
                {fouls}F
              </span>
              {/* Captain tag */}
              {player.isCaptain ? (
                <span className="absolute bottom-1 right-1 text-[0.55rem] font-mono text-accent">
                  C
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Team-level controls */}
      <footer className="h-12 px-3 flex items-center gap-2 border-t border-surface-border">
        <button
          type="button"
          onClick={onSubstitutionClick}
          className="flex-1 h-8 text-xs font-mono uppercase tracking-wider text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors border border-surface-border"
        >
          Sub
        </button>
        <button
          type="button"
          onClick={onTimeoutClick}
          disabled={teamStats.timeoutsRemaining <= 0}
          className="flex-1 h-8 text-xs font-mono uppercase tracking-wider text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors border border-surface-border disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Timeout ({teamStats.timeoutsRemaining})
        </button>
      </footer>
    </section>
  );
}
