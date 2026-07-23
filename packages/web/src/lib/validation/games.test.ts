/**
 * Tests for Zod schemas at the games API boundary.
 * Feature 009-account-library, task T004.
 */
import { describe, expect, it } from "vitest";
import {
  LibraryQuerySchema,
  PatchGameBodySchema,
  PersistedGameRecordSchema,
  PostGameBodySchema,
} from "./games";

/**
 * Minimal known-good PersistedGameRecord fixture matching the shape
 * `packages/web/src/lib/persistence.ts` produces. Uses the real core
 * `Team` / `GameSettings` field names.
 */
const validRecord = {
  schemaVersion: 1 as const,
  homeTeam: {
    id: "home",
    name: "Home",
    tag: "HOM",
    color: "#ff0000",
    coach: "Coach A",
    roster: [],
  },
  awayTeam: {
    id: "away",
    name: "Away",
    tag: "AWY",
    color: "#0000ff",
    coach: "Coach B",
    roster: [],
  },
  settings: {
    format: "5v5" as const,
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
  status: "live" as const,
  currentPeriod: 1,
  events: [],
  possession: "home" as const,
  onCourt: { home: [], away: [] },
} as const;

describe("PersistedGameRecordSchema", () => {
  it("accepts a canonical known-good record", () => {
    const result = PersistedGameRecordSchema.safeParse(validRecord);
    expect(result.success).toBe(true);
  });

  it("rejects when schemaVersion is missing", () => {
    const rest = { ...validRecord } as Partial<typeof validRecord>;
    delete rest.schemaVersion;
    const result = PersistedGameRecordSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects when status is missing", () => {
    const rest = { ...validRecord } as Partial<typeof validRecord>;
    delete rest.status;
    const result = PersistedGameRecordSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects when status is an unknown value", () => {
    const bad = { ...validRecord, status: "totally-not-a-status" };
    const result = PersistedGameRecordSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects when homeTeam.name is empty", () => {
    const bad = {
      ...validRecord,
      homeTeam: { ...validRecord.homeTeam, name: "" },
    };
    const result = PersistedGameRecordSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects unknown top-level fields (strict schema)", () => {
    const bad = { ...validRecord, gremlin: "surprise" };
    const result = PersistedGameRecordSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe("PostGameBodySchema", () => {
  it("accepts { state } wrapping a valid record", () => {
    const result = PostGameBodySchema.safeParse({ state: validRecord });
    expect(result.success).toBe(true);
  });

  it("rejects when state is missing", () => {
    const result = PostGameBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("PatchGameBodySchema", () => {
  it("accepts { state } wrapping a valid record", () => {
    const result = PatchGameBodySchema.safeParse({ state: validRecord });
    expect(result.success).toBe(true);
  });
});

describe("LibraryQuerySchema", () => {
  it("accepts an empty query", () => {
    const result = LibraryQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20); // default
      expect(result.data.cursor).toBeUndefined();
    }
  });

  it("accepts a numeric limit within bounds", () => {
    const result = LibraryQuerySchema.safeParse({ limit: "5" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(5);
  });

  it("rejects limit above 50", () => {
    const result = LibraryQuerySchema.safeParse({ limit: "999" });
    expect(result.success).toBe(false);
  });

  it("rejects limit below 1", () => {
    const result = LibraryQuerySchema.safeParse({ limit: "0" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid ISO cursor", () => {
    const result = LibraryQuerySchema.safeParse({
      cursor: "2026-07-20T18:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-ISO cursor", () => {
    const result = LibraryQuerySchema.safeParse({ cursor: "not-a-date" });
    expect(result.success).toBe(false);
  });
});
