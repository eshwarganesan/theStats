/**
 * Tests for `store.hydrateFromLibrary` (feature 009-account-library, US3).
 * Exercised on the unwrapped store (no persist middleware) — the same
 * reducer runs in production; persist only changes how state is written
 * to localStorage, not how the reducer transitions.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, PLAYERS_ON_COURT } from "@thestats/core";
import type { PersistedGameRecord } from "./persistence";
import { createGameStore } from "./store";

const useGameStore = createGameStore();
const get = () => useGameStore.getState();

beforeEach(() => {
  useGameStore.getState().resetAll();
});

function makeRecord(
  overrides: Partial<PersistedGameRecord> = {},
): PersistedGameRecord {
  return {
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
    settings: DEFAULT_SETTINGS["5v5"],
    status: "live",
    currentPeriod: 3,
    events: [],
    possession: "home",
    possessionArrow: "home",
    onCourt: { home: [], away: [] },
    ...overrides,
  };
}

/** Seed a minimal in-progress state so status !== 'setup' triggers the guard. */
function seedLiveGame(): void {
  const s = get();
  for (const side of ["home", "away"] as const) {
    for (let i = 0; i < PLAYERS_ON_COURT["5v5"]; i++) {
      s.addPlayer(side, {
        number: String(i + 1),
        name: `${side}-${i + 1}`,
        isStarter: true,
        isCaptain: false,
      });
    }
  }
  s.prepareGame();
  s.startGame();
}

describe("hydrateFromLibrary", () => {
  it("replaces the persisted slice with the incoming record", () => {
    const record = makeRecord({ currentPeriod: 4 });
    const result = get().hydrateFromLibrary(record);
    expect(result).toEqual({ ok: true });
    const s = get();
    expect(s.homeTeam.name).toBe("Central High");
    expect(s.awayTeam.name).toBe("Eastridge");
    expect(s.status).toBe("live");
    expect(s.currentPeriod).toBe(4);
    expect(s.possession).toBe("home");
    expect(s.possessionArrow).toBe("home");
  });

  it("forces the clock and break countdown to paused on hydrate", () => {
    // Simulate a currently-running clock via startClock().
    seedLiveGame();
    get().startClock();
    expect(get().clockRunning).toBe(true);

    // Now hydrate — the incoming record's status is 'live'; the guard
    // rejects because our current status is 'live' too, unless we force.
    const record = makeRecord();
    const result = get().hydrateFromLibrary(record, { force: true });
    expect(result).toEqual({ ok: true });
    expect(get().clockRunning).toBe(false);
    expect(get().breakSeconds).toBe(0);
  });

  it("rejects hydration when the local game is not on the setup screen and force is not set", () => {
    seedLiveGame();
    const before = get().status;
    expect(before).not.toBe("setup");

    const result = get().hydrateFromLibrary(makeRecord());
    expect(result).toEqual({ ok: false, reason: "local_game_present" });
    // State unchanged.
    expect(get().status).toBe(before);
  });

  it("allows hydration from the setup screen without force", () => {
    // Fresh store — starts on 'setup'.
    expect(get().status).toBe("setup");
    const result = get().hydrateFromLibrary(makeRecord({ status: "live" }));
    expect(result).toEqual({ ok: true });
    expect(get().status).toBe("live");
  });

  it("allows hydration from a finished game without force", () => {
    seedLiveGame();
    // Force our local state into 'finished' to simulate the review scenario.
    // finishGame() may have preconditions — use a direct set via the store
    // interface it exposes.
    useGameStore.setState({ status: "finished" });
    expect(get().status).toBe("finished");

    const result = get().hydrateFromLibrary(makeRecord({ status: "live" }));
    expect(result).toEqual({ ok: true });
    expect(get().status).toBe("live");
  });

  it("falls back to 'unset' possessionArrow when the record lacks the field", () => {
    const rec = makeRecord();
    delete (rec as Partial<PersistedGameRecord>).possessionArrow;
    get().hydrateFromLibrary(rec);
    expect(get().possessionArrow).toBe("unset");
  });
});
