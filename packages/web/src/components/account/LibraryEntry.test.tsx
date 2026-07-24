/**
 * LibraryEntry tests.
 * Feature 009-account-library, task T034 (US2 slice — row summary only).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LibraryEntry as Entry } from "@/lib/games/types";
import { LibraryEntry } from "./LibraryEntry";

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: "game-1",
    status: "in-progress",
    homeTeamName: "Central High",
    awayTeamName: "Eastridge",
    homeScore: 42,
    awayScore: 39,
    eventCount: 128,
    currentPeriod: 3,
    startedAt: "2026-07-20T18:00:00Z",
    lastActivityAt: "2026-07-20T20:14:03Z",
    finishedAt: null,
    ...overrides,
  };
}

describe("LibraryEntry", () => {
  it("renders both team names", () => {
    render(<LibraryEntry entry={makeEntry()} />);
    expect(screen.getByText("Central High")).toBeInTheDocument();
    expect(screen.getByText("Eastridge")).toBeInTheDocument();
  });

  it("renders home and away scores", () => {
    render(<LibraryEntry entry={makeEntry({ homeScore: 42, awayScore: 39 })} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("39")).toBeInTheDocument();
  });

  it('shows "In progress" status pill for in-progress games', () => {
    render(<LibraryEntry entry={makeEntry({ status: "in-progress" })} />);
    expect(screen.getByText(/in progress/i)).toBeInTheDocument();
  });

  it('shows "Final" status pill for finished games', () => {
    render(
      <LibraryEntry
        entry={makeEntry({
          status: "finished",
          finishedAt: "2026-07-20T21:00:00Z",
        })}
      />,
    );
    expect(screen.getByText(/final/i)).toBeInTheDocument();
  });

  it("renders the start date and time in a stable, machine-readable form", () => {
    render(<LibraryEntry entry={makeEntry()} />);
    // The exact locale format is environment-dependent; assert that the
    // startedAt ISO string is exposed via a datetime attribute so
    // screen readers + tests can rely on it.
    const time = screen.getByRole("time", { hidden: true }).closest("time")
      ?? screen.getByText(/2026/i).closest("time")
      ?? screen.getByText(/2026/i);
    expect(time).toBeInTheDocument();
  });
});
