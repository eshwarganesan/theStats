/**
 * LibraryEntry tests.
 * Feature 009-account-library, tasks T034 (US2 slice — row summary) and
 * T049 (US3 slice — Continue behavior).
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

const hydrateMock = vi.fn();
vi.mock("@/lib/store", () => ({
  useGameStore: <T,>(selector: (s: { hydrateFromLibrary: typeof hydrateMock }) => T) =>
    selector({ hydrateFromLibrary: hydrateMock }),
}));

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

const originalFetch = globalThis.fetch;
afterEach(() => {
  routerPush.mockReset();
  hydrateMock.mockReset();
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe("LibraryEntry — row summary", () => {
  it("renders both team names", () => {
    render(<LibraryEntry entry={makeEntry()} />);
    // The DeleteGameDialog also embeds the team names in its (closed) modal
    // body — assert with getAllByText so both rendered instances count.
    expect(screen.getAllByText("Central High").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Eastridge").length).toBeGreaterThan(0);
  });

  it("renders home and away scores", () => {
    render(<LibraryEntry entry={makeEntry({ homeScore: 42, awayScore: 39 })} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("39")).toBeInTheDocument();
  });

  it('shows "In progress" status pill for in-progress games', () => {
    render(<LibraryEntry entry={makeEntry({ status: "in-progress" })} />);
    // Match the uppercase pill copy exactly (there's also body copy that
    // contains "in progress" inside the confirm-force modal template).
    expect(screen.getByText("In progress")).toBeInTheDocument();
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

  it("renders the start date as a semantic <time> element", () => {
    render(<LibraryEntry entry={makeEntry()} />);
    const time = document.querySelector("time");
    expect(time).not.toBeNull();
    expect(time?.getAttribute("datetime")).toBe("2026-07-20T18:00:00Z");
  });
});

describe("LibraryEntry — Continue (US3)", () => {
  it("shows a Continue button only for in-progress games", () => {
    const { rerender } = render(<LibraryEntry entry={makeEntry({ status: "in-progress" })} />);
    expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();

    rerender(
      <LibraryEntry
        entry={makeEntry({ status: "finished", finishedAt: "2026-07-20T21:00:00Z" })}
      />,
    );
    expect(screen.queryByRole("button", { name: /continue/i })).toBeNull();
  });

  it("fetches the game, hydrates the store, and navigates to /", async () => {
    const record = {
      game: {
        id: "game-1",
        ownerId: "u",
        status: "in-progress",
        homeTeamName: "Central High",
        awayTeamName: "Eastridge",
        homeScore: 0,
        awayScore: 0,
        eventCount: 0,
        currentPeriod: 1,
        startedAt: "2026-07-20T18:00:00Z",
        lastActivityAt: "2026-07-20T18:00:00Z",
        finishedAt: null,
        state: { some: "record" },
      },
    };
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(record), { status: 200 }),
    ) as unknown as typeof fetch;
    hydrateMock.mockReturnValue({ ok: true });

    render(<LibraryEntry entry={makeEntry()} />);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(hydrateMock).toHaveBeenCalledTimes(1));
    expect(hydrateMock).toHaveBeenCalledWith(record.game.state, { force: false });
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/game"));
  });

  it("opens a confirm-force dialog when the store rejects the hydrate", async () => {
    const record = {
      game: {
        id: "game-1",
        ownerId: "u",
        status: "in-progress",
        homeTeamName: "Central High",
        awayTeamName: "Eastridge",
        homeScore: 0,
        awayScore: 0,
        eventCount: 0,
        currentPeriod: 1,
        startedAt: "2026-07-20T18:00:00Z",
        lastActivityAt: "2026-07-20T18:00:00Z",
        finishedAt: null,
        state: { some: "record" },
      },
    };
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(record), { status: 200 }),
    ) as unknown as typeof fetch;

    // First hydrate call rejects; second (after confirm) succeeds.
    hydrateMock
      .mockReturnValueOnce({ ok: false, reason: "local_game_present" })
      .mockReturnValueOnce({ ok: true });

    render(<LibraryEntry entry={makeEntry()} />);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /replace/i })).toBeInTheDocument(),
    );
    // Router push should NOT have fired yet.
    expect(routerPush).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^replace$/i }));
    expect(hydrateMock).toHaveBeenLastCalledWith(record.game.state, { force: true });
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/game"));
  });

  it("cancelling the confirm-force dialog does not navigate", async () => {
    const record = {
      game: {
        id: "game-1",
        ownerId: "u",
        status: "in-progress",
        homeTeamName: "Central High",
        awayTeamName: "Eastridge",
        homeScore: 0,
        awayScore: 0,
        eventCount: 0,
        currentPeriod: 1,
        startedAt: "2026-07-20T18:00:00Z",
        lastActivityAt: "2026-07-20T18:00:00Z",
        finishedAt: null,
        state: { some: "record" },
      },
    };
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(record), { status: 200 }),
    ) as unknown as typeof fetch;
    hydrateMock.mockReturnValueOnce({ ok: false, reason: "local_game_present" });

    render(<LibraryEntry entry={makeEntry()} />);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(routerPush).not.toHaveBeenCalled();
    // hydrate was only called once (initial rejected call).
    expect(hydrateMock).toHaveBeenCalledTimes(1);
  });

  it("shows an inline error when the fetch fails", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: "not_found", message: "" } }), {
        status: 404,
      }),
    ) as unknown as typeof fetch;

    render(<LibraryEntry entry={makeEntry()} />);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() =>
      expect(screen.getByText(/couldn.{0,3}t load the game/i)).toBeInTheDocument(),
    );
    expect(routerPush).not.toHaveBeenCalled();
  });
});

describe("LibraryEntry — Delete (US4)", () => {
  it("fires onDeleted after a successful DELETE from the dialog", async () => {
    // 204 No Content on success.
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    const onDeleted = vi.fn();

    render(
      <LibraryEntry
        entry={makeEntry({ status: "finished", finishedAt: "2026-07-20T21:00:00Z" })}
        onDeleted={onDeleted}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /delete game/i }));
    // The dialog's own Delete button (the danger variant with copy "Delete").
    // Scope to the dialog to avoid the row-level trigger which is aria-labelled "Delete game".
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("game-1"));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/games/game-1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
