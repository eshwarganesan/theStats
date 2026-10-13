/**
 * Tests for `createPersistedGameStore` — the persist-middleware wiring
 * shared by every platform. Driven through an in-memory `KeyValueStorage`
 * so the same contract the web (`localStorage`) and iOS (MMKV) bindings
 * rely on is verified without a browser.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@thestats/core";

import {
  CLOCK_CHECKPOINT_KEY,
  GAME_STORAGE_KEY,
  createMemoryStorage,
  subscribeRecoveryFailed,
  type KeyValueStorage,
} from "./persistence";
import { createPersistedGameStore } from "./store";

const seedRecord = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  homeTeam: {
    id: "home-1",
    name: "Seeded Home",
    tag: "SED",
    color: "#3B82F6",
    coach: "",
    roster: [],
  },
  awayTeam: {
    id: "away-1",
    name: "Seeded Away",
    tag: "SDA",
    color: "#EF4444",
    coach: "",
    roster: [],
  },
  settings: DEFAULT_SETTINGS["5v5"],
  status: "live",
  currentPeriod: 2,
  events: [],
  possession: "home",
  onCourt: { home: [], away: [] },
  ...overrides,
});

function seededStorage(state: unknown): KeyValueStorage {
  const storage = createMemoryStorage();
  storage.setItem(GAME_STORAGE_KEY, JSON.stringify({ state, version: 1 }));
  return storage;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createPersistedGameStore", () => {
  it("rehydrates the partialized fields from storage", () => {
    const storage = seededStorage(seedRecord());
    const store = createPersistedGameStore({ getStorage: () => storage });
    const s = store.getState();
    expect(s.homeTeam.name).toBe("Seeded Home");
    expect(s.status).toBe("live");
    expect(s.currentPeriod).toBe(2);
    expect(s.possession).toBe("home");
  });

  it("restores the clock from the checkpoint and forces it paused", () => {
    const storage = seededStorage({ ...seedRecord(), clockRunning: true });
    storage.setItem(
      CLOCK_CHECKPOINT_KEY,
      JSON.stringify({
        schemaVersion: 1,
        clockSeconds: 271,
        breakSeconds: 12,
        savedAt: 0,
      }),
    );
    const store = createPersistedGameStore({ getStorage: () => storage });
    expect(store.getState().clockSeconds).toBe(271);
    expect(store.getState().breakSeconds).toBe(12);
    expect(store.getState().clockRunning).toBe(false);
  });

  it("falls back to the period length when no checkpoint is stored", () => {
    const storage = seededStorage(seedRecord());
    const store = createPersistedGameStore({ getStorage: () => storage });
    expect(store.getState().clockSeconds).toBe(
      DEFAULT_SETTINGS["5v5"].periodSeconds,
    );
    expect(store.getState().breakSeconds).toBe(0);
  });

  it("restores possessionArrow, defaulting to 'unset' for older records", () => {
    const withArrow = createPersistedGameStore({
      getStorage: () => seededStorage({ ...seedRecord(), possessionArrow: "away" }),
    });
    expect(withArrow.getState().possessionArrow).toBe("away");

    const legacy = createPersistedGameStore({
      getStorage: () => seededStorage(seedRecord()),
    });
    expect(legacy.getState().possessionArrow).toBe("unset");
  });

  it("clears an invalid record and notifies the recovery banner", () => {
    const storage = seededStorage({ ...seedRecord(), schemaVersion: 2 });
    storage.setItem(CLOCK_CHECKPOINT_KEY, "{}");
    const cb = vi.fn();
    const unsub = subscribeRecoveryFailed(cb);
    const store = createPersistedGameStore({ getStorage: () => storage });
    expect(store.getState().status).toBe("setup");
    expect(storage.getItem(GAME_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(CLOCK_CHECKPOINT_KEY)).toBeNull();
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("writes the partialized record (without live clock fields) on change", () => {
    const storage = createMemoryStorage();
    const store = createPersistedGameStore({ getStorage: () => storage });
    store.getState().setTeam("home", { name: "Written" });
    const raw = storage.getItem(GAME_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const { state } = JSON.parse(raw ?? "{}") as {
      state: Record<string, unknown>;
    };
    expect(state.schemaVersion).toBe(1);
    expect((state.homeTeam as { name: string }).name).toBe("Written");
    expect(state).not.toHaveProperty("clockSeconds");
    expect(state).not.toHaveProperty("clockRunning");
  });

  it("keeps working in memory when storage is unavailable", () => {
    const store = createPersistedGameStore({ getStorage: () => null });
    store.getState().setTeam("home", { name: "In Memory" });
    expect(store.getState().homeTeam.name).toBe("In Memory");
  });

  it("hydrateFromLibrary reads the clock checkpoint from storage", () => {
    const storage = createMemoryStorage();
    const store = createPersistedGameStore({ getStorage: () => storage });
    storage.setItem(
      CLOCK_CHECKPOINT_KEY,
      JSON.stringify({
        schemaVersion: 1,
        clockSeconds: 42,
        breakSeconds: 0,
        savedAt: 0,
      }),
    );
    const result = store.getState().hydrateFromLibrary({
      schemaVersion: 1,
      homeTeam: store.getState().homeTeam,
      awayTeam: store.getState().awayTeam,
      settings: DEFAULT_SETTINGS["5v5"],
      status: "live",
      currentPeriod: 3,
      events: [],
      possession: null,
      onCourt: { home: [], away: [] },
    });
    expect(result).toEqual({ ok: true });
    expect(store.getState().clockSeconds).toBe(42);
    expect(store.getState().currentPeriod).toBe(3);
  });
});
