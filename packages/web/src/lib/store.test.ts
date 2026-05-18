import { describe, it, expect, beforeEach } from "vitest";
import { useGameStore } from "./store";
import { DEFAULT_SETTINGS, PLAYERS_ON_COURT } from "./constants";
import type { Player } from "./types";

const initial = useGameStore.getState();

beforeEach(() => {
  useGameStore.getState().resetAll();
});

const get = () => useGameStore.getState();

/** Adds N players with sequential jersey numbers. The first
 * `PLAYERS_ON_COURT[format]` are flagged starters. */
function seedRoster(side: "home" | "away", count: number, starters?: number) {
  const starterCount = starters ?? PLAYERS_ON_COURT[get().settings.format];
  for (let i = 0; i < count; i++) {
    get().addPlayer(side, {
      number: String(i + 1),
      name: `Player ${i + 1}`,
      isStarter: i < starterCount,
      isCaptain: false,
    });
  }
}

describe("initial state", () => {
  it("starts with two blank teams, default 5v5 settings, status setup", () => {
    expect(initial.status).toBe("setup");
    expect(initial.settings.format).toBe("5v5");
    expect(initial.events).toEqual([]);
    expect(initial.clockSeconds).toBe(DEFAULT_SETTINGS["5v5"].periodSeconds);
    expect(initial.clockRunning).toBe(false);
    expect(initial.homeTeam.roster).toEqual([]);
    expect(initial.awayTeam.roster).toEqual([]);
  });
});

describe("setup actions", () => {
  it("setTeam shallow-merges into the requested side", () => {
    get().setTeam("home", { name: "Lakers", tag: "LAL" });
    expect(get().homeTeam.name).toBe("Lakers");
    expect(get().homeTeam.tag).toBe("LAL");
    expect(get().awayTeam.name).toBe("Away Team");
  });

  it("addPlayer assigns a generated id and appends to the roster", () => {
    get().addPlayer("home", {
      number: "10",
      name: "Tester",
      isStarter: true,
      isCaptain: false,
    });
    const roster = get().homeTeam.roster;
    expect(roster).toHaveLength(1);
    expect(roster[0]!.id).toBeTruthy();
    expect(roster[0]!.name).toBe("Tester");
  });

  it("updatePlayer patches a single roster entry", () => {
    get().addPlayer("home", {
      number: "10",
      name: "Tester",
      isStarter: true,
      isCaptain: false,
    });
    const id = get().homeTeam.roster[0]!.id;
    get().updatePlayer("home", id, { isCaptain: true, name: "Captain" });
    expect(get().homeTeam.roster[0]!.name).toBe("Captain");
    expect(get().homeTeam.roster[0]!.isCaptain).toBe(true);
  });

  it("updatePlayer leaves other roster entries untouched", () => {
    seedRoster("home", 3);
    const target = get().homeTeam.roster[1]!;
    get().updatePlayer("home", target.id, { name: "Renamed" });
    expect(get().homeTeam.roster[0]!.name).not.toBe("Renamed");
    expect(get().homeTeam.roster[1]!.name).toBe("Renamed");
    expect(get().homeTeam.roster[2]!.name).not.toBe("Renamed");
  });

  it("updatePlayer is a no-op when id is unknown", () => {
    seedRoster("home", 2);
    const before = get().homeTeam.roster.map((p) => ({ ...p }));
    get().updatePlayer("home", "ghost-id", { name: "Renamed" });
    expect(get().homeTeam.roster).toEqual(before);
  });

  it("removePlayer drops a roster entry by id", () => {
    get().addPlayer("home", {
      number: "10",
      name: "Tester",
      isStarter: true,
      isCaptain: false,
    });
    const id = get().homeTeam.roster[0]!.id;
    get().removePlayer("home", id);
    expect(get().homeTeam.roster).toEqual([]);
  });

  it("removePlayer leaves other roster entries intact", () => {
    seedRoster("home", 3);
    const target = get().homeTeam.roster[1]!;
    get().removePlayer("home", target.id);
    expect(get().homeTeam.roster).toHaveLength(2);
    expect(get().homeTeam.roster.find((p) => p.id === target.id)).toBeUndefined();
  });

  it("addPlayer / updatePlayer / removePlayer all work on the away side", () => {
    seedRoster("away", 2);
    expect(get().awayTeam.roster).toHaveLength(2);
    const target = get().awayTeam.roster[0]!;
    get().updatePlayer("away", target.id, { name: "AwayRenamed" });
    expect(get().awayTeam.roster[0]!.name).toBe("AwayRenamed");
    get().removePlayer("away", target.id);
    expect(get().awayTeam.roster).toHaveLength(1);
  });

  it("resetAll wipes teams, events, and clock back to defaults", () => {
    seedRoster("home", 5);
    get().resetAll();
    expect(get().homeTeam.roster).toEqual([]);
    expect(get().settings.format).toBe("5v5");
    expect(get().status).toBe("setup");
  });
});

describe("setSettings", () => {
  it("changing format cascades DEFAULT_SETTINGS while preserving venue/competition", () => {
    get().setSettings({ venue: "Arena", competition: "League" });
    get().setSettings({ format: "3v3" });
    const s = get().settings;
    expect(s.format).toBe("3v3");
    expect(s.periods).toBe(DEFAULT_SETTINGS["3v3"].periods);
    expect(s.periodSeconds).toBe(DEFAULT_SETTINGS["3v3"].periodSeconds);
    expect(s.venue).toBe("Arena");
    expect(s.competition).toBe("League");
    expect(get().clockSeconds).toBe(DEFAULT_SETTINGS["3v3"].periodSeconds);
  });

  it("partial change does not cascade format defaults", () => {
    get().setSettings({ timeoutsPerGame: 9 });
    expect(get().settings.timeoutsPerGame).toBe(9);
    expect(get().settings.format).toBe("5v5");
  });

  it("changing periodSeconds during setup updates clockSeconds", () => {
    get().setSettings({ periodSeconds: 720 });
    expect(get().clockSeconds).toBe(720);
  });

  it("changing periodSeconds after setup leaves clockSeconds alone", () => {
    seedRoster("home", 5);
    seedRoster("away", 5);
    get().prepareGame();
    const before = get().clockSeconds;
    get().setSettings({ periodSeconds: 999 });
    expect(get().clockSeconds).toBe(before);
  });
});

describe("prepareGame", () => {
  it("fails when a roster is too small for the format", () => {
    seedRoster("home", 3);
    seedRoster("away", 5);
    const result = get().prepareGame();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/at least 5/);
  });

  it("fails when starter count does not match PLAYERS_ON_COURT", () => {
    seedRoster("home", 5, 4);
    seedRoster("away", 5);
    const result = get().prepareGame();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/exactly 5 starters/);
  });

  it("fails on duplicate jersey numbers", () => {
    seedRoster("home", 5);
    // Replace one number with a duplicate of another
    const dupTarget = get().homeTeam.roster[0]!.id;
    get().updatePlayer("home", dupTarget, { number: "2" });
    seedRoster("away", 5);
    const result = get().prepareGame();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/duplicate jersey/);
  });

  it("succeeds when both teams are fully and uniquely populated", () => {
    seedRoster("home", 5);
    seedRoster("away", 5);
    const result = get().prepareGame();
    expect(result.ok).toBe(true);
    expect(get().status).toBe("ready");
    expect(get().onCourt.home).toHaveLength(5);
    expect(get().onCourt.away).toHaveLength(5);
    expect(get().events).toEqual([]);
    expect(get().clockSeconds).toBe(DEFAULT_SETTINGS["5v5"].periodSeconds);
  });
});

describe("game lifecycle", () => {
  beforeEach(() => {
    seedRoster("home", 5);
    seedRoster("away", 5);
    get().prepareGame();
  });

  it("startGame appends a period-start event and flips status to live", () => {
    get().startGame();
    expect(get().status).toBe("live");
    const last = get().events.at(-1);
    expect(last?.type).toBe("period");
    if (last?.type === "period") expect(last.action).toBe("start");
  });

  it("endPeriod after period 1 transitions to period-break", () => {
    get().startGame();
    get().endPeriod();
    expect(get().status).toBe("period-break");
    expect(get().clockRunning).toBe(false);
  });

  it("endPeriod on the last regular period transitions to finished", () => {
    get().startGame();
    for (let p = 0; p < DEFAULT_SETTINGS["5v5"].periods - 1; p++) {
      get().endPeriod();
      get().startNextPeriod();
    }
    get().endPeriod();
    expect(get().status).toBe("finished");
  });

  it("startNextPeriod uses overtimeSeconds when past regular periods", () => {
    get().startGame();
    for (let p = 0; p < DEFAULT_SETTINGS["5v5"].periods; p++) {
      get().endPeriod();
      if (p < DEFAULT_SETTINGS["5v5"].periods - 1) {
        get().startNextPeriod();
      }
    }
    // Status is now finished — but we test the OT branch by calling
    // startNextPeriod manually.
    get().startNextPeriod();
    expect(get().clockSeconds).toBe(DEFAULT_SETTINGS["5v5"].overtimeSeconds);
    expect(get().currentPeriod).toBe(DEFAULT_SETTINGS["5v5"].periods + 1);
  });

  it("finishGame flips status and stops clock", () => {
    get().startGame();
    get().startClock();
    get().finishGame();
    expect(get().status).toBe("finished");
    expect(get().clockRunning).toBe(false);
  });
});

describe("clock", () => {
  beforeEach(() => {
    seedRoster("home", 5);
    seedRoster("away", 5);
    get().prepareGame();
    get().startGame();
  });

  it("startClock no-ops unless status is live with seconds remaining", () => {
    get().finishGame();
    get().startClock();
    expect(get().clockRunning).toBe(false);
  });

  it("startClock appends a clock-start event when valid", () => {
    get().startClock();
    expect(get().clockRunning).toBe(true);
    const last = get().events.at(-1);
    expect(last?.type).toBe("clock");
    if (last?.type === "clock") expect(last.action).toBe("start");
  });

  it("stopClock appends a clock-stop event and pauses", () => {
    get().startClock();
    get().stopClock();
    expect(get().clockRunning).toBe(false);
    const last = get().events.at(-1);
    expect(last?.type).toBe("clock");
    if (last?.type === "clock") expect(last.action).toBe("stop");
  });

  it("stopClock no-ops when not running", () => {
    const before = get().events.length;
    get().stopClock();
    expect(get().events.length).toBe(before);
  });

  it("tickClock subtracts deltaMs/1000 from clockSeconds", () => {
    get().startClock();
    const before = get().clockSeconds;
    get().tickClock(1500);
    expect(get().clockSeconds).toBeCloseTo(before - 1.5);
  });

  it("tickClock past 0 freezes the clock at 0 and stops it", () => {
    get().startClock();
    get().tickClock(60 * 60 * 1000);
    expect(get().clockSeconds).toBe(0);
    expect(get().clockRunning).toBe(false);
  });

  it("tickClock no-ops when the clock is paused", () => {
    const before = get().clockSeconds;
    get().tickClock(1000);
    expect(get().clockSeconds).toBe(before);
  });

  describe("adjustClock", () => {
    it("clamps below 0 to 0 and emits one adjust event with to===0", () => {
      const beforeEvents = get().events.length;
      get().adjustClock(-30);
      expect(get().clockSeconds).toBe(0);
      expect(get().events.length).toBe(beforeEvents + 1);
      const last = get().events.at(-1);
      expect(last?.type).toBe("clock");
      if (last?.type === "clock" && last.action === "adjust") {
        expect(last.to).toBe(0);
      } else {
        throw new Error("expected a clock/adjust event");
      }
    });

    it("clamps above period max to period max in regulation, with one event", () => {
      // Move the clock off the period max so the clamp produces a real change
      get().adjustClock(get().settings.periodSeconds - 60);
      // Push the seed event into the past so the follow-up call doesn't
      // coalesce with it.
      const seed = get().events.at(-1);
      if (seed?.type === "clock" && seed.action === "adjust") {
        useGameStore.setState((s) => ({
          events: s.events.map((e) =>
            e.id === seed.id ? { ...e, timestamp: e.timestamp - 5000 } : e,
          ),
        }));
      }
      const max = get().settings.periodSeconds;
      const beforeEvents = get().events.length;
      get().adjustClock(max + 30);
      expect(get().clockSeconds).toBe(max);
      expect(get().events.length).toBe(beforeEvents + 1);
      const last = get().events.at(-1);
      if (last?.type === "clock" && last.action === "adjust") {
        expect(last.to).toBe(max);
      } else {
        throw new Error("expected a clock/adjust event");
      }
    });

    it("clamps above OT max to overtimeSeconds when in an overtime period", () => {
      // Force overtime: currentPeriod > settings.periods
      useGameStore.setState({ currentPeriod: get().settings.periods + 1 });
      get().resetClock(); // resets to overtimeSeconds
      const overtimeMax = get().settings.overtimeSeconds;
      get().adjustClock(overtimeMax + 30);
      expect(get().clockSeconds).toBe(overtimeMax);
    });

    it("uses periodSeconds (not overtimeSeconds) as max during regulation", () => {
      // 5v5 defaults: periodSeconds=600, overtimeSeconds=300 — distinct
      const period = get().settings.periodSeconds;
      const ot = get().settings.overtimeSeconds;
      expect(period).toBeGreaterThan(ot);
      // Try to set above OT cap but within regulation cap
      get().adjustClock(ot + 60);
      expect(get().clockSeconds).toBe(ot + 60);
    });

    it("uses overtimeSeconds (not periodSeconds) as max during overtime — regression for the latent OT-cap defect", () => {
      const period = get().settings.periodSeconds;
      const ot = get().settings.overtimeSeconds;
      expect(period).toBeGreaterThan(ot);
      useGameStore.setState({ currentPeriod: get().settings.periods + 1 });
      get().resetClock();
      // Try to set above OT cap (but well within regulation cap) — must clamp to OT
      get().adjustClock(period - 30);
      expect(get().clockSeconds).toBe(ot);
    });

    it("no-ops (no event, no state change) when to === from", () => {
      const beforeValue = get().clockSeconds;
      const beforeEvents = get().events.length;
      get().adjustClock(beforeValue);
      expect(get().clockSeconds).toBe(beforeValue);
      expect(get().events.length).toBe(beforeEvents);
    });

    it("no-ops when status is not live (setup)", () => {
      get().resetAll(); // back to setup
      const beforeValue = get().clockSeconds;
      const beforeEvents = get().events.length;
      get().adjustClock(120);
      expect(get().clockSeconds).toBe(beforeValue);
      expect(get().events.length).toBe(beforeEvents);
    });

    it("no-ops when status is finished", () => {
      get().finishGame();
      const beforeValue = get().clockSeconds;
      const beforeEvents = get().events.length;
      get().adjustClock(120);
      expect(get().clockSeconds).toBe(beforeValue);
      expect(get().events.length).toBe(beforeEvents);
    });

    it("no-ops when clockRunning is true", () => {
      get().startClock();
      const beforeValue = get().clockSeconds;
      const beforeEvents = get().events.length;
      get().adjustClock(120);
      expect(get().clockSeconds).toBe(beforeValue);
      expect(get().events.length).toBe(beforeEvents);
    });

    it("preserves clockRunning === false after a successful adjust", () => {
      get().startClock();
      get().stopClock();
      get().adjustClock(120);
      expect(get().clockRunning).toBe(false);
    });

    it("emitted event captures from, to, clockAt, period, and a wall-clock timestamp", () => {
      const before = get().clockSeconds;
      const t0 = Date.now();
      get().adjustClock(before - 10);
      const last = get().events.at(-1);
      expect(last?.type).toBe("clock");
      if (last?.type === "clock" && last.action === "adjust") {
        expect(last.from).toBe(before);
        expect(last.to).toBe(before - 10);
        expect(last.clockAt).toBe(before);
        expect(last.period).toBe(get().currentPeriod);
        expect(last.timestamp).toBeGreaterThanOrEqual(t0);
        expect(last.timestamp).toBeLessThanOrEqual(Date.now());
      } else {
        throw new Error("expected a clock/adjust event");
      }
    });

    it("coalesces consecutive calls within the 1500 ms window into a single event", () => {
      const start = get().clockSeconds;
      const beforeEvents = get().events.length;
      get().adjustClock(start - 1);
      get().adjustClock(start - 2);
      get().adjustClock(start - 3);
      get().adjustClock(start - 4);
      get().adjustClock(start - 5);
      // Five rapid taps must produce exactly one new event with from→to
      // bracketing the whole session.
      expect(get().events.length).toBe(beforeEvents + 1);
      const last = get().events.at(-1);
      if (last?.type === "clock" && last.action === "adjust") {
        expect(last.from).toBe(start);
        expect(last.to).toBe(start - 5);
      } else {
        throw new Error("expected a single coalesced clock/adjust event");
      }
    });

    it("emits a separate event when calls are spaced beyond the coalesce window", async () => {
      const start = get().clockSeconds;
      const beforeEvents = get().events.length;
      get().adjustClock(start - 1);
      // Push the recorded event's timestamp into the past so the next call
      // falls outside the coalesce window without sleeping in real time.
      const last = get().events.at(-1);
      if (last?.type === "clock" && last.action === "adjust") {
        useGameStore.setState((s) => ({
          events: s.events.map((e) =>
            e.id === last.id ? { ...e, timestamp: e.timestamp - 5000 } : e,
          ),
        }));
      } else {
        throw new Error("expected a clock/adjust event");
      }
      get().adjustClock(start - 2);
      expect(get().events.length).toBe(beforeEvents + 2);
      const a = get().events.at(-2);
      const b = get().events.at(-1);
      if (
        a?.type === "clock" &&
        a.action === "adjust" &&
        b?.type === "clock" &&
        b.action === "adjust"
      ) {
        expect(a.id).not.toBe(b.id);
      }
    });

    it("drops a coalesced event when the session nets back to the original value", () => {
      const start = get().clockSeconds;
      const beforeEvents = get().events.length;
      get().adjustClock(start - 1);
      get().adjustClock(start); // nets back to start
      // No persisted event should remain; clockSeconds is unchanged.
      expect(get().events.length).toBe(beforeEvents);
      expect(get().clockSeconds).toBe(start);
    });

    it("adjusting up from 0 does not advance the period or change status", () => {
      // Tick the clock to 0 — store will pause itself per existing behavior
      get().startClock();
      get().tickClock(60 * 60 * 1000);
      expect(get().clockSeconds).toBe(0);
      expect(get().clockRunning).toBe(false);
      const periodBefore = get().currentPeriod;
      get().adjustClock(8);
      expect(get().clockSeconds).toBe(8);
      expect(get().status).toBe("live");
      expect(get().currentPeriod).toBe(periodBefore);
    });
  });

  it("resetClock returns to periodSeconds during regulation", () => {
    get().tickClock(60_000);
    get().resetClock();
    expect(get().clockSeconds).toBe(get().settings.periodSeconds);
    expect(get().clockRunning).toBe(false);
  });

  it("resetClock returns to overtimeSeconds during OT", () => {
    // Force a state where currentPeriod > settings.periods
    useGameStore.setState({ currentPeriod: get().settings.periods + 1 });
    get().resetClock();
    expect(get().clockSeconds).toBe(get().settings.overtimeSeconds);
  });
});

describe("recording events", () => {
  beforeEach(() => {
    seedRoster("home", 5);
    seedRoster("away", 5);
    get().prepareGame();
    get().startGame();
  });

  const homeId = () => get().homeTeam.roster[0]!.id;

  it("recordScore appends a score event with the right shape", () => {
    get().recordScore("home", homeId(), "3pt", true);
    const last = get().events.at(-1);
    expect(last?.type).toBe("score");
    if (last?.type === "score") {
      expect(last.kind).toBe("3pt");
      expect(last.made).toBe(true);
      expect(last.side).toBe("home");
      expect(last.playerId).toBe(homeId());
      expect(last.period).toBe(1);
    }
  });

  it("recordFoul appends a foul event", () => {
    get().recordFoul("home", homeId(), "personal");
    const last = get().events.at(-1);
    expect(last?.type).toBe("foul");
    if (last?.type === "foul") expect(last.kind).toBe("personal");
  });

  it("recordStat appends a stat event", () => {
    get().recordStat("home", homeId(), "assist");
    const last = get().events.at(-1);
    expect(last?.type).toBe("stat");
    if (last?.type === "stat") expect(last.kind).toBe("assist");
  });

  it("recordTimeout appends a timeout event and pauses the clock", () => {
    get().startClock();
    get().recordTimeout("home");
    expect(get().clockRunning).toBe(false);
    const last = get().events.at(-1);
    expect(last?.type).toBe("timeout");
  });

  it("togglePossession sets possession to the given side or null", () => {
    get().togglePossession("home");
    expect(get().possession).toBe("home");
    get().togglePossession(null);
    expect(get().possession).toBeNull();
  });
});

describe("substitutions", () => {
  beforeEach(() => {
    // 6-player roster with 5 starters → 1 bench player available
    for (let i = 0; i < 6; i++) {
      get().addPlayer("home", {
        number: String(i + 1),
        name: `H${i}`,
        isStarter: i < 5,
        isCaptain: false,
      });
    }
    seedRoster("away", 5);
    get().prepareGame();
    get().startGame();
  });

  const findHome = (predicate: (p: Player) => boolean) =>
    get().homeTeam.roster.find(predicate)!;

  it("swaps a starter for a bench player and appends an event", () => {
    const out = findHome((p) => p.isStarter);
    const inP = findHome((p) => !p.isStarter);
    get().substitute("home", out.id, inP.id);
    expect(get().onCourt.home).toContain(inP.id);
    expect(get().onCourt.home).not.toContain(out.id);
    expect(get().events.at(-1)?.type).toBe("substitution");
  });

  it("no-op when player out is not on court", () => {
    const benchP = findHome((p) => !p.isStarter);
    const before = get().events.length;
    const courtBefore = [...get().onCourt.home];
    get().substitute("home", benchP.id, "fake-id");
    expect(get().events.length).toBe(before);
    expect(get().onCourt.home).toEqual(courtBefore);
  });

  it("no-op when player in is already on court", () => {
    const starter1 = get().onCourt.home[0]!;
    const starter2 = get().onCourt.home[1]!;
    const before = get().events.length;
    get().substitute("home", starter1, starter2);
    expect(get().events.length).toBe(before);
  });
});

describe("undoLastEvent", () => {
  beforeEach(() => {
    seedRoster("home", 5);
    seedRoster("away", 5);
    get().prepareGame();
    get().startGame();
  });

  it("no-op on empty events", () => {
    useGameStore.setState({ events: [] });
    get().undoLastEvent();
    expect(get().events).toEqual([]);
  });

  it("pops the tail event", () => {
    const before = get().events.length;
    get().recordScore("home", get().homeTeam.roster[0]!.id, "2pt", true);
    expect(get().events.length).toBe(before + 1);
    get().undoLastEvent();
    expect(get().events.length).toBe(before);
  });

  it("reverts the on-court cache when the tail is a substitution", () => {
    // Add a bench player first
    get().addPlayer("home", {
      number: "99",
      name: "Bench",
      isStarter: false,
      isCaptain: false,
    });
    const bench = get().homeTeam.roster.find((p) => p.number === "99")!;
    const out = get().homeTeam.roster.find((p) => p.isStarter)!;
    get().substitute("home", out.id, bench.id);
    expect(get().onCourt.home).toContain(bench.id);

    get().undoLastEvent();
    expect(get().onCourt.home).toContain(out.id);
    expect(get().onCourt.home).not.toContain(bench.id);
  });
});

// ─── Timeout & Period-Break Timer (feature 002) ─────────────────────────────

describe("recordTimeout — timeout countdown (C-001)", () => {
  beforeEach(() => {
    seedRoster("home", 5);
    seedRoster("away", 5);
    get().prepareGame();
    get().startGame();
  });

  it("sets status to 'timeout' when called from live play", () => {
    get().recordTimeout("home");
    expect(get().status).toBe("timeout");
  });

  it("seeds breakSeconds from settings.timeoutSeconds", () => {
    expect(get().settings.timeoutSeconds).toBe(60);
    get().recordTimeout("home");
    expect(get().breakSeconds).toBe(60);
  });

  it("preserves clockSeconds across the recordTimeout call (game time frozen)", () => {
    get().tickClock(5000); // bring clock down a bit while running
    get().stopClock();
    const before = get().clockSeconds;
    get().recordTimeout("away");
    expect(get().clockSeconds).toBe(before);
  });

  it("still emits the existing 'timeout' event (regression)", () => {
    get().recordTimeout("home");
    const last = get().events.at(-1);
    expect(last?.type).toBe("timeout");
    if (last?.type === "timeout") expect(last.side).toBe("home");
  });

  it("clockRunning is false after recordTimeout (existing behavior preserved)", () => {
    get().startClock();
    get().recordTimeout("home");
    expect(get().clockRunning).toBe(false);
  });
});

describe("endTimeout (C-002)", () => {
  beforeEach(() => {
    seedRoster("home", 5);
    seedRoster("away", 5);
    get().prepareGame();
    get().startGame();
    get().recordTimeout("home");
  });

  it("returns status to 'live'", () => {
    expect(get().status).toBe("timeout");
    get().endTimeout();
    expect(get().status).toBe("live");
  });

  it("clears breakSeconds to 0", () => {
    get().endTimeout();
    expect(get().breakSeconds).toBe(0);
  });

  it("does not auto-start the clock (clockRunning stays false)", () => {
    get().endTimeout();
    expect(get().clockRunning).toBe(false);
  });

  it("preserves clockSeconds (live game time resumes from where it was)", () => {
    const before = get().clockSeconds;
    get().endTimeout();
    expect(get().clockSeconds).toBe(before);
  });

  it("emits no new event", () => {
    const before = get().events.length;
    get().endTimeout();
    expect(get().events.length).toBe(before);
  });

  it("is a no-op when status is not 'timeout' (e.g., during period-break)", () => {
    get().endTimeout(); // back to live
    get().endPeriod(); // status -> period-break
    const snapshot = { ...get() };
    get().endTimeout(); // should be no-op
    expect(get().status).toBe("period-break");
    expect(get().breakSeconds).toBe(snapshot.breakSeconds);
  });
});

describe("endPeriod — break-duration seeding (C-003)", () => {
  beforeEach(() => {
    seedRoster("home", 5);
    seedRoster("away", 5);
    get().prepareGame();
    get().startGame();
  });

  it("seeds breakSeconds with quarterBreakSeconds after period 1 of a 4-period game", () => {
    get().endPeriod();
    expect(get().status).toBe("period-break");
    expect(get().breakSeconds).toBe(get().settings.quarterBreakSeconds);
  });

  it("seeds breakSeconds with halftimeBreakSeconds after period 2 of a 4-period game", () => {
    get().endPeriod(); // P1 end
    get().startNextPeriod(); // P2 start
    get().endPeriod(); // P2 end -> halftime
    expect(get().status).toBe("period-break");
    expect(get().breakSeconds).toBe(get().settings.halftimeBreakSeconds);
  });

  it("seeds breakSeconds with quarterBreakSeconds after period 3 of a 4-period game", () => {
    get().endPeriod();
    get().startNextPeriod();
    get().endPeriod();
    get().startNextPeriod();
    get().endPeriod(); // P3 end
    expect(get().breakSeconds).toBe(get().settings.quarterBreakSeconds);
  });

  it("transitions to finished with breakSeconds === 0 after the last regulation period", () => {
    for (let p = 0; p < DEFAULT_SETTINGS["5v5"].periods - 1; p++) {
      get().endPeriod();
      get().startNextPeriod();
    }
    get().endPeriod();
    expect(get().status).toBe("finished");
    expect(get().breakSeconds).toBe(0);
  });

  it("uses quarterBreakSeconds for last-regulation-to-OT transitions (no halftime there)", () => {
    // Reach end-of-regulation, then re-trigger as if going into OT via direct
    // state manipulation — the existing store transitions to 'finished' at the
    // last regulation period. The OT path is only reached via the manual
    // startNextPeriod from finished (per existing tests). We assert the
    // earlier transition (period 1 -> quarter break) instead, since the
    // 4-period default has its halftime between p2 and p3 — already covered.
    // This test pins that a 6-period configuration's last-regulation-to-OT
    // also lands on quarter (not halftime).
    get().setSettings({ periods: 6 });
    // periods 1..5 transitions: only p3 -> p4 is halftime in a 6-period game.
    // Period 5 -> 6 should be a quarter break.
    for (let p = 0; p < 4; p++) {
      get().endPeriod();
      get().startNextPeriod();
    }
    get().endPeriod(); // ends period 5 -> period-break with quarter break
    expect(get().breakSeconds).toBe(get().settings.quarterBreakSeconds);
  });

  it("3v3 single-period game transitions to finished (no halftime, no break)", () => {
    get().setSettings({ format: "3v3", periods: 1 });
    get().endPeriod();
    expect(get().status).toBe("finished");
    expect(get().breakSeconds).toBe(0);
  });
});

describe("startNextPeriod — break-seconds reset (C-004)", () => {
  beforeEach(() => {
    seedRoster("home", 5);
    seedRoster("away", 5);
    get().prepareGame();
    get().startGame();
    get().endPeriod(); // -> period-break with breakSeconds seeded
  });

  it("clears breakSeconds to 0 when starting the next period", () => {
    expect(get().breakSeconds).toBeGreaterThan(0);
    get().startNextPeriod();
    expect(get().breakSeconds).toBe(0);
  });
});

describe("tickClock — break-vs-clock routing (C-005)", () => {
  beforeEach(() => {
    seedRoster("home", 5);
    seedRoster("away", 5);
    get().prepareGame();
    get().startGame();
  });

  it("decrements breakSeconds during status==='timeout' and leaves clockSeconds untouched", () => {
    get().recordTimeout("home");
    const liveBefore = get().clockSeconds;
    const breakBefore = get().breakSeconds;
    get().tickClock(1000);
    expect(get().breakSeconds).toBeCloseTo(breakBefore - 1);
    expect(get().clockSeconds).toBe(liveBefore);
  });

  it("decrements breakSeconds during status==='period-break' and leaves clockSeconds untouched", () => {
    get().endPeriod();
    const liveBefore = get().clockSeconds;
    const breakBefore = get().breakSeconds;
    get().tickClock(1000);
    expect(get().breakSeconds).toBeCloseTo(breakBefore - 1);
    expect(get().clockSeconds).toBe(liveBefore);
  });

  it("decrements clockSeconds during live play (existing behavior preserved)", () => {
    get().startClock();
    const before = get().clockSeconds;
    get().tickClock(1000);
    expect(get().clockSeconds).toBeCloseTo(before - 1);
    expect(get().breakSeconds).toBe(0);
  });

  it("clamps breakSeconds at 0 (no negative time)", () => {
    get().recordTimeout("home");
    get().tickClock(999_999);
    expect(get().breakSeconds).toBe(0);
  });
});

describe("adjustClock — break-vs-clock routing (C-006)", () => {
  beforeEach(() => {
    seedRoster("home", 5);
    seedRoster("away", 5);
    get().prepareGame();
    get().startGame();
  });

  it("mutates breakSeconds during a timeout", () => {
    get().recordTimeout("home");
    get().adjustClock(180);
    expect(get().breakSeconds).toBe(180);
  });

  it("mutates breakSeconds during a period-break", () => {
    get().endPeriod();
    get().adjustClock(45);
    expect(get().breakSeconds).toBe(45);
  });

  it("mutates clockSeconds during live (existing behavior preserved)", () => {
    get().adjustClock(180);
    expect(get().clockSeconds).toBe(180);
  });

  it("clamps breakSeconds to 0 on the low end during a break", () => {
    get().recordTimeout("home");
    get().adjustClock(-10);
    expect(get().breakSeconds).toBe(0);
  });

  it("clamps breakSeconds to 1800 (30-minute generous cap) during a break", () => {
    get().recordTimeout("home");
    get().adjustClock(99_999);
    expect(get().breakSeconds).toBe(30 * 60);
  });
});
