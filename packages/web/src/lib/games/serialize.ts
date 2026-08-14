/**
 * Serialization helpers between the client's Zustand game record and the
 * `public.games` row shape (feature 009-account-library).
 *
 * The Zustand store's `PersistedGameRecord` is the authoritative full
 * shape of a game. `public.games` stores it verbatim in the `state jsonb`
 * column and denormalizes a small set of summary columns for cheap
 * library rendering (Research R-02). This module owns the transforms in
 * both directions.
 */
import { POINTS_BY_KIND } from "@thestats/core";
import type { ScoreKind, Side } from "@thestats/core";
import type { PersistedGameRecord } from "@/lib/persistence";
import type { SavedGameRecord } from "./types";

/**
 * Structural view of the fields these helpers read off a game record.
 * Widening the input beyond `PersistedGameRecord` lets the same helper
 * accept both the in-memory record (strict types) and the Zod-parsed
 * input from the API boundary (whose inner shapes are `.passthrough()`
 * for forward compatibility).
 */
export interface GameRecordLike {
  status: PersistedGameRecord["status"];
  currentPeriod: number;
  events: ReadonlyArray<Record<string, unknown>>;
  homeTeam: { name: string };
  awayTeam: { name: string };
}

function readSide(e: Record<string, unknown>): Side | null {
  return e.side === "home" || e.side === "away" ? e.side : null;
}

function readScoreKind(e: Record<string, unknown>): ScoreKind | null {
  return e.kind === "ft" || e.kind === "2pt" || e.kind === "3pt" ? e.kind : null;
}

export interface SummaryColumns {
  status: "in-progress" | "finished";
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  eventCount: number;
  currentPeriod: number;
}

function scoreFor(
  events: ReadonlyArray<Record<string, unknown>>,
  side: "home" | "away",
): number {
  let total = 0;
  for (const e of events) {
    const eSide = readSide(e);
    if (e.type === "score" && eSide === side && e.made === true) {
      const kind = readScoreKind(e);
      if (kind !== null) total += POINTS_BY_KIND[kind];
    } else if (
      e.type === "team-score-adjust" &&
      eSide === side &&
      typeof e.points === "number"
    ) {
      total += e.points;
    }
  }
  return total;
}

/**
 * Compute the small set of summary columns the server denormalizes onto
 * `public.games` on every write. Called by the client (`writeThrough`)
 * to preview the values and by the server to authoritatively set them.
 */
export function deriveSummaryColumns(
  record: GameRecordLike,
): SummaryColumns {
  return {
    status: record.status === "finished" ? "finished" : "in-progress",
    homeTeamName: record.homeTeam.name,
    awayTeamName: record.awayTeam.name,
    homeScore: scoreFor(record.events, "home"),
    awayScore: scoreFor(record.events, "away"),
    eventCount: record.events.length,
    currentPeriod: record.currentPeriod,
  };
}

/**
 * Convert an in-memory game record into the shape sent to `POST /api/games`
 * and `PATCH /api/games/[id]` as the `state` field. Currently a straight
 * passthrough (both sides use the same schema) but kept as a function so
 * future schema divergence has a single place to change.
 */
export function toSavedGameRecordState(
  record: PersistedGameRecord,
): PersistedGameRecord {
  return record;
}

/** Shape of the row returned by a raw `select * from public.games`. */
export interface GamesRow {
  id: string;
  owner_id: string;
  status: string;
  home_team_name: string;
  away_team_name: string;
  home_score: number;
  away_score: number;
  event_count: number;
  current_period: number;
  started_at: string;
  last_activity_at: string;
  finished_at: string | null;
  state: unknown;
}

/**
 * Map a `public.games` row into a `SavedGameRecord`. Trusts the caller
 * to have validated the `state` blob before persisting it (the Route
 * Handlers do this via `PersistedGameRecordSchema` before every write).
 */
export function fromSavedGameRecord(row: GamesRow): SavedGameRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    status: row.status === "finished" ? "finished" : "in-progress",
    homeTeamName: row.home_team_name,
    awayTeamName: row.away_team_name,
    homeScore: row.home_score,
    awayScore: row.away_score,
    eventCount: row.event_count,
    currentPeriod: row.current_period,
    startedAt: row.started_at,
    lastActivityAt: row.last_activity_at,
    finishedAt: row.finished_at,
    state: row.state as PersistedGameRecord,
  };
}
