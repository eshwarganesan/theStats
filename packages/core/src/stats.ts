import type {
  GameEvent,
  PlayerStats,
  Side,
  Team,
  TeamStats,
  GameSettings,
} from "./types";
import { FOUL_OUT_THRESHOLD, POINTS_BY_KIND } from "./constants";

/** Factory for a blank stats line. */
function emptyPlayerStats(playerId: string): PlayerStats {
  return {
    playerId,
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
  };
}

/**
 * Fold the event list into a full statistics snapshot for both teams.
 *
 * Implementation notes:
 *   - `currentPeriod` is used to compute team-fouls *this period* (for bonus
 *     calculation); total fouls are tracked separately.
 *   - `foul-out` is marked once personal fouls hit the format-specific
 *     threshold.
 *   - This function is pure and should be memoised by callers via
 *     the store's selector.
 */
export function computeStats(
  events: GameEvent[],
  homeTeam: Team,
  awayTeam: Team,
  settings: GameSettings,
  currentPeriod: number,
): { home: TeamStats; away: TeamStats } {
  const foulOutAt = FOUL_OUT_THRESHOLD[settings.format];

  const make = (side: Side, team: Team): TeamStats => ({
    side,
    points: 0,
    fouls: 0,
    totalFouls: 0,
    timeoutsTaken: 0,
    timeoutsRemaining: settings.timeoutsPerGame,
    players: team.roster.map((p) => emptyPlayerStats(p.id)),
  });

  const stats = { home: make("home", homeTeam), away: make("away", awayTeam) };

  const findPlayer = (team: TeamStats, id: string): PlayerStats | undefined =>
    team.players.find((p) => p.playerId === id);

  for (const ev of events) {
    switch (ev.type) {
      case "score": {
        const team = stats[ev.side];
        const player = findPlayer(team, ev.playerId);
        if (!player) break;
        if (ev.kind === "ft") {
          player.ftAttempted += 1;
          if (ev.made) {
            player.ftMade += 1;
            player.points += POINTS_BY_KIND.ft;
            team.points += POINTS_BY_KIND.ft;
          }
        } else {
          player.fgAttempted += 1;
          if (ev.kind === "3pt") player.threePtAttempted += 1;
          if (ev.made) {
            player.fgMade += 1;
            if (ev.kind === "3pt") {
              player.threePtMade += 1;
              player.points += POINTS_BY_KIND["3pt"];
              team.points += POINTS_BY_KIND["3pt"];
            } else {
              player.points += POINTS_BY_KIND["2pt"];
              team.points += POINTS_BY_KIND["2pt"];
            }
          }
        }
        break;
      }

      case "foul": {
        const team = stats[ev.side];
        const player = findPlayer(team, ev.playerId);
        if (!player) break;
        player.fouls += 1;
        if (player.fouls >= foulOutAt) player.fouledOut = true;
        team.totalFouls += 1;
        if (ev.kind !== "offensive") {
          if (ev.period === currentPeriod) team.fouls += 1;
        }
        else player.turnovers += 1;
        break;
      }

      case "stat": {
        const team = stats[ev.side];
        const player = findPlayer(team, ev.playerId);
        if (!player) break;
        switch (ev.kind) {
          case "rebound-off":
            player.reboundsOff += 1;
            player.rebounds += 1;
            break;
          case "rebound-def":
            player.reboundsDef += 1;
            player.rebounds += 1;
            break;
          case "assist":
            player.assists += 1;
            break;
          case "steal":
            player.steals += 1;
            break;
          case "block":
            player.blocks += 1;
            break;
          case "turnover":
            player.turnovers += 1;
            break;
        }
        break;
      }

      case "timeout": {
        const team = stats[ev.side];
        team.timeoutsTaken += 1;
        team.timeoutsRemaining = Math.max(0, team.timeoutsRemaining - 1);
        break;
      }

      // substitution/clock/period affect live state, not stats
      case "substitution":
      case "clock":
      case "period":
        break;
    }
  }

  return stats;
}

/** Whether the given side is in the bonus for the current period. */
export function isInBonus(team: TeamStats, settings: GameSettings): boolean {
  return team.fouls >= settings.bonusFoulThreshold;
}
