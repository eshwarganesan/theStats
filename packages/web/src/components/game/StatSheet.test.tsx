/**
 * StatSheet tests.
 * Feature 009-account-library, task T056.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@thestats/core";
import type { PlayerStats, Team, TeamStats } from "@thestats/core";
import { StatSheet } from "./StatSheet";

function emptyPlayer(id: string, _name: string, _number: string): PlayerStats {
  return {
    playerId: id,
    points: 0,
    fgMade: 0,
    fgAttempted: 0,
    threePtMade: 0,
    threePtAttempted: 0,
    ftMade: 0,
    ftAttempted: 0,
    reboundsOff: 0,
    reboundsDef: 0,
    rebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    fouls: 0,
    fouledOut: false,
    // `number` and `name` aren't part of PlayerStats — the StatSheet
    // resolves them via the roster passed alongside.
  };
}

const homeTeam: Team = {
  id: "h",
  name: "Central High",
  tag: "CEN",
  color: "#ff0000",
  coach: "",
  roster: [
    { id: "h1", number: "10", name: "Home One", isStarter: true, isCaptain: false },
    { id: "h2", number: "11", name: "Home Two", isStarter: true, isCaptain: false },
  ],
};

const awayTeam: Team = {
  id: "a",
  name: "Eastridge",
  tag: "EAS",
  color: "#0000ff",
  coach: "",
  roster: [
    { id: "a1", number: "20", name: "Away One", isStarter: true, isCaptain: false },
  ],
};

const home: TeamStats = {
  side: "home",
  points: 12,
  fouls: 2,
  totalFouls: 5,
  timeoutsTaken: 1,
  timeoutsRemaining: 3,
  teamTurnovers: 0,
  players: [
    { ...emptyPlayer("h1", "Home One", "10"), points: 8, fgMade: 4, fgAttempted: 7, assists: 3 },
    { ...emptyPlayer("h2", "Home Two", "11"), points: 4, fgMade: 2, fgAttempted: 3, rebounds: 5 },
  ],
};

const away: TeamStats = {
  side: "away",
  points: 9,
  fouls: 1,
  totalFouls: 3,
  timeoutsTaken: 0,
  timeoutsRemaining: 4,
  teamTurnovers: 0,
  players: [
    { ...emptyPlayer("a1", "Away One", "20"), points: 9, threePtMade: 3, threePtAttempted: 5 },
  ],
};

describe("StatSheet", () => {
  it("renders one row per rostered player in each team", () => {
    render(
      <StatSheet
        home={home}
        away={away}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        settings={DEFAULT_SETTINGS["5v5"]}
      />,
    );
    expect(screen.getByText("Home One")).toBeInTheDocument();
    expect(screen.getByText("Home Two")).toBeInTheDocument();
    expect(screen.getByText("Away One")).toBeInTheDocument();
  });

  it("displays per-player points from the PlayerStats input", () => {
    render(
      <StatSheet
        home={home}
        away={away}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        settings={DEFAULT_SETTINGS["5v5"]}
      />,
    );
    const h1 = screen.getByText("Home One").closest("tr")!;
    expect(within(h1).getByText("8")).toBeInTheDocument();
  });

  it("renders team totals for both sides", () => {
    render(
      <StatSheet
        home={home}
        away={away}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        settings={DEFAULT_SETTINGS["5v5"]}
      />,
    );
    expect(screen.getByText("Central High")).toBeInTheDocument();
    expect(screen.getByText("Eastridge")).toBeInTheDocument();
    // Total points appear alongside team name — search anywhere.
    expect(screen.getAllByText("12").length).toBeGreaterThan(0);
    expect(screen.getAllByText("9").length).toBeGreaterThan(0);
  });

  it("uses semantic <table> markup so screen readers can navigate rows and columns", () => {
    render(
      <StatSheet
        home={home}
        away={away}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        settings={DEFAULT_SETTINGS["5v5"]}
      />,
    );
    const tables = screen.getAllByRole("table");
    expect(tables.length).toBeGreaterThanOrEqual(2);
    for (const t of tables) {
      expect(within(t).getAllByRole("columnheader").length).toBeGreaterThan(0);
    }
  });
});
