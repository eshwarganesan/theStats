import { describe, it, expect } from "vitest";
import { computeStats, isInBonus } from "./stats";
import type {
  GameEvent,
  GameSettings,
  Player,
  Team,
  TeamStats,
} from "./types";
import { DEFAULT_SETTINGS } from "./constants";

/* ── Factories ─────────────────────────────────────────────────────── */

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: overrides.id ?? "p1",
    number: overrides.number ?? "1",
    name: overrides.name ?? "Player One",
    isStarter: overrides.isStarter ?? true,
    isCaptain: overrides.isCaptain ?? false,
  };
}

function makeTeam(side: "home" | "away", roster: Player[] = []): Team {
  return {
    id: `team-${side}`,
    name: side === "home" ? "Home" : "Away",
    tag: side === "home" ? "HME" : "AWY",
    color: side === "home" ? "#3B82F6" : "#EF4444",
    coach: "",
    roster,
  };
}

function settings(overrides: Partial<GameSettings> = {}): GameSettings {
  return { ...DEFAULT_SETTINGS["5v5"], ...overrides };
}

/**
 * Append-friendly event factory. Returns an unknown shape that the call
 * site asserts to `GameEvent` — `computeStats` only reads structural
 * fields, so this keeps tests terse without losing runtime correctness.
 */
function ev<T extends GameEvent["type"]>(
  type: T,
  payload: Omit<Extract<GameEvent, { type: T }>, "type" | "id" | "timestamp">,
): GameEvent {
  return {
    type,
    id: Math.random().toString(36).slice(2),
    timestamp: Date.now(),
    ...payload,
  } as unknown as GameEvent;
}

const homePlayer = makePlayer({ id: "h1", number: "10" });
const awayPlayer = makePlayer({ id: "a1", number: "20", name: "Away One" });
const homeTeam = makeTeam("home", [homePlayer]);
const awayTeam = makeTeam("away", [awayPlayer]);

const fold = (events: GameEvent[], cur = 1, s: GameSettings = settings()) =>
  computeStats(events, homeTeam, awayTeam, s, cur);

/* ── Tests ─────────────────────────────────────────────────────────── */

describe("computeStats — empty / shape", () => {
  it("returns zeroed stats with timeouts equal to settings cap", () => {
    const stats = fold([]);
    expect(stats.home.points).toBe(0);
    expect(stats.away.points).toBe(0);
    expect(stats.home.timeoutsRemaining).toBe(DEFAULT_SETTINGS["5v5"].timeoutsPerGame);
    expect(stats.away.timeoutsRemaining).toBe(DEFAULT_SETTINGS["5v5"].timeoutsPerGame);
    expect(stats.home.players).toHaveLength(1);
    expect(stats.home.players[0]?.points).toBe(0);
    expect(stats.home.players[0]?.fouledOut).toBe(false);
  });
});

describe("computeStats — scoring", () => {
  it("2pt made adds 2 points and bumps fgMade/fgAttempted", () => {
    const stats = fold([
      ev("score", {
        period: 1,
        clockAt: 590,
        side: "home",
        playerId: "h1",
        kind: "2pt",
        made: true,
      }),
    ]);
    expect(stats.home.points).toBe(2);
    const line = stats.home.players[0]!;
    expect(line.points).toBe(2);
    expect(line.fgMade).toBe(1);
    expect(line.fgAttempted).toBe(1);
    expect(line.threePtMade).toBe(0);
    expect(line.threePtAttempted).toBe(0);
  });

  it("2pt missed bumps fgAttempted but no points", () => {
    const stats = fold([
      ev("score", {
        period: 1,
        clockAt: 590,
        side: "home",
        playerId: "h1",
        kind: "2pt",
        made: false,
      }),
    ]);
    expect(stats.home.points).toBe(0);
    expect(stats.home.players[0]!.fgMade).toBe(0);
    expect(stats.home.players[0]!.fgAttempted).toBe(1);
  });

  it("3pt made adds 3 points and bumps both FG and 3P counters", () => {
    const stats = fold([
      ev("score", {
        period: 1,
        clockAt: 590,
        side: "home",
        playerId: "h1",
        kind: "3pt",
        made: true,
      }),
    ]);
    const line = stats.home.players[0]!;
    expect(stats.home.points).toBe(3);
    expect(line.points).toBe(3);
    expect(line.fgMade).toBe(1);
    expect(line.fgAttempted).toBe(1);
    expect(line.threePtMade).toBe(1);
    expect(line.threePtAttempted).toBe(1);
  });

  it("3pt missed bumps both fgAttempted and threePtAttempted", () => {
    const stats = fold([
      ev("score", {
        period: 1,
        clockAt: 590,
        side: "home",
        playerId: "h1",
        kind: "3pt",
        made: false,
      }),
    ]);
    const line = stats.home.players[0]!;
    expect(stats.home.points).toBe(0);
    expect(line.fgAttempted).toBe(1);
    expect(line.threePtAttempted).toBe(1);
    expect(line.threePtMade).toBe(0);
  });

  it("ft made adds 1 point and bumps ftMade/ftAttempted (not FG)", () => {
    const stats = fold([
      ev("score", {
        period: 1,
        clockAt: 590,
        side: "home",
        playerId: "h1",
        kind: "ft",
        made: true,
      }),
    ]);
    const line = stats.home.players[0]!;
    expect(stats.home.points).toBe(1);
    expect(line.ftMade).toBe(1);
    expect(line.ftAttempted).toBe(1);
    expect(line.fgAttempted).toBe(0);
  });

  it("ft missed bumps ftAttempted only", () => {
    const stats = fold([
      ev("score", {
        period: 1,
        clockAt: 590,
        side: "home",
        playerId: "h1",
        kind: "ft",
        made: false,
      }),
    ]);
    expect(stats.home.points).toBe(0);
    expect(stats.home.players[0]!.ftAttempted).toBe(1);
    expect(stats.home.players[0]!.ftMade).toBe(0);
  });

  it("attributes points to the correct side", () => {
    const stats = fold([
      ev("score", {
        period: 1,
        clockAt: 590,
        side: "away",
        playerId: "a1",
        kind: "2pt",
        made: true,
      }),
    ]);
    expect(stats.home.points).toBe(0);
    expect(stats.away.points).toBe(2);
  });
});

describe("computeStats — fouls", () => {
  const personal = (period: number) =>
    ev("foul", {
      period,
      clockAt: 100,
      side: "home",
      playerId: "h1",
      kind: "personal",
    });

  it("accumulates personal fouls and marks fouled-out at threshold (5v5)", () => {
    const stats = fold([1, 1, 1, 1, 1].map(personal));
    const line = stats.home.players[0]!;
    expect(line.fouls).toBe(5);
    expect(line.fouledOut).toBe(true);
  });

  it("does not foul out below threshold", () => {
    const stats = fold([1, 1, 1, 1].map(personal));
    expect(stats.home.players[0]!.fouledOut).toBe(false);
  });

  it("3v3 fouls out at 3 personal fouls", () => {
    const stats = fold(
      [1, 1, 1].map(personal),
      1,
      settings({ ...DEFAULT_SETTINGS["3v3"] }),
    );
    expect(stats.home.players[0]!.fouls).toBe(3);
    expect(stats.home.players[0]!.fouledOut).toBe(true);
  });

  it("totalFouls counts every foul; team.fouls only counts current period", () => {
    const stats = fold([personal(1), personal(1), personal(2)], 2);
    expect(stats.home.totalFouls).toBe(3);
    expect(stats.home.fouls).toBe(1);
  });
});

type StatKind = Extract<GameEvent, { type: "stat" }>["kind"];

describe("computeStats — stat events", () => {
  const stat = (kind: StatKind) =>
    ev("stat", {
      period: 1,
      clockAt: 100,
      side: "home",
      playerId: "h1",
      kind,
    });

  it("rebound-off and rebound-def both bump total rebounds", () => {
    const stats = fold([stat("rebound-off"), stat("rebound-def")]);
    const line = stats.home.players[0]!;
    expect(line.reboundsOff).toBe(1);
    expect(line.reboundsDef).toBe(1);
    expect(line.rebounds).toBe(2);
  });

  it("maps each stat kind to the right field", () => {
    const stats = fold([
      stat("assist"),
      stat("steal"),
      stat("block"),
      stat("turnover"),
    ]);
    const line = stats.home.players[0]!;
    expect(line.assists).toBe(1);
    expect(line.steals).toBe(1);
    expect(line.blocks).toBe(1);
    expect(line.turnovers).toBe(1);
  });
});

describe("computeStats — timeouts", () => {
  it("decrements remaining and increments taken", () => {
    const stats = fold([
      ev("timeout", { period: 1, clockAt: 200, side: "home" }),
      ev("timeout", { period: 1, clockAt: 100, side: "home" }),
    ]);
    expect(stats.home.timeoutsTaken).toBe(2);
    expect(stats.home.timeoutsRemaining).toBe(
      DEFAULT_SETTINGS["5v5"].timeoutsPerGame - 2,
    );
  });

  it("never goes negative even when over-spent", () => {
    const events: GameEvent[] = [];
    for (let i = 0; i < 20; i++) {
      events.push(ev("timeout", { period: 1, clockAt: i, side: "home" }));
    }
    const stats = fold(events);
    expect(stats.home.timeoutsRemaining).toBe(0);
  });
});

describe("computeStats — events without players", () => {
  it("ignores clock and period events for stats", () => {
    const stats = fold([
      ev("clock", { period: 1, clockAt: 600, action: "start" }),
      ev("clock", { period: 1, clockAt: 500, action: "stop" }),
      ev("period", { period: 1, clockAt: 0, action: "end" }),
      ev("period", { period: 2, clockAt: 600, action: "start" }),
    ]);
    expect(stats.home.points).toBe(0);
    expect(stats.away.points).toBe(0);
  });

  it("ignores substitution events for stats", () => {
    const homeWithBench = makeTeam("home", [
      homePlayer,
      makePlayer({ id: "h2", number: "11", isStarter: false }),
    ]);
    const stats = computeStats(
      [
        ev("substitution", {
          period: 1,
          clockAt: 300,
          side: "home",
          playerInId: "h2",
          playerOutId: "h1",
        }),
      ],
      homeWithBench,
      awayTeam,
      settings(),
      1,
    );
    expect(stats.home.points).toBe(0);
    expect(stats.home.players.every((p) => p.points === 0)).toBe(true);
  });
});

describe("computeStats — unknown identifiers", () => {
  it("does not throw for an unknown playerId on a score event", () => {
    expect(() =>
      fold([
        ev("score", {
          period: 1,
          clockAt: 100,
          side: "home",
          playerId: "nope",
          kind: "2pt",
          made: true,
        }),
      ]),
    ).not.toThrow();
  });

  it("does not credit points to anyone when playerId is unknown", () => {
    const stats = fold([
      ev("score", {
        period: 1,
        clockAt: 100,
        side: "home",
        playerId: "nope",
        kind: "2pt",
        made: true,
      }),
    ]);
    expect(stats.home.points).toBe(0);
    expect(stats.home.players[0]!.points).toBe(0);
  });

  it("does not record fouls for an unknown playerId", () => {
    const stats = fold([
      ev("foul", {
        period: 1,
        clockAt: 100,
        side: "home",
        playerId: "ghost",
        kind: "personal",
      }),
    ]);
    expect(stats.home.totalFouls).toBe(0);
    expect(stats.home.players[0]!.fouls).toBe(0);
  });

  it("does not record stats for an unknown playerId", () => {
    const stats = fold([
      ev("stat", {
        period: 1,
        clockAt: 100,
        side: "home",
        playerId: "ghost",
        kind: "assist",
      }),
    ]);
    expect(stats.home.players[0]!.assists).toBe(0);
  });
});

describe("isInBonus", () => {
  const fakeTeam = (fouls: number): TeamStats => ({
    side: "home",
    points: 0,
    fouls,
    totalFouls: fouls,
    timeoutsTaken: 0,
    timeoutsRemaining: 5,
    players: [],
  });

  it("returns false when team fouls are below the threshold", () => {
    expect(isInBonus(fakeTeam(4), settings())).toBe(false);
  });

  it("returns true at exactly the threshold", () => {
    expect(isInBonus(fakeTeam(5), settings())).toBe(true);
  });

  it("returns true above the threshold", () => {
    expect(isInBonus(fakeTeam(7), settings())).toBe(true);
  });
});
