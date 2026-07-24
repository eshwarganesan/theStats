/**
 * Statsheet presentation (feature 009-account-library, US4).
 *
 * Renders per-player + team-total statistics for a finished (or in-progress)
 * game. Pure presentational — takes `TeamStats` for both sides + the
 * source `Team` rosters (for jersey numbers and player names — those live
 * on `Player`, not `PlayerStats`).
 *
 * Semantic `<table>` markup so screen readers can navigate the box score
 * the same way sighted users skim it.
 */

import type { GameSettings, PlayerStats, Team, TeamStats } from "@thestats/core";
import { cn } from "@/lib/utils";

export interface StatSheetProps {
  home: TeamStats;
  away: TeamStats;
  homeTeam: Team;
  awayTeam: Team;
  settings: GameSettings;
  className?: string;
}

interface Row {
  playerId: string;
  number: string;
  name: string;
  stats: PlayerStats;
}

function toRows(team: Team, stats: TeamStats): Row[] {
  const byId = new Map(stats.players.map((p) => [p.playerId, p]));
  return team.roster.map((p) => ({
    playerId: p.id,
    number: p.number,
    name: p.name,
    stats: byId.get(p.id) ?? {
      playerId: p.id,
      points: 0,
      fgMade: 0,
      fgAttempted: 0,
      threePtMade: 0,
      threePtAttempted: 0,
      ftMade: 0,
      ftAttempted: 0,
      reboundsOff: 0,
      reboundsDef: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      fouls: 0,
      fouledOut: false,
    },
  }));
}

interface TeamBlockProps {
  team: Team;
  stats: TeamStats;
}

function TeamBlock({ team, stats }: TeamBlockProps) {
  const rows = toRows(team, stats);
  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-baseline justify-between">
        <h3 className="heading-display text-lg truncate">{team.name}</h3>
        <span className="font-mono text-2xl text-ink">{stats.points}</span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-ink-dim text-xs uppercase tracking-wider">
              <th scope="col" className="text-left px-2 py-1">#</th>
              <th scope="col" className="text-left px-2 py-1">Player</th>
              <th scope="col" className="text-right px-2 py-1">PTS</th>
              <th scope="col" className="text-right px-2 py-1">FG</th>
              <th scope="col" className="text-right px-2 py-1">3P</th>
              <th scope="col" className="text-right px-2 py-1">FT</th>
              <th scope="col" className="text-right px-2 py-1">REB</th>
              <th scope="col" className="text-right px-2 py-1">AST</th>
              <th scope="col" className="text-right px-2 py-1">STL</th>
              <th scope="col" className="text-right px-2 py-1">BLK</th>
              <th scope="col" className="text-right px-2 py-1">TO</th>
              <th scope="col" className="text-right px-2 py-1">PF</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.playerId}
                className={cn(
                  "border-t border-surface-border",
                  r.stats.fouledOut && "text-danger",
                )}
              >
                <td className="px-2 py-1 font-mono text-ink-dim">{r.number}</td>
                <td className="px-2 py-1">{r.name}</td>
                <td className="px-2 py-1 text-right font-mono">{r.stats.points}</td>
                <td className="px-2 py-1 text-right font-mono">
                  {r.stats.fgMade}/{r.stats.fgAttempted}
                </td>
                <td className="px-2 py-1 text-right font-mono">
                  {r.stats.threePtMade}/{r.stats.threePtAttempted}
                </td>
                <td className="px-2 py-1 text-right font-mono">
                  {r.stats.ftMade}/{r.stats.ftAttempted}
                </td>
                <td className="px-2 py-1 text-right font-mono">{r.stats.rebounds}</td>
                <td className="px-2 py-1 text-right font-mono">{r.stats.assists}</td>
                <td className="px-2 py-1 text-right font-mono">{r.stats.steals}</td>
                <td className="px-2 py-1 text-right font-mono">{r.stats.blocks}</td>
                <td className="px-2 py-1 text-right font-mono">{r.stats.turnovers}</td>
                <td className="px-2 py-1 text-right font-mono">{r.stats.fouls}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="text-xs text-ink-dim font-mono">
        Team fouls: {stats.totalFouls} · Timeouts left: {stats.timeoutsRemaining}
      </footer>
    </section>
  );
}

export function StatSheet({
  home,
  away,
  homeTeam,
  awayTeam,
  className,
}: StatSheetProps) {
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <TeamBlock team={homeTeam} stats={home} />
      <TeamBlock team={awayTeam} stats={away} />
    </div>
  );
}
