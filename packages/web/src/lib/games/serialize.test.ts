/**
 * Tests for game-record serialization helpers.
 * Feature 009-account-library, task T031.
 */
import { describe, expect, it } from "vitest";
import type { PersistedGameRecord } from "@/lib/persistence";
import type { LibraryEntry } from "./types";
import {
  deriveSummaryColumns,
  fromSavedGameRecord,
  toSavedGameRecordState,
} from "./serialize";

const record: PersistedGameRecord = {
  schemaVersion: 1,
  homeTeam: {
    id: "home",
    name: "Central High",
    tag: "CEN",
    color: "#ff0000",
    coach: "Coach A",
    roster: [],
  },
  awayTeam: {
    id: "away",
    name: "Eastridge",
    tag: "EAS",
    color: "#0000ff",
    coach: "Coach B",
    roster: [],
  },
  settings: {
    format: "5v5",
    periods: 4,
    periodSeconds: 600,
    overtimeSeconds: 300,
    overtimeEnabled: true,
    possessionArrowEnabled: true,
    bonusFoulThreshold: 5,
    timeoutsPerGame: 4,
    timeoutSeconds: 60,
    quarterBreakSeconds: 60,
    halftimeBreakSeconds: 900,
    venue: "Home Court",
    competition: "League",
  },
  status: "live",
  currentPeriod: 3,
  events: [
    {
      type: "score",
      id: "e1",
      timestamp: 1,
      period: 1,
      clockAt: 599,
      side: "home",
      playerId: "p1",
      kind: "2pt",
      made: true,
    },
    {
      type: "score",
      id: "e2",
      timestamp: 2,
      period: 1,
      clockAt: 590,
      side: "home",
      playerId: "p1",
      kind: "3pt",
      made: true,
    },
    {
      type: "score",
      id: "e3",
      timestamp: 3,
      period: 1,
      clockAt: 585,
      side: "away",
      playerId: "p2",
      kind: "2pt",
      made: true,
    },
    // A missed shot — must NOT contribute to score.
    {
      type: "score",
      id: "e4",
      timestamp: 4,
      period: 1,
      clockAt: 580,
      side: "home",
      playerId: "p1",
      kind: "2pt",
      made: false,
    },
  ],
  possession: "home",
  onCourt: { home: [], away: [] },
};

describe("deriveSummaryColumns", () => {
  it("computes score from made shots only", () => {
    const s = deriveSummaryColumns(record);
    expect(s.homeScore).toBe(5); // 2 + 3
    expect(s.awayScore).toBe(2);
  });

  it("counts events for the event_count column", () => {
    const s = deriveSummaryColumns(record);
    expect(s.eventCount).toBe(4);
  });

  it("uses homeTeam.name / awayTeam.name for the summary columns", () => {
    const s = deriveSummaryColumns(record);
    expect(s.homeTeamName).toBe("Central High");
    expect(s.awayTeamName).toBe("Eastridge");
  });

  it("carries currentPeriod through", () => {
    const s = deriveSummaryColumns(record);
    expect(s.currentPeriod).toBe(3);
  });

  it("maps status to 'in-progress' for non-finished statuses", () => {
    for (const status of ["setup", "ready", "live", "timeout", "period-break"] as const) {
      const s = deriveSummaryColumns({ ...record, status });
      expect(s.status).toBe("in-progress");
    }
  });

  it("maps status to 'finished' only when the game is finished", () => {
    const s = deriveSummaryColumns({ ...record, status: "finished" });
    expect(s.status).toBe("finished");
  });
});

describe("toSavedGameRecordState / fromSavedGameRecord round-trip", () => {
  const savedRow: LibraryEntry & { ownerId: string; state: unknown } = {
    id: "game-1",
    ownerId: "user-1",
    status: "in-progress",
    homeTeamName: "Central High",
    awayTeamName: "Eastridge",
    homeScore: 5,
    awayScore: 2,
    eventCount: 4,
    currentPeriod: 3,
    startedAt: "2026-07-22T18:00:00Z",
    lastActivityAt: "2026-07-22T19:00:00Z",
    finishedAt: null,
    state: record,
  };

  it("toSavedGameRecordState returns the same record shape it received", () => {
    const state = toSavedGameRecordState(record);
    expect(state).toEqual(record);
  });

  it("fromSavedGameRecord maps snake_case DB columns to camelCase domain fields", () => {
    const parsed = fromSavedGameRecord({
      id: "game-1",
      owner_id: "user-1",
      status: "in-progress",
      home_team_name: "Central High",
      away_team_name: "Eastridge",
      home_score: 5,
      away_score: 2,
      event_count: 4,
      current_period: 3,
      started_at: "2026-07-22T18:00:00Z",
      last_activity_at: "2026-07-22T19:00:00Z",
      finished_at: null,
      state: record,
    });
    expect(parsed).toEqual(savedRow);
  });
});
