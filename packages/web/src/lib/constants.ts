import type { GameSettings, GameFormat } from "./types";

/** Point values for each type of made shot. */
export const POINTS_BY_KIND = {
  ft: 1,
  "2pt": 2,
  "3pt": 3,
} as const;

/** Maximum personal fouls before a player is disqualified, per game format. */
export const FOUL_OUT_THRESHOLD: Record<GameFormat, number> = {
  "5v5": 5,
  "3v3": 3, // 3x3 half-court rules
};

/** Players on court per team, per game format. */
export const PLAYERS_ON_COURT: Record<GameFormat, number> = {
  "5v5": 5,
  "3v3": 3,
};

/** Default game settings by format (FIBA-style). */
export const DEFAULT_SETTINGS: Record<GameFormat, GameSettings> = {
  "5v5": {
    format: "5v5",
    periods: 4,
    periodSeconds: 10 * 60, // 10 minutes
    overtimeSeconds: 5 * 60,
    bonusFoulThreshold: 5,
    timeoutsPerGame: 5,
    timeoutSeconds: 60,
    quarterBreakSeconds: 120,
    halftimeBreakSeconds: 600,
    venue: "",
    competition: "",
  },
  "3v3": {
    format: "3v3",
    periods: 1,
    periodSeconds: 10 * 60, // 10 minute running clock or first to 21
    overtimeSeconds: 0, // OT decided by first-to-2 in 3x3
    bonusFoulThreshold: 7,
    timeoutsPerGame: 1,
    timeoutSeconds: 30,
    quarterBreakSeconds: 60,
    halftimeBreakSeconds: 0,
    venue: "",
    competition: "",
  },
};

/** Stat action labels used throughout the UI. */
export const STAT_LABELS = {
  "rebound-off": "Off. Reb",
  "rebound-def": "Def. Reb",
  assist: "Assist",
  steal: "Steal",
  block: "Block",
  turnover: "Turnover",
} as const;

export const FOUL_LABELS = {
  personal: "Personal",
  technical: "Technical",
  unsportsmanlike: "Unsportsmanlike",
  disqualifying: "Disqualifying",
} as const;

export const SCORE_LABELS = {
  "2pt": "2 PT",
  "3pt": "3 PT",
  ft: "Free Throw",
} as const;
