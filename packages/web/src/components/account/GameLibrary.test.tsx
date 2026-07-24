/**
 * GameLibrary tests.
 * Feature 009-account-library, task T033.
 */
import { render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryEntry as Entry } from "@/lib/games/types";
import { GameLibrary } from "./GameLibrary";

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: "game-1",
    status: "in-progress",
    homeTeamName: "Central High",
    awayTeamName: "Eastridge",
    homeScore: 0,
    awayScore: 0,
    eventCount: 0,
    currentPeriod: 1,
    startedAt: "2026-07-22T18:00:00Z",
    lastActivityAt: "2026-07-22T19:00:00Z",
    finishedAt: null,
    ...overrides,
  };
}

// Simple IntersectionObserver polyfill capturing the callback so tests
// can synthesize scroll-into-view events.
class TestIntersectionObserver {
  static instances: TestIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  constructor(cb: IntersectionObserverCallback) {
    this.callback = cb;
    TestIntersectionObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
  root = null;
  rootMargin = "";
  thresholds = [];
  trigger(entries: Partial<IntersectionObserverEntry>[]) {
    this.callback(
      entries.map((e) => ({
        isIntersecting: true,
        target: document.body,
        ...e,
      } as IntersectionObserverEntry)),
      this as unknown as IntersectionObserver,
    );
  }
}

const originalIO = globalThis.IntersectionObserver;

afterEach(() => {
  TestIntersectionObserver.instances.length = 0;
  vi.restoreAllMocks();
  if (originalIO) {
    globalThis.IntersectionObserver = originalIO;
  }
});

describe("GameLibrary", () => {
  it("renders an empty-state message when there are no entries", () => {
    render(<GameLibrary initialEntries={[]} initialNextCursor={null} />);
    expect(
      screen.getByText(/games you play will appear here/i),
    ).toBeInTheDocument();
  });

  it("renders one row per entry, preserving the input order", () => {
    const entries = [
      makeEntry({ id: "a", homeTeamName: "A", awayTeamName: "A-opp" }),
      makeEntry({ id: "b", homeTeamName: "B", awayTeamName: "B-opp" }),
      makeEntry({ id: "c", homeTeamName: "C", awayTeamName: "C-opp" }),
    ];
    render(<GameLibrary initialEntries={entries} initialNextCursor={null} />);
    const rendered = screen.getAllByText(/-opp/).map((el) => el.textContent);
    expect(rendered).toEqual(["A-opp", "B-opp", "C-opp"]);
  });

  it("does not render a load-more sentinel when nextCursor is null", () => {
    render(<GameLibrary initialEntries={[makeEntry()]} initialNextCursor={null} />);
    expect(screen.queryByTestId("library-load-more")).toBeNull();
  });

  it("fetches the next page when the load-more sentinel scrolls into view", async () => {
    globalThis.IntersectionObserver = TestIntersectionObserver as unknown as typeof IntersectionObserver;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return {
        ok: true,
        json: async () => ({
          entries: [makeEntry({ id: "b", homeTeamName: "B", awayTeamName: "B-opp" })],
          nextCursor: null,
        }),
      } as Response;
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(
      <GameLibrary
        initialEntries={[makeEntry({ id: "a", homeTeamName: "A", awayTeamName: "A-opp" })]}
        initialNextCursor="2026-07-21T18:00:00Z"
      />,
    );

    const io = TestIntersectionObserver.instances[0]!;
    await act(async () => {
      io.trigger([{ isIntersecting: true }]);
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const first = call![0];
    expect(String(first)).toContain("cursor=");
    await screen.findByText("B-opp");
  });
});
