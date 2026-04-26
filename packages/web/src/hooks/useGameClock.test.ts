import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGameStore } from "@/lib/store";
import { useGameClock } from "./useGameClock";

/* ── rAF harness ───────────────────────────────────────────────────── */
/**
 * Manual frame stepper. We don't use timers because rAF callbacks accept a
 * monotonically increasing high-res timestamp; tying that to fake timers
 * makes the test brittle. Instead we capture the queued callback and call
 * it ourselves with a synthetic timestamp.
 */
function installRafHarness() {
  let pending: ((t: number) => void) | null = null;
  let nextHandle = 1;
  let lastHandle = 0;
  let cancelled = false;
  let now = 0;

  const raf = vi.fn((cb: (t: number) => void) => {
    pending = cb;
    lastHandle = nextHandle++;
    cancelled = false;
    return lastHandle;
  });
  const caf = vi.fn(() => {
    cancelled = true;
    pending = null;
  });

  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("cancelAnimationFrame", caf);

  return {
    raf,
    caf,
    /** Advance by `deltaMs` and fire the queued callback with the new timestamp. */
    step(deltaMs: number) {
      now += deltaMs;
      const cb = pending;
      pending = null;
      if (cb && !cancelled) cb(now);
    },
    isCancelled: () => cancelled,
    pendingCount: () => (pending ? 1 : 0),
  };
}

/* ── Tests ─────────────────────────────────────────────────────────── */

beforeEach(() => {
  useGameStore.getState().resetAll();
  // Move the store into a state where startClock will succeed.
  useGameStore.setState({
    status: "live",
    clockSeconds: 600,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useGameClock", () => {
  it("does not request a frame while clockRunning=false", () => {
    const harness = installRafHarness();
    renderHook(() => useGameClock());
    expect(harness.raf).not.toHaveBeenCalled();
  });

  it("starts the rAF loop when clockRunning flips to true", () => {
    const harness = installRafHarness();
    renderHook(() => useGameClock());
    act(() => {
      useGameStore.getState().startClock();
    });
    expect(harness.raf).toHaveBeenCalled();
  });

  it("ticks the store with the inter-frame delta", () => {
    const harness = installRafHarness();
    renderHook(() => useGameClock());
    act(() => {
      useGameStore.getState().startClock();
    });

    // First frame establishes the baseline; no tick is dispatched yet.
    act(() => harness.step(0));
    const before = useGameStore.getState().clockSeconds;

    // Second frame 1000ms later → store should subtract 1.0s
    act(() => harness.step(1000));
    expect(useGameStore.getState().clockSeconds).toBeCloseTo(before - 1.0, 5);
  });

  it("cancels the loop when clockRunning flips to false", () => {
    const harness = installRafHarness();
    renderHook(() => useGameClock());
    act(() => {
      useGameStore.getState().startClock();
    });
    expect(harness.raf).toHaveBeenCalled();

    act(() => {
      useGameStore.getState().stopClock();
    });
    expect(harness.caf).toHaveBeenCalled();
  });

  it("cancels the loop on unmount", () => {
    const harness = installRafHarness();
    const { unmount } = renderHook(() => useGameClock());
    act(() => {
      useGameStore.getState().startClock();
    });
    unmount();
    expect(harness.caf).toHaveBeenCalled();
  });
});
