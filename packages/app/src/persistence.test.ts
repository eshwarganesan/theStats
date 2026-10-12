/**
 * Tests for the platform-neutral persistence layer.
 *
 * Coverage:
 *   - `parseGameRecord` accepts a valid v1 payload and rejects every
 *     malformed permutation we can express (no `as` casts).
 *   - `readClockCheckpoint` / `writeClockCheckpoint` round-trip through an
 *     injected store and `read` returns `null` on malformed payloads or
 *     schema-version skew.
 *   - `clearPersistedGame` removes both keys and tolerates a throwing store.
 *   - `createMemoryStorage` / `createGuardedStorage` adapters.
 *   - `subscribeRecoveryFailed` / `notifyRecoveryFailed` is a tiny pubsub
 *     that invokes every subscribed callback and respects unsubscribe.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLOCK_CHECKPOINT_KEY,
  GAME_STORAGE_KEY,
  clearPersistedGame,
  createGuardedStorage,
  createMemoryStorage,
  notifyRecoveryFailed,
  parseGameRecord,
  readClockCheckpoint,
  subscribeRecoveryFailed,
  writeClockCheckpoint,
  type KeyValueStorage,
} from "./persistence";
import { DEFAULT_SETTINGS } from "@thestats/core";

const validRecord = () => ({
  schemaVersion: 1 as const,
  homeTeam: {
    id: "home-1",
    name: "Home",
    tag: "HME",
    color: "#3B82F6",
    coach: "",
    roster: [],
  },
  awayTeam: {
    id: "away-1",
    name: "Away",
    tag: "AWY",
    color: "#EF4444",
    coach: "",
    roster: [],
  },
  settings: DEFAULT_SETTINGS["5v5"],
  status: "live" as const,
  currentPeriod: 1,
  events: [],
  possession: null,
  onCourt: { home: [], away: [] },
});

let storage: KeyValueStorage;

beforeEach(() => {
  storage = createMemoryStorage();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseGameRecord", () => {
  it("accepts a valid v1 record and returns the typed shape", () => {
    expect(parseGameRecord(validRecord())).not.toBeNull();
  });

  it("rejects null and non-object inputs", () => {
    expect(parseGameRecord(null)).toBeNull();
    expect(parseGameRecord(undefined)).toBeNull();
    expect(parseGameRecord("not-an-object")).toBeNull();
    expect(parseGameRecord(42)).toBeNull();
  });

  it("rejects an unknown schemaVersion", () => {
    expect(parseGameRecord({ ...validRecord(), schemaVersion: 2 })).toBeNull();
  });

  it("rejects a missing schemaVersion", () => {
    const rest = { ...validRecord() } as Record<string, unknown>;
    delete rest.schemaVersion;
    expect(parseGameRecord(rest)).toBeNull();
  });

  it("rejects a missing required top-level field", () => {
    const rest = { ...validRecord() } as Record<string, unknown>;
    delete rest.events;
    expect(parseGameRecord(rest)).toBeNull();
  });

  it("rejects an unknown GameStatus value", () => {
    expect(
      parseGameRecord({ ...validRecord(), status: "in-progress" }),
    ).toBeNull();
  });

  it("rejects when events is not an array", () => {
    expect(parseGameRecord({ ...validRecord(), events: "[]" })).toBeNull();
  });

  it("rejects an unrecognized possession value (must be home/away/null)", () => {
    expect(parseGameRecord({ ...validRecord(), possession: "neither" })).toBeNull();
  });

  it("rejects a non-numeric currentPeriod", () => {
    expect(parseGameRecord({ ...validRecord(), currentPeriod: "1" })).toBeNull();
  });

  it("accepts a record without possessionArrow (pre-feature-007)", () => {
    expect(parseGameRecord(validRecord())).not.toBeNull();
    expect(
      parseGameRecord({ ...validRecord(), possessionArrow: undefined }),
    ).not.toBeNull();
  });

  it("accepts every valid possessionArrow value", () => {
    for (const possessionArrow of ["unset", "home", "away"]) {
      expect(parseGameRecord({ ...validRecord(), possessionArrow })).not.toBeNull();
    }
  });

  it("rejects an unknown possessionArrow value", () => {
    expect(
      parseGameRecord({ ...validRecord(), possessionArrow: "left" }),
    ).toBeNull();
  });

  it("rejects non-object inner records (homeTeam, settings, onCourt)", () => {
    expect(parseGameRecord({ ...validRecord(), homeTeam: null })).toBeNull();
    expect(parseGameRecord({ ...validRecord(), settings: 42 })).toBeNull();
    expect(parseGameRecord({ ...validRecord(), onCourt: "neither" })).toBeNull();
  });
});


describe("clock checkpoint", () => {
  it("round-trips a valid checkpoint", () => {
    writeClockCheckpoint(storage, {
      schemaVersion: 1,
      clockSeconds: 123,
      breakSeconds: 0,
      savedAt: 1_700_000_000_000,
    });
    expect(readClockCheckpoint(storage)).toEqual({
      schemaVersion: 1,
      clockSeconds: 123,
      breakSeconds: 0,
      savedAt: 1_700_000_000_000,
    });
  });

  it("returns null when the key is absent", () => {
    expect(readClockCheckpoint(storage)).toBeNull();
  });

  it("returns null when the stored payload is not JSON", () => {
    storage.setItem(CLOCK_CHECKPOINT_KEY, "{not json");
    expect(readClockCheckpoint(storage)).toBeNull();
  });

  it("returns null on a schema-version mismatch", () => {
    storage.setItem(
      CLOCK_CHECKPOINT_KEY,
      JSON.stringify({
        schemaVersion: 2,
        clockSeconds: 1,
        breakSeconds: 0,
        savedAt: 0,
      }),
    );
    expect(readClockCheckpoint(storage)).toBeNull();
  });

  it("returns null when clockSeconds is negative or non-finite", () => {
    storage.setItem(
      CLOCK_CHECKPOINT_KEY,
      JSON.stringify({
        schemaVersion: 1,
        clockSeconds: -1,
        breakSeconds: 0,
        savedAt: 0,
      }),
    );
    expect(readClockCheckpoint(storage)).toBeNull();
  });

  it("returns null when breakSeconds is invalid", () => {
    storage.setItem(
      CLOCK_CHECKPOINT_KEY,
      JSON.stringify({
        schemaVersion: 1,
        clockSeconds: 10,
        breakSeconds: Infinity,
        savedAt: 0,
      }),
    );
    expect(readClockCheckpoint(storage)).toBeNull();
  });

  it("returns null when savedAt is not a number", () => {
    storage.setItem(
      CLOCK_CHECKPOINT_KEY,
      JSON.stringify({
        schemaVersion: 1,
        clockSeconds: 10,
        breakSeconds: 0,
        savedAt: "now",
      }),
    );
    expect(readClockCheckpoint(storage)).toBeNull();
  });

  it("returns null when getItem itself throws", () => {
    const spy = vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readClockCheckpoint(storage)).toBeNull();
    spy.mockRestore();
  });

  it("write swallows storage errors without throwing", () => {
    const spy = vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("Quota exceeded");
    });
    expect(() =>
      writeClockCheckpoint(storage, {
        schemaVersion: 1,
        clockSeconds: 1,
        breakSeconds: 0,
        savedAt: 0,
      }),
    ).not.toThrow();
    spy.mockRestore();
  });
});


describe("clearPersistedGame", () => {
  it("removes both keys", () => {
    storage.setItem(GAME_STORAGE_KEY, "anything");
    storage.setItem(CLOCK_CHECKPOINT_KEY, "anything");
    clearPersistedGame(storage);
    expect(storage.getItem(GAME_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(CLOCK_CHECKPOINT_KEY)).toBeNull();
  });

  it("is safe to call when nothing is stored", () => {
    expect(() => clearPersistedGame(storage)).not.toThrow();
  });

  it("does not throw when removeItem itself throws", () => {
    const spy = vi.spyOn(storage, "removeItem").mockImplementation(() => {
      throw new Error("nope");
    });
    expect(() => clearPersistedGame(storage)).not.toThrow();
    spy.mockRestore();
  });
});


describe("createMemoryStorage", () => {
  it("stores, reads, and removes values in memory", () => {
    const s = createMemoryStorage();
    expect(s.getItem("missing")).toBeNull();
    s.setItem("a", "1");
    expect(s.getItem("a")).toBe("1");
    s.removeItem("a");
    expect(s.getItem("a")).toBeNull();
  });

  it("isolates separate instances", () => {
    const a = createMemoryStorage();
    const b = createMemoryStorage();
    a.setItem("k", "v");
    expect(b.getItem("k")).toBeNull();
  });
});

describe("createGuardedStorage", () => {
  it("delegates non-game-key reads/writes straight through", () => {
    const s = createGuardedStorage(storage);
    s.setItem("unrelated", "ok");
    expect(s.getItem("unrelated")).toBe("ok");
    expect(storage.getItem("unrelated")).toBe("ok");
    s.removeItem("unrelated");
    expect(s.getItem("unrelated")).toBeNull();
  });

  it("clears the game key and notifies on malformed JSON read", () => {
    const cb = vi.fn();
    const unsub = subscribeRecoveryFailed(cb);
    storage.setItem(GAME_STORAGE_KEY, "{not json");
    storage.setItem(CLOCK_CHECKPOINT_KEY, "anything");
    const s = createGuardedStorage(storage);
    expect(s.getItem(GAME_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(GAME_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(CLOCK_CHECKPOINT_KEY)).toBeNull();
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("returns valid JSON on the game key unchanged", () => {
    storage.setItem(GAME_STORAGE_KEY, '{"ok":true}');
    const s = createGuardedStorage(storage);
    expect(s.getItem(GAME_STORAGE_KEY)).toBe('{"ok":true}');
  });
});

describe("recovery-failed pubsub", () => {
  it("invokes every subscribed callback when notified", () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = subscribeRecoveryFailed(a);
    const unsubB = subscribeRecoveryFailed(b);
    notifyRecoveryFailed();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    unsubA();
    unsubB();
  });

  it("stops invoking a callback after unsubscribe", () => {
    const cb = vi.fn();
    const unsub = subscribeRecoveryFailed(cb);
    unsub();
    notifyRecoveryFailed();
    expect(cb).not.toHaveBeenCalled();
  });

  it("isolates a throwing subscriber so other subscribers still run", () => {
    const thrower = vi.fn(() => {
      throw new Error("boom");
    });
    const ok = vi.fn();
    const unsubA = subscribeRecoveryFailed(thrower);
    const unsubB = subscribeRecoveryFailed(ok);
    notifyRecoveryFailed();
    expect(thrower).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledTimes(1);
    unsubA();
    unsubB();
  });
});
