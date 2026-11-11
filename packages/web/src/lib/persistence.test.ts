/**
 * Tests for the browser binding of the persistence layer.
 *
 * Parsing, adapters, and the recovery pubsub are covered in
 * `@thestats/app` (`packages/app/src/persistence.test.ts`). These tests
 * cover what is browser-specific:
 *   - SSR guards when `window` is undefined.
 *   - `isStorageAvailable()` reflects localStorage probe success/failure.
 *   - `getBrowserStorage()` tolerates a throwing `localStorage` accessor.
 *   - `readClockCheckpoint` / `writeClockCheckpoint` / `clearPersistedGame`
 *     reach `window.localStorage`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACCOUNT_STORAGE_KEY,
  CLOCK_CHECKPOINT_KEY,
  GAME_STORAGE_KEY,
  clearPersistedGame,
  forgetRememberedAccount,
  readRememberedAccount,
  rememberAccount,
  getBrowserStorage,
  isStorageAvailable,
  readClockCheckpoint,
  writeClockCheckpoint,
} from "./persistence";

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


describe("getBrowserStorage", () => {
  it("returns window.localStorage when accessible", () => {
    expect(getBrowserStorage()).toBe(window.localStorage);
  });

  it("returns null when the localStorage accessor throws", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(getBrowserStorage()).toBeNull();
  });
});

describe("clock checkpoint", () => {
  it("round-trips a valid checkpoint through localStorage", () => {
    writeClockCheckpoint({
      schemaVersion: 1,
      clockSeconds: 123,
      breakSeconds: 0,
      savedAt: 1_700_000_000_000,
    });
    expect(localStorage.getItem(CLOCK_CHECKPOINT_KEY)).not.toBeNull();
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

  it("returns null when getItem itself throws", () => {
    const spy = vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(readClockCheckpoint()).toBeNull();
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
});

describe("remembered account (feature 018)", () => {
  it("lives under thestats.account.v1", () => {
    expect(ACCOUNT_STORAGE_KEY).toBe("thestats.account.v1");
  });

  it("forgetRememberedAccount removes it and nothing else", () => {
    localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify({ userId: "u-1" }));
    localStorage.setItem(GAME_STORAGE_KEY, "{}");
    forgetRememberedAccount();
    expect(localStorage.getItem(ACCOUNT_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(GAME_STORAGE_KEY)).toBe("{}");
  });

  it("forgetRememberedAccount doesn't throw without storage", () => {
    vi.stubGlobal("window", undefined);
    expect(() => forgetRememberedAccount()).not.toThrow();
    vi.unstubAllGlobals();
  });

  it("forgetRememberedAccount doesn't throw when storage refuses", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => forgetRememberedAccount()).not.toThrow();
  });
});

describe("rememberAccount / readRememberedAccount (feature 018)", () => {
  it("round-trips the user id", () => {
    rememberAccount("u-1");
    expect(localStorage.getItem(ACCOUNT_STORAGE_KEY)).toBe(JSON.stringify({ userId: "u-1" }));
    expect(readRememberedAccount()).toBe("u-1");
  });

  it("returns null when nothing is remembered", () => {
    expect(readRememberedAccount()).toBeNull();
  });

  it.each(["not json", JSON.stringify({}), JSON.stringify({ userId: 1 }), JSON.stringify("u-1")])(
    "drops a malformed value: %s",
    (raw) => {
      localStorage.setItem(ACCOUNT_STORAGE_KEY, raw);
      expect(readRememberedAccount()).toBeNull();
      expect(localStorage.getItem(ACCOUNT_STORAGE_KEY)).toBeNull();
    },
  );

  it("doesn't throw without storage", () => {
    vi.stubGlobal("window", undefined);
    expect(() => rememberAccount("u-1")).not.toThrow();
    expect(readRememberedAccount()).toBeNull();
    vi.unstubAllGlobals();
  });
});
