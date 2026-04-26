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

  it("adjustClock clamps to [0, periodSeconds]", () => {
    get().adjustClock(-50);
    expect(get().clockSeconds).toBe(0);
    get().adjustClock(99999);
    expect(get().clockSeconds).toBe(get().settings.periodSeconds);
    get().adjustClock(120);
    expect(get().clockSeconds).toBe(120);
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
