"use client";

import { useMemo } from "react";
import { useGameStore } from "@/lib/store";
import { computeStats } from "@/lib/stats";
import type { PlayerStats, Team } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Box-score view. Statistics are a pure function of the event log, so
 * no side effects are needed here — we just render what `computeStats`
 * returns for the current period.
 */
export default function StatsPage() {
  const homeTeam = useGameStore((s) => s.homeTeam);
  const awayTeam = useGameStore((s) => s.awayTeam);
  const settings = useGameStore((s) => s.settings);
  const events = useGameStore((s) => s.events);
  const period = useGameStore((s) => s.currentPeriod);

  const stats = useMemo(
    () => computeStats(events, homeTeam, awayTeam, settings, period),
    [events, homeTeam, awayTeam, settings, period],
  );

  return (
    <div className="grid lg:grid-cols-2 gap-4 h-full">
      <TeamBoxScore team={homeTeam} stats={stats.home.players} totals={stats.home} />
      <TeamBoxScore team={awayTeam} stats={stats.away.players} totals={stats.away} />
    </div>
  );
}

interface TeamBoxScoreProps {
  team: Team;
  stats: PlayerStats[];
  totals: ReturnType<typeof computeStats>["home"];
}

function TeamBoxScore({ team, stats, totals }: TeamBoxScoreProps) {
  // Team totals aggregated from player rows
  const totalsRow = stats.reduce(
    (acc, p) => ({
      points: acc.points + p.points,
      rebounds: acc.rebounds + p.rebounds,
      assists: acc.assists + p.assists,
      steals: acc.steals + p.steals,
      blocks: acc.blocks + p.blocks,
      turnovers: acc.turnovers + p.turnovers,
      fouls: acc.fouls + p.fouls,
    }),
    { points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0 },
  );

  return (
    <section className="panel flex flex-col min-h-0">
      <header className="h-12 shrink-0 px-4 flex items-center justify-between border-b border-surface-border">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="inline-block w-2 h-2 shrink-0"
            style={{ background: team.color }}
            aria-hidden
          />
          <h2 className="heading-display text-lg truncate">{team.name}</h2>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-ink-muted tabular">
          <span>
            TO <span className="text-ink">{totals.timeoutsTaken}</span>/
            {totals.timeoutsRemaining + totals.timeoutsTaken}
          </span>
          <span>
            TEAM FLS <span className="text-ink">{totals.totalFouls}</span>
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-auto scrollbar-thin">
        <table className="w-full text-sm font-mono tabular border-collapse">
          <thead className="sticky top-0 bg-surface-elevated">
            <tr className="border-b border-surface-border">
              <Th className="text-left pl-4 w-10">#</Th>
              <Th className="text-left">Player</Th>
              <Th>PTS</Th>
              <Th>FG</Th>
              <Th>3P</Th>
              <Th>FT</Th>
              <Th>REB</Th>
              <Th>AST</Th>
              <Th>STL</Th>
              <Th>BLK</Th>
              <Th>TO</Th>
              <Th>PF</Th>
            </tr>
          </thead>
          <tbody>
            {team.roster.map((player) => {
              const line = stats.find((p) => p.playerId === player.id);
              if (!line) return null;
              return (
                <tr
                  key={player.id}
                  className={cn(
                    "border-b border-surface-border/40",
                    line.fouledOut && "text-ink-dim line-through",
                  )}
                >
                  <Td className="pl-4 text-ink-muted">{player.number}</Td>
                  <Td className="text-left truncate max-w-[140px]">
                    {player.name}
                    {player.isCaptain ? (
                      <span className="text-accent ml-1">C</span>
                    ) : null}
                    {player.isStarter ? (
                      <span className="text-ink-dim ml-1">*</span>
                    ) : null}
                  </Td>
                  <Td strong>{line.points}</Td>
                  <Td>
                    {line.fgMade}-{line.fgAttempted}
                  </Td>
                  <Td>
                    {line.threePtMade}-{line.threePtAttempted}
                  </Td>
                  <Td>
                    {line.ftMade}-{line.ftAttempted}
                  </Td>
                  <Td>{line.rebounds}</Td>
                  <Td>{line.assists}</Td>
                  <Td>{line.steals}</Td>
                  <Td>{line.blocks}</Td>
                  <Td>{line.turnovers}</Td>
                  <Td className={line.fouls >= 4 ? "text-danger" : undefined}>
                    {line.fouls}
                  </Td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-surface-border bg-surface-raised">
              <Td className="pl-4" />
              <Td className="text-left text-ink-muted uppercase text-xs tracking-wider">
                Total
              </Td>
              <Td strong>{totalsRow.points}</Td>
              <Td />
              <Td />
              <Td />
              <Td>{totalsRow.rebounds}</Td>
              <Td>{totalsRow.assists}</Td>
              <Td>{totalsRow.steals}</Td>
              <Td>{totalsRow.blocks}</Td>
              <Td>{totalsRow.turnovers}</Td>
              <Td>{totalsRow.fouls}</Td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        "h-9 text-[0.65rem] font-mono uppercase tracking-wider text-ink-dim text-right px-1",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
  strong,
}: {
  children?: React.ReactNode;
  className?: string;
  strong?: boolean;
}) {
  return (
    <td
      className={cn(
        "h-9 text-right px-1",
        strong && "text-ink font-medium",
        !strong && "text-ink-muted",
        className,
      )}
    >
      {children}
    </td>
  );
}
