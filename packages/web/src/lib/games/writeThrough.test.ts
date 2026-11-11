/**
 * Tests for the web binding of library write-through.
 * Feature 009-account-library, task T032.
 *
 * The controller itself (POST-then-PATCH, idempotency, debouncing,
 * retries) is shared and tested in @thestats/app
 * (packages/app/src/games/writeThrough.test.ts). These tests cover the
 * hook: which store changes reach the controller, and its handle.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useGameStore } from "@/lib/store";
import { handleAccountGone } from "@/lib/account/account-gone";
import { useLibraryWriteThrough } from "./writeThrough";

vi.mock("@/lib/account/account-gone", () => ({ handleAccountGone: vi.fn() }));

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

  it("saves while the clock runs; ticks alone don't reset the debounce", async () => {
    const { unmount } = renderHook(() =>
      useLibraryWriteThrough({ signedIn: true, initialGameId: "live-1" }),
    );

    act(() => {
      useGameStore.setState({ clockRunning: true, currentPeriod: originalPeriod + 3 });
    });
    // A running clock ticks every animation frame (~16 ms).
    await act(async () => {
      for (let t = 0; t < 300; t += 16) {
        useGameStore.getState().tickClock(16);
        await vi.advanceTimersByTimeAsync(16);
      }
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/games/live-1");

    act(() => {
      useGameStore.setState({ clockRunning: false });
    });
    unmount();
  });
});

describe("useLibraryWriteThrough when the account is gone (feature 018)", () => {
  const originalFetch = globalThis.fetch;
  let originalPeriod: number;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(handleAccountGone).mockReset();
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { code: "account_deleted", message: "This account no longer exists." } }),
          { status: 401 },
        ),
    ) as unknown as typeof fetch;
    originalPeriod = useGameStore.getState().currentPeriod;
  });

  afterEach(() => {
    act(() => {
      useGameStore.setState({ currentPeriod: originalPeriod });
    });
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it("hands a refused save to handleAccountGone", async () => {
    const { unmount } = renderHook(() =>
      useLibraryWriteThrough({ signedIn: true, initialGameId: "seed-1" }),
    );

    act(() => {
      useGameStore.setState({ currentPeriod: originalPeriod + 1 });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(handleAccountGone).toHaveBeenCalledWith("deleted-elsewhere");
    unmount();
  });
});
