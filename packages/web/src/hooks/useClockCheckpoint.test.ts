/**
 * Failing-first tests for `useClockCheckpoint`.
 *
 * The hook is responsible for the user-facing guarantee that a refresh
 * during a running clock or break countdown restores within 1 second of
 * its pre-refresh value (FR-005 / FR-006 / SC-002).
 *
 * Coverage:
 *   - Writes the checkpoint at most once per second while either
 *     `clockRunning` is true OR status is `timeout` or `period-break`.
 *   - Writes synchronously on `pagehide` and on `visibilitychange:
 *     hidden`.
 *   - Does NOT write while the game clock is stopped and not in a break.
 *   - Cleans up its interval/listeners on unmount.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useClockCheckpoint } from "./useClockCheckpoint";
import { useGameStore } from "@/lib/store";
import {
  CLOCK_CHECKPOINT_KEY,
  readClockCheckpoint,
} from "@/lib/persistence";

beforeEach(() => {
  localStorage.clear();
  useGameStore.getState().resetAll();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useClockCheckpoint", () => {
  it("writes nothing while the clock is stopped and no break is active", () => {
    renderHook(() => useClockCheckpoint());
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(localStorage.getItem(CLOCK_CHECKPOINT_KEY)).toBeNull();
  });

  it("writes the current clockSeconds/breakSeconds while clockRunning is true", () => {
    useGameStore.setState({
      status: "live",
      clockRunning: true,
      clockSeconds: 540,
      breakSeconds: 0,
    });
    renderHook(() => useClockCheckpoint());
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    const cp = readClockCheckpoint();
    expect(cp).not.toBeNull();
    expect(cp!.clockSeconds).toBe(540);
    expect(cp!.breakSeconds).toBe(0);
  });

  it("writes for timeout/period-break statuses even when clockRunning is false", () => {
    useGameStore.setState({
      status: "timeout",
      clockRunning: false,
      clockSeconds: 540,
      breakSeconds: 30,
    });
    renderHook(() => useClockCheckpoint());
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    const cp = readClockCheckpoint();
    expect(cp).not.toBeNull();
    expect(cp!.breakSeconds).toBe(30);
  });

  it("writes at most once per second (rate-limited)", () => {
    useGameStore.setState({
      status: "live",
      clockRunning: true,
      clockSeconds: 600,
      breakSeconds: 0,
    });
    const spy = vi.spyOn(localStorage, "setItem");
    renderHook(() => useClockCheckpoint());
    act(() => {
      vi.advanceTimersByTime(3200);
    });
    // 3.2 s elapsed at 1 Hz → at most 4 writes (frames at 0 ms, 1000,
    // 2000, 3000). Allow 1-4 to accommodate timer scheduling jitter.
    const checkpointWrites = spy.mock.calls.filter(
      ([key]) => key === CLOCK_CHECKPOINT_KEY,
    );
    expect(checkpointWrites.length).toBeGreaterThanOrEqual(1);
    expect(checkpointWrites.length).toBeLessThanOrEqual(4);
  });

  it("writes synchronously on visibilitychange:hidden", () => {
    useGameStore.setState({
      status: "live",
      clockRunning: true,
      clockSeconds: 271,
      breakSeconds: 0,
    });
    renderHook(() => useClockCheckpoint());
    // Trigger the visibility transition WITHOUT advancing timers — the
    // write must happen immediately, not on the next interval tick.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const cp = readClockCheckpoint();
    expect(cp).not.toBeNull();
    expect(cp!.clockSeconds).toBe(271);
  });

  it("writes synchronously on pagehide", () => {
    useGameStore.setState({
      status: "live",
      clockRunning: true,
      clockSeconds: 99,
      breakSeconds: 0,
    });
    renderHook(() => useClockCheckpoint());
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    const cp = readClockCheckpoint();
    expect(cp).not.toBeNull();
    expect(cp!.clockSeconds).toBe(99);
  });

  it("cleans up listeners and interval on unmount", () => {
    useGameStore.setState({
      status: "live",
      clockRunning: true,
      clockSeconds: 500,
      breakSeconds: 0,
    });
    const { unmount } = renderHook(() => useClockCheckpoint());
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    localStorage.removeItem(CLOCK_CHECKPOINT_KEY);
    unmount();
    act(() => {
      vi.advanceTimersByTime(3000);
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(localStorage.getItem(CLOCK_CHECKPOINT_KEY)).toBeNull();
  });
});
