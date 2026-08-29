/**
 * Tests for the library write-through hook logic.
 * Feature 009-account-library, task T032.
 *
 * These tests exercise `WriteThroughController` — the pure, framework-free
 * class the hook wraps. Splitting the logic out keeps the tests focused on
 * behavior (POST-then-PATCH, idempotency, debouncing, no-op when
 * anonymous) without needing a full React render harness.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { PersistedGameRecord } from "@/lib/persistence";
import { useGameStore } from "@/lib/store";
import { WriteThroughController, useLibraryWriteThrough } from "./writeThrough";

function makeRecord(overrides: Partial<PersistedGameRecord> = {}): PersistedGameRecord {
  return {
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
    events: [],
    possession: "home",
    onCourt: { home: [], away: [] },
    ...overrides,
  };
}

describe("WriteThroughController", () => {
  const fetchMock = vi.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it("does nothing when the session is anonymous", async () => {
    const ctrl = new WriteThroughController({ signedIn: false, debounceMs: 250 });
    ctrl.onCommit(makeRecord());
    await vi.runAllTimersAsync();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs on the first commit, then PATCHes on subsequent commits", async () => {
    fetchMock.mockImplementationOnce(async () =>
      new Response(JSON.stringify({ game: { id: "game-1" } }), { status: 201 }),
    );
    fetchMock.mockImplementationOnce(async () =>
      new Response(JSON.stringify({ game: { id: "game-1" } }), { status: 200 }),
    );

    const ctrl = new WriteThroughController({ signedIn: true, debounceMs: 250 });

    ctrl.onCommit(makeRecord());
    await vi.advanceTimersByTimeAsync(250);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0]!;
    expect(firstCall[0]).toBe("/api/games");
    const firstInit = firstCall[1] as RequestInit;
    expect(firstInit.method).toBe("POST");
    const firstHeaders = firstInit.headers as Record<string, string>;
    expect(firstHeaders["Idempotency-Key"]).toBeDefined();

    ctrl.onCommit(makeRecord({ currentPeriod: 2 }));
    await vi.advanceTimersByTimeAsync(250);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCall = fetchMock.mock.calls[1]!;
    expect(secondCall[0]).toBe("/api/games/game-1");
    const secondInit = secondCall[1] as RequestInit;
    expect(secondInit.method).toBe("PATCH");
  });

  it("PATCHes an adopted game id without POSTing first", async () => {
    // Mirrors the "Save to my account" flow: the row already exists, so the
    // controller adopts its id and the next commit PATCHes rather than
    // creating a duplicate.
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ game: { id: "adopted-1" } }), { status: 200 }),
    );
    const ctrl = new WriteThroughController({ signedIn: true, debounceMs: 250 });

    ctrl.setGameId("adopted-1");
    expect(ctrl.currentGameId()).toBe("adopted-1");

    ctrl.onCommit(makeRecord({ currentPeriod: 2 }));
    await vi.advanceTimersByTimeAsync(250);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe("/api/games/adopted-1");
    expect((call[1] as RequestInit).method).toBe("PATCH");
  });

  it("uses a unique Idempotency-Key per debounced write", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ game: { id: "game-1" } }), { status: 201 }),
    );

    const ctrl = new WriteThroughController({ signedIn: true, debounceMs: 250 });

    ctrl.onCommit(makeRecord({ currentPeriod: 1 }));
    await vi.advanceTimersByTimeAsync(250);

    ctrl.onCommit(makeRecord({ currentPeriod: 2 }));
    await vi.advanceTimersByTimeAsync(250);

    ctrl.onCommit(makeRecord({ currentPeriod: 3 }));
    await vi.advanceTimersByTimeAsync(250);

    const keys = fetchMock.mock.calls.map(
      (c) => ((c[1] as RequestInit).headers as Record<string, string>)["Idempotency-Key"],
    );
    expect(new Set(keys).size).toBe(3);
  });

  it("collapses 5 rapid commits into 1 request after the debounce window", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ game: { id: "game-1" } }), { status: 201 }),
    );
    const ctrl = new WriteThroughController({ signedIn: true, debounceMs: 250 });

    for (let i = 0; i < 5; i++) {
      ctrl.onCommit(makeRecord({ currentPeriod: i + 1 }));
      await vi.advanceTimersByTimeAsync(50); // < debounce
    }
    await vi.advanceTimersByTimeAsync(250);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe("/api/games");
    const body = JSON.parse((call[1] as RequestInit).body as string);
    // The final commit's currentPeriod (5) should be what's sent.
    expect(body.state.currentPeriod).toBe(5);
  });

  it("does not touch localStorage — feature 006's persist slice remains untouched", async () => {
    // The controller sends HTTP calls; it never reads or writes localStorage.
    // Fail loudly if it starts to.
    const setSpy = vi.spyOn(Storage.prototype, "setItem");
    const removeSpy = vi.spyOn(Storage.prototype, "removeItem");

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ game: { id: "game-1" } }), { status: 201 }),
    );

    const ctrl = new WriteThroughController({ signedIn: true, debounceMs: 250 });
    ctrl.onCommit(makeRecord());
    await vi.advanceTimersByTimeAsync(250);

    expect(setSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();
  });
});

describe("useLibraryWriteThrough (hook)", () => {
  const fetchMock = vi.fn();
  const originalFetch = globalThis.fetch;
  let originalPeriod: number;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ game: { id: "hook-1" } }), { status: 201 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    originalPeriod = useGameStore.getState().currentPeriod;
  });

  afterEach(() => {
    // Restore the shared store field mutated to trigger a commit so the
    // change doesn't leak into sibling tests in this file.
    act(() => {
      useGameStore.setState({ currentPeriod: originalPeriod });
    });
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it("adopts an initial game id and PATCHes committed store changes", async () => {
    const { unmount } = renderHook(() =>
      useLibraryWriteThrough({ signedIn: true, initialGameId: "seed-1" }),
    );

    // A store commit debounces then flushes as a PATCH on the adopted id.
    act(() => {
      useGameStore.setState({ currentPeriod: originalPeriod + 1 });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/games/seed-1");
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe("PATCH");

    unmount();
  });

  it("exposes adoptGameId so a later commit PATCHes the adopted row", async () => {
    const { result } = renderHook(() =>
      useLibraryWriteThrough({ signedIn: true }),
    );

    act(() => {
      result.current.adoptGameId("adopted-9");
    });

    act(() => {
      useGameStore.setState({ currentPeriod: originalPeriod + 2 });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/games/adopted-9");
  });

  it("saveNow flushes the current store state immediately as a POST", async () => {
    const { result } = renderHook(() =>
      useLibraryWriteThrough({ signedIn: true }),
    );

    await act(async () => {
      await result.current.saveNow();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/games");
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe("POST");
    expect(result.current.status).toBe("saved");
  });
});
