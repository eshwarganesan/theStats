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
import type { PersistedGameRecord } from "@/lib/persistence";
import { WriteThroughController } from "./writeThrough";

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
