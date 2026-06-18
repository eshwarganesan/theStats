/**
 * Failing-first tests for the persistence module.
 *
 * Coverage:
 *   - `isStorageAvailable()` reflects localStorage probe success/failure.
 *   - `parseGameRecord` accepts a valid v1 payload and rejects every
 *     malformed permutation we can express (no `as` casts).
 *   - `readClockCheckpoint` / `writeClockCheckpoint` round-trip and
 *     `read` returns `null` on malformed payloads or schema-version skew.
 *   - `clearPersistedGame` removes both keys and is safe to call twice.
 *   - `subscribeRecoveryFailed` / `notifyRecoveryFailed` is a tiny pubsub
 *     that invokes every subscribed callback and respects unsubscribe.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLOCK_CHECKPOINT_KEY,
  GAME_STORAGE_KEY,
  clearPersistedGame,
  createGuardedLocalStorage,
  createNoopStorage,
  isStorageAvailable,
  notifyRecoveryFailed,
  parseGameRecord,
  readClockCheckpoint,
  subscribeRecoveryFailed,
  writeClockCheckpoint,
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

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SSR guards", () => {
  it("isStorageAvailable returns false when window is undefined", () => {
    vi.stubGlobal("window", undefined);
    expect(isStorageAvailable()).toBe(false);
    vi.unstubAllGlobals();
  });

  it("writeClockCheckpoint is a no-op when window is undefined", () => {
    vi.stubGlobal("window", undefined);
    expect(() =>
      writeClockCheckpoint({
        schemaVersion: 1,
        clockSeconds: 1,
        breakSeconds: 0,
        savedAt: 0,
      }),
    ).not.toThrow();
    vi.unstubAllGlobals();
  });

  it("readClockCheckpoint returns null when window is undefined", () => {
    vi.stubGlobal("window", undefined);
    expect(readClockCheckpoint()).toBeNull();
    vi.unstubAllGlobals();
  });

  it("clearPersistedGame is a no-op when window is undefined", () => {
    vi.stubGlobal("window", undefined);
    expect(() => clearPersistedGame()).not.toThrow();
    vi.unstubAllGlobals();
  });
});

describe("isStorageAvailable", () => {
  it("returns true in a working jsdom localStorage", () => {
    expect(isStorageAvailable()).toBe(true);
  });

  it("returns false when setItem throws (private mode / quota / SecurityError)", () => {
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    expect(isStorageAvailable()).toBe(false);
    spy.mockRestore();
  });

  it("cleans up its canary key on success", () => {
    isStorageAvailable();
    // No leftover keys that the app didn't intentionally write.
    const leaked = Object.keys(localStorage).filter((k) =>
      k.startsWith("thestats."),
    );
    expect(leaked).toEqual([]);
  });
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

  it("rejects non-object inner records (homeTeam, settings, onCourt)", () => {
    expect(parseGameRecord({ ...validRecord(), homeTeam: null })).toBeNull();
    expect(parseGameRecord({ ...validRecord(), settings: 42 })).toBeNull();
    expect(parseGameRecord({ ...validRecord(), onCourt: "neither" })).toBeNull();
  });
});

describe("clock checkpoint", () => {
  it("round-trips a valid checkpoint", () => {
    writeClockCheckpoint({
      schemaVersion: 1,
      clockSeconds: 123,
      breakSeconds: 0,
      savedAt: 1_700_000_000_000,
    });
    expect(readClockCheckpoint()).toEqual({
      schemaVersion: 1,
      clockSeconds: 123,
      breakSeconds: 0,
      savedAt: 1_700_000_000_000,
    });
  });

  it("returns null when the key is absent", () => {
    expect(readClockCheckpoint()).toBeNull();
  });

  it("returns null when the stored payload is not JSON", () => {
    localStorage.setItem(CLOCK_CHECKPOINT_KEY, "{not json");
    expect(readClockCheckpoint()).toBeNull();
  });

  it("returns null on a schema-version mismatch", () => {
    localStorage.setItem(
      CLOCK_CHECKPOINT_KEY,
      JSON.stringify({
        schemaVersion: 2,
        clockSeconds: 1,
        breakSeconds: 0,
        savedAt: 0,
      }),
    );
    expect(readClockCheckpoint()).toBeNull();
  });

  it("returns null when clockSeconds is negative or non-finite", () => {
    localStorage.setItem(
      CLOCK_CHECKPOINT_KEY,
      JSON.stringify({
        schemaVersion: 1,
        clockSeconds: -1,
        breakSeconds: 0,
        savedAt: 0,
      }),
    );
    expect(readClockCheckpoint()).toBeNull();
  });

  it("returns null when breakSeconds is invalid", () => {
    localStorage.setItem(
      CLOCK_CHECKPOINT_KEY,
      JSON.stringify({
        schemaVersion: 1,
        clockSeconds: 10,
        breakSeconds: Infinity,
        savedAt: 0,
      }),
    );
    expect(readClockCheckpoint()).toBeNull();
  });

  it("returns null when savedAt is not a number", () => {
    localStorage.setItem(
      CLOCK_CHECKPOINT_KEY,
      JSON.stringify({
        schemaVersion: 1,
        clockSeconds: 10,
        breakSeconds: 0,
        savedAt: "now",
      }),
    );
    expect(readClockCheckpoint()).toBeNull();
  });

  it("returns null when getItem itself throws", () => {
    const spy = vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(readClockCheckpoint()).toBeNull();
    spy.mockRestore();
  });

  it("write swallows storage errors without throwing", () => {
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    expect(() =>
      writeClockCheckpoint({
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
    localStorage.setItem(GAME_STORAGE_KEY, "anything");
    localStorage.setItem(CLOCK_CHECKPOINT_KEY, "anything");
    clearPersistedGame();
    expect(localStorage.getItem(GAME_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(CLOCK_CHECKPOINT_KEY)).toBeNull();
  });

  it("is safe to call when nothing is stored", () => {
    expect(() => clearPersistedGame()).not.toThrow();
  });

  it("does not throw when removeItem itself throws", () => {
    const spy = vi.spyOn(localStorage, "removeItem").mockImplementation(() => {
      throw new DOMException("nope", "SecurityError");
    });
    expect(() => clearPersistedGame()).not.toThrow();
    spy.mockRestore();
  });
});

describe("createNoopStorage", () => {
  it("supports the full Storage interface in-memory", () => {
    const s = createNoopStorage();
    expect(s.length).toBe(0);
    expect(s.getItem("missing")).toBeNull();
    s.setItem("a", "1");
    s.setItem("b", "2");
    expect(s.length).toBe(2);
    expect(s.getItem("a")).toBe("1");
    expect(s.key(0)).toBe("a");
    expect(s.key(1)).toBe("b");
    expect(s.key(99)).toBeNull();
    s.removeItem("a");
    expect(s.getItem("a")).toBeNull();
    s.clear();
    expect(s.length).toBe(0);
  });
});

describe("createGuardedLocalStorage", () => {
  it("delegates non-game-key reads/writes straight through", () => {
    const s = createGuardedLocalStorage();
    s.setItem("unrelated", "ok");
    expect(s.getItem("unrelated")).toBe("ok");
    expect(s.length).toBe(1);
    expect(s.key(0)).toBe("unrelated");
    s.removeItem("unrelated");
    expect(s.getItem("unrelated")).toBeNull();
  });

  it("clears the game key and notifies on malformed JSON read", () => {
    const cb = vi.fn();
    const unsub = subscribeRecoveryFailed(cb);
    localStorage.setItem(GAME_STORAGE_KEY, "{not json");
    const s = createGuardedLocalStorage();
    expect(s.getItem(GAME_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(GAME_STORAGE_KEY)).toBeNull();
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("returns valid JSON on the game key unchanged", () => {
    localStorage.setItem(GAME_STORAGE_KEY, '{"ok":true}');
    const s = createGuardedLocalStorage();
    expect(s.getItem(GAME_STORAGE_KEY)).toBe('{"ok":true}');
  });

  it("clear() on the wrapper clears underlying localStorage", () => {
    localStorage.setItem("x", "1");
    const s = createGuardedLocalStorage();
    s.clear();
    expect(localStorage.getItem("x")).toBeNull();
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
