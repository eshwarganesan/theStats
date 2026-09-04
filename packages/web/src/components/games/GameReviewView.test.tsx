/**
 * GameReviewView tests (feature 009-account-library, US4 / T074 coverage top-up).
 *
 * Composes the read-only <StatSheet> + <GameLog readOnly> for a persisted
 * game record. Verifies:
 *   - The score derived from `computeStatSheet` shows in the header.
 *   - The Statsheet + Play-by-play sections both render with h2 headings
 *     (a11y — no h1 → h3 heading level jump).
 *   - A "Back to your library" link points at `/games` (feature 010 T027 —
 *     the library moved out of the account page into a dedicated /games route).
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type GameEvent, type Team } from "@thestats/core";
import type { PersistedGameRecord } from "@/lib/persistence";
import { GameReviewView } from "./GameReviewView";

// The review view renders <GameLog>, which reads from the Zustand store
// as its default source. `source={...}` should suppress those reads —
// but Zustand is a lightweight module and does not need mocking here.

const homeTeam: Team = {
  id: "h",
  name: "Central High",
  tag: "CEN",
  color: "#ff0000",
  coach: "",
  roster: [
    { id: "h1", number: "10", name: "Home One", isStarter: true, isCaptain: false },
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

const events: GameEvent[] = [
  {
    id: "evt-1",
    type: "score",
    timestamp: 1,
    period: 4,
    clockAt: 42,
    side: "home",
    playerId: "h1",
    kind: "2pt",
    made: true,
  },
  {
    id: "evt-2",
    type: "score",
    timestamp: 2,
    period: 4,
    clockAt: 30,
    side: "away",
    playerId: "a1",
    kind: "3pt",
    made: true,
  },
];

function makeRecord(overrides: Partial<PersistedGameRecord> = {}): PersistedGameRecord {
  return {
    schemaVersion: 1,
    homeTeam,
    awayTeam,
    settings: DEFAULT_SETTINGS["5v5"],
    status: "finished",
    currentPeriod: 4,
    events,
    possession: null,
    possessionArrow: "unset",
    onCourt: { home: ["h1"], away: ["a1"] },
    ...overrides,
  };
}

describe("GameReviewView", () => {
  it("renders the two team names in the h1 header", () => {
    render(<GameReviewView record={makeRecord()} />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toContain("Central High");
    expect(h1.textContent).toContain("Eastridge");
  });

  it("shows the derived score from computeStatSheet", () => {
    // Home = 2pt made → 2; Away = 3pt made → 3.
    render(<GameReviewView record={makeRecord()} />);
    const h1 = screen.getByRole("heading", { level: 1 });
    const header = h1.parentElement!;
    expect(within(header).getByText(/2.*3/)).toBeInTheDocument();
  });

  it("renders Statsheet and Play-by-play as h2 sections (no heading level jump)", () => {
    render(<GameReviewView record={makeRecord()} />);
    expect(
      screen.getByRole("heading", { level: 2, name: /statsheet/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /play-by-play/i }),
    ).toBeInTheDocument();
  });

  it('exposes a "Back to your library" link pointing at /games', () => {
    render(<GameReviewView record={makeRecord()} />);
    const link = screen.getByRole("link", { name: /back to your library/i });
    expect(link.getAttribute("href")).toBe("/games");
  });

  it("renders the read-only statsheet with both rosters", () => {
    render(<GameReviewView record={makeRecord()} />);
    // Roster names come from StatSheet's per-team tables.
    expect(screen.getByText("Home One")).toBeInTheDocument();
    expect(screen.getByText("Away One")).toBeInTheDocument();
  });
});
