/**
 * Failing-first tests for the persist middleware integration.
 *
 * Driven through the persistence module + a fresh module-graph import of
 * `./store` per test so the `persist` middleware re-runs hydration each
 * time. We seed `localStorage` BEFORE the import (the only point at which
 * persist reads it) and assert the rehydrated store reflects the seed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLOCK_CHECKPOINT_KEY,
  GAME_STORAGE_KEY,
} from "./persistence";
import type * as persistenceModule from "./persistence";
import { DEFAULT_SETTINGS } from "@thestats/core";

beforeEach(() => {
  localStorage.clear();
  // Reset the module graph so the `persist` middleware re-hydrates from
  // the current localStorage on the next `import("./store")`.
  vi.resetModules();
});

afterEach(() => {
  localStorage.clear();
});

const seedRecord = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  homeTeam: {
    id: "home-1",
    name: "Seeded Home",
    tag: "SED",
    color: "#3B82F6",
    coach: "",
    roster: [
      { id: "p1", number: "1", name: "One", isStarter: true, isCaptain: false },
      { id: "p2", number: "2", name: "Two", isStarter: true, isCaptain: false },
      { id: "p3", number: "3", name: "Three", isStarter: true, isCaptain: false },
      { id: "p4", number: "4", name: "Four", isStarter: true, isCaptain: false },
      { id: "p5", number: "5", name: "Five", isStarter: true, isCaptain: false },
    ],
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
  events: [
    {
      type: "score",
      id: "ev-1",
      timestamp: 100,
      period: 1,
      clockAt: 540,
      side: "home",
      playerId: "p1",
      kind: "2pt",
      made: true,
    },
  ],
  possession: "home",
  onCourt: { home: ["p1", "p2", "p3", "p4", "p5"], away: [] },
  ...overrides,
});

async function loadStore() {
  const mod = await import("./store");
  return mod.useGameStore;
}

describe("store rehydration from persisted record", () => {
  it("restores partialized fields onto the live store", async () => {
    localStorage.setItem(
      GAME_STORAGE_KEY,
      JSON.stringify({ state: seedRecord(), version: 1 }),
    );
    const useGameStore = await loadStore();
    const s = useGameStore.getState();
    expect(s.homeTeam.name).toBe("Seeded Home");
    expect(s.currentPeriod).toBe(2);
    expect(s.status).toBe("live");
    expect(s.possession).toBe("home");
    expect(s.events).toHaveLength(1);
    expect(s.onCourt.home).toHaveLength(5);
  });

  it("forces clockRunning to false on rehydrate even if seed had it true", async () => {
    localStorage.setItem(
      GAME_STORAGE_KEY,
      JSON.stringify({
        state: { ...seedRecord(), clockRunning: true },
        version: 1,
      }),
    );
    const useGameStore = await loadStore();
    expect(useGameStore.getState().clockRunning).toBe(false);
  });

  it("reads the clock checkpoint into clockSeconds and breakSeconds", async () => {
    localStorage.setItem(
      GAME_STORAGE_KEY,
      JSON.stringify({ state: seedRecord(), version: 1 }),
    );
    localStorage.setItem(
      CLOCK_CHECKPOINT_KEY,
      JSON.stringify({
        schemaVersion: 1,
        clockSeconds: 271,
        breakSeconds: 0,
        savedAt: 12345,
      }),
    );
    const useGameStore = await loadStore();
    expect(useGameStore.getState().clockSeconds).toBe(271);
    expect(useGameStore.getState().breakSeconds).toBe(0);
  });

  it("falls back to defaults when the clock checkpoint is missing or malformed", async () => {
    localStorage.setItem(
      GAME_STORAGE_KEY,
      JSON.stringify({ state: seedRecord(), version: 1 }),
    );
    localStorage.setItem(CLOCK_CHECKPOINT_KEY, "{not json");
    const useGameStore = await loadStore();
    // periodSeconds default for 5v5
    expect(useGameStore.getState().clockSeconds).toBe(
      DEFAULT_SETTINGS["5v5"].periodSeconds,
    );
    expect(useGameStore.getState().breakSeconds).toBe(0);
  });

  it("falls back to initial state and clears storage on corrupted record", async () => {
    localStorage.setItem(
      GAME_STORAGE_KEY,
      JSON.stringify({ state: { schemaVersion: 999 }, version: 1 }),
    );
    localStorage.setItem(CLOCK_CHECKPOINT_KEY, "some-orphan");
    const useGameStore = await loadStore();
    expect(useGameStore.getState().status).toBe("setup");
    expect(useGameStore.getState().events).toEqual([]);
    // Corrupted record gets cleaned up so we don't keep tripping the same
    // error on every load.
    expect(localStorage.getItem(GAME_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(CLOCK_CHECKPOINT_KEY)).toBeNull();
  });

  it("guards against bad JSON at the storage layer (FR-008)", async () => {
    // Set a raw payload that isn't valid JSON. The guarded storage
    // wrapper must catch this before Zustand's createJSONStorage throws,
    // clear both keys, and let the app boot at initial state.
    localStorage.setItem(GAME_STORAGE_KEY, "{not json");
    localStorage.setItem(CLOCK_CHECKPOINT_KEY, "also-bad");
    const useGameStore = await loadStore();
    expect(useGameStore.getState().status).toBe("setup");
    // The bad payload must be gone — leaving it in place would re-fire
    // the same failure on every reload.
    expect(localStorage.getItem(GAME_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(CLOCK_CHECKPOINT_KEY)).toBeNull();
  });
});

describe("possessionArrow persistence round-trip (feature 007)", () => {
  it("restores possessionArrow from a seeded record", async () => {
    localStorage.setItem(
      GAME_STORAGE_KEY,
      JSON.stringify({
        state: { ...seedRecord(), possessionArrow: "away" },
        version: 1,
      }),
    );
    const useGameStore = await loadStore();
    expect(useGameStore.getState().possessionArrow).toBe("away");
  });

  it("defaults possessionArrow to 'unset' when the persisted record lacks the field (backward compatibility)", async () => {
    // A record from before feature 007 — no possessionArrow key at all.
    localStorage.setItem(
      GAME_STORAGE_KEY,
      JSON.stringify({ state: seedRecord(), version: 1 }),
    );
    const useGameStore = await loadStore();
    expect(useGameStore.getState().possessionArrow).toBe("unset");
  });

  it("writes possessionArrow into the persisted payload after a select action", async () => {
    const useGameStore = await loadStore();
    useGameStore.getState().setPossessionArrow("away");
    const raw = localStorage.getItem(GAME_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as { state: Record<string, unknown> };
    expect(parsed.state.possessionArrow).toBe("away");
  });
});

describe("noop storage fallback when localStorage is unavailable", () => {
  it("keeps the store functional via the in-memory noop storage", async () => {
    // Force the storage factory to return the noop adapter via vi.doMock
    // so the store's `./persistence` import resolves to the mocked
    // module on fresh load.
    vi.doMock("./persistence", async () => {
      const actual =
        await vi.importActual<typeof persistenceModule>("./persistence");
      return { ...actual, isStorageAvailable: () => false };
    });
    vi.resetModules();
    const useGameStore = await loadStore();
    useGameStore.getState().setTeam("home", { name: "Memory-Only" });
    // The store still mutates correctly — the noop storage layer just
    // swallows writes. The state lives in memory only.
    expect(useGameStore.getState().homeTeam.name).toBe("Memory-Only");
    vi.doUnmock("./persistence");
  });
});

describe("onRehydrateStorage post-hook", () => {
  it("re-asserts clockRunning=false even if it somehow slipped through merge", async () => {
    // Seed the persisted record with clockRunning intentionally
    // injected — partialize never writes it, but a hand-crafted
    // payload could. The onRehydrateStorage hook is the defense.
    localStorage.setItem(
      GAME_STORAGE_KEY,
      JSON.stringify({
        state: { ...seedRecord(), clockRunning: true },
        version: 1,
      }),
    );
    const useGameStore = await loadStore();
    expect(useGameStore.getState().clockRunning).toBe(false);
  });
});

describe("partialize — what gets written", () => {
  it("does NOT write clockSeconds, breakSeconds, or clockRunning", async () => {
    const useGameStore = await loadStore();
    // Trigger any state change to flush the partialize write.
    useGameStore.getState().setTeam("home", { name: "Edited" });
    const raw = localStorage.getItem(GAME_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    const state = parsed.state;
    expect(state).not.toHaveProperty("clockSeconds");
    expect(state).not.toHaveProperty("breakSeconds");
    expect(state).not.toHaveProperty("clockRunning");
  });

  it("writes the schemaVersion field", async () => {
    const useGameStore = await loadStore();
    useGameStore.getState().setTeam("home", { name: "Edited" });
    const raw = localStorage.getItem(GAME_STORAGE_KEY);
    const parsed = JSON.parse(raw!);
    expect(parsed.state.schemaVersion).toBe(1);
  });
});

describe("createGameStore factory (test entry point)", () => {
  it("returns an unwrapped store independent of localStorage", async () => {
    const mod = await import("./store");
    const factory = mod.createGameStore;
    expect(typeof factory).toBe("function");
    const local = factory();
    local.getState().setTeam("home", { name: "Factory Test" });
    // The factory store mutates in-memory only; nothing about it should
    // land in localStorage.
    expect(localStorage.getItem(GAME_STORAGE_KEY)).toBeNull();
    expect(local.getState().homeTeam.name).toBe("Factory Test");
  });
});

