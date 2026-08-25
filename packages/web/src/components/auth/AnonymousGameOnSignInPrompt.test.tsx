/**
 * AnonymousGameOnSignInPrompt tests.
 * Feature 009-account-library, task T035.
 *
 * The prompt is a Client Component that reads the anonymous local game
 * from localStorage after a successful sign-in and blocks the caller's
 * redirect until the user picks one of three explicit choices. It is
 * exercised here as a controlled component — the parent decides when it
 * mounts.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GAME_STORAGE_KEY } from "@/lib/persistence";
import { AnonymousGameOnSignInPrompt } from "./AnonymousGameOnSignInPrompt";

// The prompt hands the uploaded game's id to the write-through controller so
// a later signed-in mutation PATCHes it instead of POSTing a duplicate row.
const adoptGameId = vi.fn();
vi.mock("@/components/shell/WriteThroughMount", () => ({
  useWriteThrough: () => ({
    adoptGameId,
    saveNow: vi.fn(),
    status: "idle",
    signedIn: true,
  }),
}));

const SAMPLE_RECORD = {
  schemaVersion: 1,
  homeTeam: {
    id: "home",
    name: "Home",
    tag: "HOM",
    color: "#ff0000",
    coach: "",
    roster: [],
  },
  awayTeam: {
    id: "away",
    name: "Away",
    tag: "AWY",
    color: "#0000ff",
    coach: "",
    roster: [],
  },
  settings: {
    format: "5v5",
    periods: 4,
    periodSeconds: 600,
    overtimeSeconds: 300,
    overtimeEnabled: true,
    possessionArrowEnabled: true,
    bonusFoulThreshold: 5,
    timeoutsPerGame: 4,
    timeoutSeconds: 60,
    quarterBreakSeconds: 60,
    halftimeBreakSeconds: 900,
    venue: "",
    competition: "",
  },
  status: "live",
  currentPeriod: 1,
  events: [{ type: "score", id: "e1", timestamp: 1, period: 1, clockAt: 590, side: "home", playerId: "p1", kind: "2pt", made: true }],
  possession: "home",
  onCourt: { home: [], away: [] },
};

beforeEach(() => {
  adoptGameId.mockClear();
  localStorage.setItem(
    GAME_STORAGE_KEY,
    JSON.stringify({ state: SAMPLE_RECORD, version: 1 }),
  );
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("AnonymousGameOnSignInPrompt", () => {
  it("renders three explicit choices when a local game exists", () => {
    const onResolved = vi.fn();
    render(<AnonymousGameOnSignInPrompt onResolved={onResolved} />);
    expect(screen.getByRole("button", { name: /save to my account/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /keep local/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /discard/i })).toBeInTheDocument();
    expect(onResolved).not.toHaveBeenCalled();
  });

  it("Save → POSTs the local game and clears the local key", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify({ game: { id: "game-1" } }), { status: 201 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const onResolved = vi.fn();
    render(<AnonymousGameOnSignInPrompt onResolved={onResolved} />);
    fireEvent.click(screen.getByRole("button", { name: /save to my account/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    expect(call![0]).toBe("/api/games");
    const init = call![1] as RequestInit;
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBeDefined();
    const body = JSON.parse(init.body as string);
    expect(body.state.status).toBe("live");

    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem(GAME_STORAGE_KEY)).toBeNull();
    // The new row id is handed to the write-through controller so the next
    // signed-in mutation PATCHes it rather than creating a duplicate.
    expect(adoptGameId).toHaveBeenCalledWith("game-1");
  });

  it("Save failure → does not adopt a game id or clear the local key", async () => {
    const fetchMock = vi.fn(
      async () => new Response("nope", { status: 500 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const onResolved = vi.fn();
    render(<AnonymousGameOnSignInPrompt onResolved={onResolved} />);
    fireEvent.click(screen.getByRole("button", { name: /save to my account/i }));

    await waitFor(() =>
      expect(screen.getByText(/couldn't save your game/i)).toBeInTheDocument(),
    );
    expect(adoptGameId).not.toHaveBeenCalled();
    expect(onResolved).not.toHaveBeenCalled();
    expect(localStorage.getItem(GAME_STORAGE_KEY)).not.toBeNull();
  });

  it("Keep local → local key untouched, resolves immediately", () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const onResolved = vi.fn();
    render(<AnonymousGameOnSignInPrompt onResolved={onResolved} />);
    fireEvent.click(screen.getByRole("button", { name: /keep local/i }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(GAME_STORAGE_KEY)).not.toBeNull();
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it("Discard → clears the local key, resolves immediately", () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const onResolved = vi.fn();
    render(<AnonymousGameOnSignInPrompt onResolved={onResolved} />);
    fireEvent.click(screen.getByRole("button", { name: /discard/i }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(GAME_STORAGE_KEY)).toBeNull();
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when there is no local game", () => {
    localStorage.clear();
    const onResolved = vi.fn();
    const { container } = render(
      <AnonymousGameOnSignInPrompt onResolved={onResolved} />,
    );
    expect(container.firstChild).toBeNull();
    // No local game → resolve immediately so the parent proceeds with redirect.
    expect(onResolved).toHaveBeenCalledTimes(1);
  });
});
