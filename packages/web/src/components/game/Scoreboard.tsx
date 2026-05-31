"use client";

import { useMemo } from "react";
import { useGameStore } from "@/lib/store";
import { computeStats } from "@thestats/core";
import { formatPeriod } from "@thestats/core";
import { cn } from "@/lib/utils";
import { ClockPanel } from "./ClockPanel";

export function Scoreboard() {
  const homeTeam = useGameStore((s) => s.homeTeam);
  const awayTeam = useGameStore((s) => s.awayTeam);
  const settings = useGameStore((s) => s.settings);
  const events = useGameStore((s) => s.events);
  const currentPeriod = useGameStore((s) => s.currentPeriod);
  const possession = useGameStore((s) => s.possession);
  const status = useGameStore((s) => s.status);

  // Derive team totals from events. Memoised so we don't recompute on
  // every clock tick — only when the event list or period changes.
  const stats = useMemo(
    () => computeStats(events, homeTeam, awayTeam, settings, currentPeriod),
    [events, homeTeam, awayTeam, settings, currentPeriod],
  );

  return (
    <div className="panel grid grid-cols-[1fr,auto,1fr] items-stretch">
      <TeamScore
        side="home"
        name={homeTeam.name}
        tag={homeTeam.tag}
        color={homeTeam.color}
        score={stats.home.points}
        timeouts={stats.home.timeoutsRemaining}
        hasPossession={possession === "home"}
        inBonus={stats.home.fouls >= settings.bonusFoulThreshold}
      />

      {/* Centre: clock and period */}
      <div className="flex flex-col items-center justify-center px-6 md:px-8 py-4 border-x border-surface-border min-w-[180px] md:min-w-[220px]">
        <span className="label-eyebrow mb-1">
          {status === "finished"
            ? "Final"
            : status === "period-break"
              ? "Break"
              : formatPeriod(currentPeriod, settings.periods)}
        </span>
        <ClockPanel />
      </div>

      <TeamScore
        side="away"
        name={awayTeam.name}
        tag={awayTeam.tag}
        color={awayTeam.color}
        score={stats.away.points}
        timeouts={stats.away.timeoutsRemaining}
        hasPossession={possession === "away"}
        inBonus={stats.away.fouls >= settings.bonusFoulThreshold}
        reversed
      />
    </div>
  );
}

// ─── Internals ────────────────────────────────────────────────────────────

interface TeamScoreProps {
  side: "home" | "away";
  name: string;
  tag: string;
  color: string;
  score: number;
  timeouts: number;
  hasPossession: boolean;
  inBonus: boolean;
  reversed?: boolean;
}

function TeamScore({
  name,
  tag,
  color,
  score,
  timeouts,
  hasPossession,
  inBonus,
  reversed,
}: TeamScoreProps) {
  return (
    <div
      className={cn(
        "px-5 md:px-7 py-4 flex items-center gap-5 md:gap-7 min-w-0",
        reversed && "flex-row-reverse",
      )}
      style={{
        background: `linear-gradient(${reversed ? "270deg" : "90deg"}, ${color}11, transparent)`,
      }}
    >
      {/* Team identity */}
      <div className={cn("min-w-0 flex flex-col", reversed && "items-end text-right")}>
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2"
            style={{ background: color }}
            aria-hidden
          />
          <span className="label-eyebrow">{tag || (reversed ? "AWY" : "HME")}</span>
          {hasPossession ? (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse"
              aria-label="In possession"
            />
          ) : null}
        </div>
        <h2 className="heading-display text-base md:text-xl truncate max-w-[180px] md:max-w-[260px]">
          {name}
        </h2>
        <div className="flex items-center gap-3 mt-1 text-[0.65rem] font-mono text-ink-muted uppercase tracking-wider">
          <span>TO {timeouts}</span>
          {inBonus ? <span className="text-accent">BONUS</span> : null}
        </div>
      </div>

      {/* Score */}
      <div
        className={cn(
          "font-display text-score-lg leading-none tabular",
          reversed ? "mr-auto" : "ml-auto",
        )}
      >
        {score}
      </div>
    </div>
  );
}
