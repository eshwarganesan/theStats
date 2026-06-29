/**
 * Public surface of @thestats/core.
 *
 * Pure domain layer — types, rules, stats, and small framework-free
 * helpers (id and clock formatting). Importable by both the Next.js
 * frontend and the future API server. Must remain free of React, DOM,
 * Zustand, and Next.js dependencies.
 */
export type {
  GameFormat,
  ID,
  Side,
  PossessionArrowDirection,
  Player,
  Team,
  GameSettings,
  ScoreKind,
  FoulKind,
  StatKind,
  GameEvent,
  EditableEvent,
  EditEventPatch,
  GameStatus,
  PlayerStats,
  TeamStats,
} from "./types";

export {
  POINTS_BY_KIND,
  FOUL_OUT_THRESHOLD,
  PLAYERS_ON_COURT,
  DEFAULT_SETTINGS,
  STAT_LABELS,
  FOUL_LABELS,
  SCORE_LABELS,
} from "./constants";

export { computeStats, isInBonus } from "./stats";

export { uid } from "./ids";
export { formatClock, parseClock, formatPeriod } from "./clock";
