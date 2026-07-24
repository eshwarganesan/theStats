import { describe, it, expect } from "vitest";
import { computeStats, computeStatSheet, isInBonus } from "./stats";
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

type EventOf<T extends GameEvent["type"]> = Extract<GameEvent, { type: T }>;
type EventInput<T extends GameEvent["type"]> = Omit<EventOf<T>, "type" | "id" | "timestamp">;

// Typed factory for `GameEvent` test fixtures. The single `as EventOf<T>`
// cast is a well-known TypeScript limitation: spreading into a generic
// discriminated union cannot be proved structurally (TS#27808). The cast
// is narrow (preserves the variant via `Extract`) — strictly better than
// the previous `as unknown as GameEvent` pattern, and the public signature
// gives every call site the precise variant type.
function ev<T extends GameEvent["type"]>(type: T, input: EventInput<T>): EventOf<T> {
  return {
    type,
    id: Math.random().toString(36).slice(2),
    timestamp: Date.now(),
    ...input,
  } as EventOf<T>;
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

describe("team actions (feature 008)", () => {
  it("defaults teamTurnovers to 0 for both teams with no events", () => {
    const stats = computeStats([], homeTeam, awayTeam, settings(), 1);
    expect(stats.home.teamTurnovers).toBe(0);
    expect(stats.away.teamTurnovers).toBe(0);
  });

  it("counts a team-turnover only for the charged side, no player touched", () => {
    const stats = computeStats(
      [
        ev("team-turnover", {
          period: 1,
          clockAt: 300,
          side: "home",
          kind: "24-second",
        }),
      ],
      homeTeam,
      awayTeam,
      settings(),
      1,
    );
    expect(stats.home.teamTurnovers).toBe(1);
    expect(stats.away.teamTurnovers).toBe(0);
    expect(stats.home.players[0]!.turnovers).toBe(0);
  });

  it("accumulates multiple team-turnovers", () => {
    const stats = computeStats(
      [
        ev("team-turnover", { period: 1, clockAt: 300, side: "away", kind: "8-second" }),
        ev("team-turnover", { period: 1, clockAt: 200, side: "away", kind: "3-second" }),
      ],
      homeTeam,
      awayTeam,
      settings(),
      1,
    );
    expect(stats.away.teamTurnovers).toBe(2);
  });

  it("adds team-score-adjust points to the team score, not to any player", () => {
    const stats = computeStats(
      [
        ev("team-score-adjust", {
          period: 1,
          clockAt: 600,
          side: "home",
          points: 5,
          reason: "missing jersey",
        }),
      ],
      homeTeam,
      awayTeam,
      settings(),
      1,
    );
    expect(stats.home.points).toBe(5);
    expect(stats.away.points).toBe(0);
    expect(stats.home.players[0]!.points).toBe(0);
  });

  it("sums multiple additive awards with player-scored points", () => {
    const stats = computeStats(
      [
        ev("score", { period: 1, clockAt: 600, side: "home", playerId: "h1", kind: "2pt", made: true }),
        ev("team-score-adjust", { period: 1, clockAt: 500, side: "home", points: 2, reason: "technical" }),
      ],
      homeTeam,
      awayTeam,
      settings(),
      1,
    );
    expect(stats.home.points).toBe(4);
    expect(stats.home.players[0]!.points).toBe(2);
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
    teamTurnovers: 0,
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

describe("computeStatSheet — statsheet snapshot for review view (feature 009 US4)", () => {
  it("returns the same team totals as computeStats", () => {
    const events: GameEvent[] = [
      ev("score", {
        period: 1,
        clockAt: 599,
        side: "home",
        playerId: homePlayer.id,
        kind: "2pt",
        made: true,
      }),
      ev("score", {
        period: 1,
        clockAt: 598,
        side: "away",
        playerId: awayPlayer.id,
        kind: "3pt",
        made: true,
      }),
    ];
    const sheet = computeStatSheet(events, homeTeam, awayTeam, settings(), 1);
    const teams = computeStats(events, homeTeam, awayTeam, settings(), 1);
    expect(sheet.home).toEqual(teams.home);
    expect(sheet.away).toEqual(teams.away);
  });

  it("exposes a per-playerId lookup map with every player from both rosters", () => {
    const bigHome = makeTeam("home", [
      makePlayer({ id: "h1", number: "10" }),
      makePlayer({ id: "h2", number: "11" }),
    ]);
    const bigAway = makeTeam("away", [
      makePlayer({ id: "a1", number: "20" }),
      makePlayer({ id: "a2", number: "21" }),
    ]);
    const sheet = computeStatSheet([], bigHome, bigAway, settings(), 1);
    expect(sheet.players["h1"]).toBeDefined();
    expect(sheet.players["h2"]).toBeDefined();
    expect(sheet.players["a1"]).toBeDefined();
    expect(sheet.players["a2"]).toBeDefined();
  });

  it("aggregates scoring stats correctly across mixed events", () => {
    const events: GameEvent[] = [
      // Home: 2pt made + 3pt made + 1 miss + 1 foul + 2 rebounds + 1 assist.
      ev("score", { period: 1, clockAt: 590, side: "home", playerId: "h1", kind: "2pt", made: true }),
      ev("score", { period: 1, clockAt: 585, side: "home", playerId: "h1", kind: "3pt", made: true }),
      ev("score", { period: 1, clockAt: 580, side: "home", playerId: "h1", kind: "2pt", made: false }),
      ev("foul", { period: 1, clockAt: 575, side: "home", playerId: "h1", kind: "personal" }),
      ev("stat", { period: 1, clockAt: 570, side: "home", playerId: "h1", kind: "rebound-def" }),
      ev("stat", { period: 1, clockAt: 565, side: "home", playerId: "h1", kind: "rebound-off" }),
      ev("stat", { period: 1, clockAt: 560, side: "home", playerId: "h1", kind: "assist" }),
    ];
    const sheet = computeStatSheet(events, homeTeam, awayTeam, settings(), 1);
    const h1 = sheet.players["h1"]!;
    expect(h1.points).toBe(5);
    expect(h1.fgAttempted).toBe(3);
    expect(h1.fgMade).toBe(2);
    expect(h1.threePtAttempted).toBe(1);
    expect(h1.threePtMade).toBe(1);
    expect(h1.rebounds).toBe(2);
    expect(h1.reboundsOff).toBe(1);
    expect(h1.reboundsDef).toBe(1);
    expect(h1.assists).toBe(1);
    expect(h1.fouls).toBe(1);
    expect(sheet.home.points).toBe(5);
    expect(sheet.home.totalFouls).toBe(1);
  });

  it("timeout / clock / period / substitution events do NOT affect stats", () => {
    const events: GameEvent[] = [
      ev("timeout", { period: 1, clockAt: 500, side: "home" }),
      ev("clock", { period: 1, clockAt: 500, action: "start" }),
      ev("period", { period: 1, clockAt: 0, action: "end" }),
      ev("substitution", { period: 1, clockAt: 480, side: "home", playerInId: "h1", playerOutId: "h2" }),
    ];
    const sheet = computeStatSheet(events, homeTeam, awayTeam, settings(), 1);
    expect(sheet.home.points).toBe(0);
    expect(sheet.away.points).toBe(0);
    expect(sheet.home.totalFouls).toBe(0);
  });
});
