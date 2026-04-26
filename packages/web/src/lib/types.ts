/**
 * Domain types for the scorekeeping application.
 *
 * The state model is event-sourced: every action during a game is recorded
 * as a `GameEvent`. Statistics are derived by folding events, and undo is a
 * structural operation (pop the last event). Time-only operations (start/stop
 * clock, period advance) are also modelled as events so they appear in the
 * play-by-play log.
 */

/** Basketball game formats supported by the app. */
export type GameFormat = "5v5" | "3v3";

/** Identifier type for teams and players. */
export type ID = string;

/** Home or away side. */
export type Side = "home" | "away";

/** A single player on a team's roster. */
export interface Player {
  id: ID;
  /** Jersey number (0–99). Must be unique within a team. */
  number: string;
  /** Display name. */
  name: string;
  /** Whether the player starts in the starting line-up. */
  isStarter: boolean;
  /** Whether the player is currently captain. */
  isCaptain: boolean;
}

/** A team participating in the game. */
export interface Team {
  id: ID;
  name: string;
  /** Three-letter team tag, e.g. "LAL". */
  tag: string;
  /** Hex colour used for branding the team panel. */
  color: string;
  coach: string;
  roster: Player[];
}

/** Static configuration decided at setup, frozen for the duration of the game. */
export interface GameSettings {
  format: GameFormat;
  /** Number of regular periods (4 for 5v5, 1 for 3v3 typically). */
  periods: number;
  /** Length of each period in seconds. */
  periodSeconds: number;
  /** Length of each overtime period in seconds. */
  overtimeSeconds: number;
  /** Team-fouls threshold per period that triggers bonus (default 5). */
  bonusFoulThreshold: number;
  /** Timeouts available per team for the whole game. */
  timeoutsPerGame: number;
  /** Venue / arena name, displayed on the scoresheet. */
  venue: string;
  /** Free-form competition / league name. */
  competition: string;
}

/** Kinds of scoring actions. */
export type ScoreKind = "ft" | "2pt" | "3pt";

/** Kinds of foul. */
export type FoulKind = "personal" | "technical" | "unsportsmanlike" | "disqualifying";

/** Kinds of non-scoring, non-foul stat actions. */
export type StatKind =
  | "rebound-off"
  | "rebound-def"
  | "assist"
  | "steal"
  | "block"
  | "turnover";

/**
 * A single recorded event during a game. Events are the source of truth;
 * scores, fouls, bonus and all statistics are derived from them.
 */
export type GameEvent =
  | {
      type: "score";
      id: ID;
      timestamp: number;
      period: number;
      clockAt: number;
      side: Side;
      playerId: ID;
      kind: ScoreKind;
      made: boolean; // `true` = shot was made; `false` = missed attempt (for FG%)
    }
  | {
      type: "foul";
      id: ID;
      timestamp: number;
      period: number;
      clockAt: number;
      side: Side;
      playerId: ID;
      kind: FoulKind;
    }
  | {
      type: "stat";
      id: ID;
      timestamp: number;
      period: number;
      clockAt: number;
      side: Side;
      playerId: ID;
      kind: StatKind;
    }
  | {
      type: "substitution";
      id: ID;
      timestamp: number;
      period: number;
      clockAt: number;
      side: Side;
      playerInId: ID;
      playerOutId: ID;
    }
  | {
      type: "timeout";
      id: ID;
      timestamp: number;
      period: number;
      clockAt: number;
      side: Side;
    }
  | {
      type: "clock";
      id: ID;
      timestamp: number;
      period: number;
      clockAt: number;
      action: "start" | "stop" | "reset";
    }
  | {
      type: "period";
      id: ID;
      timestamp: number;
      period: number;
      clockAt: number;
      action: "end" | "start";
    };

/** High-level lifecycle of a game. */
export type GameStatus =
  | "setup" // still in pre-game setup screen
  | "ready" // teams/settings locked, about to tip off
  | "live" // game in progress
  | "period-break" // between quarters / halves
  | "finished"; // final

/** Statistics line for a single player. */
export interface PlayerStats {
  playerId: ID;
  points: number;
  fgMade: number;
  fgAttempted: number;
  threePtMade: number;
  threePtAttempted: number;
  ftMade: number;
  ftAttempted: number;
  reboundsOff: number;
  reboundsDef: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  /** `true` once personal fouls reach 5 (5v5) or 3 (3v3). */
  fouledOut: boolean;
}

/** Aggregated statistics for a single team. */
export interface TeamStats {
  side: Side;
  points: number;
  fouls: number; // team fouls in current period
  totalFouls: number; // team fouls across the entire game
  timeoutsTaken: number;
  timeoutsRemaining: number;
  players: PlayerStats[];
}
