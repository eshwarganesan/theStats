import { act, renderHook } from "@testing-library/react-native";
import { readClockCheckpoint } from "@thestats/app";
import { AppState, type AppStateStatus } from "react-native";

import { deviceStorage } from "@/lib/storage";
import { useGameStore } from "@/lib/store";
import { startLiveGame } from "@/test/gameFixtures";

import { CLOCK_TICK_MS, isClockCounting, useClockCheckpoint, useGameClock } from "./gameClock";

let appStateListener: ((state: AppStateStatus) => void) | undefined;
const removeAppStateListener = jest.fn();

const clock = () => useGameStore.getState().clockSeconds;
const checkpoint = () => readClockCheckpoint(deviceStorage);

async function advance(ms: number) {
  await act(() => jest.advanceTimersByTimeAsync(ms));
}

async function run(action: () => void) {
  await act(async () => action());
}

beforeEach(() => {
  jest.useFakeTimers();
  appStateListener = undefined;
  removeAppStateListener.mockReset();
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    appStateListener = listener;
    return { remove: removeAppStateListener };
  });
  startLiveGame();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("isClockCounting", () => {
  it.each([
    [{ clockRunning: true, status: "live", breakSeconds: 0 }, true],
    [{ clockRunning: false, status: "live", breakSeconds: 0 }, false],
    [{ clockRunning: false, status: "timeout", breakSeconds: 12 }, true],
    [{ clockRunning: false, status: "period-break", breakSeconds: 0.5 }, true],
    [{ clockRunning: false, status: "period-break", breakSeconds: 0 }, false],
    [{ clockRunning: false, status: "finished", breakSeconds: 5 }, false],
  ] as const)("%o → %s", (state, expected) => {
    expect(isClockCounting(state)).toBe(expected);
  });
});

describe("useGameClock", () => {
  it("counts the game clock down while it runs, and holds it when stopped", async () => {
    await renderHook(() => useGameClock());
    await run(() => useGameStore.getState().startClock());

    await advance(1_000);
    expect(clock()).toBeCloseTo(599, 5);

    await run(() => useGameStore.getState().stopClock());
    await advance(5_000);
    expect(clock()).toBeCloseTo(599, 5);
  });

  it("catches up on time that passed while the app was in the background", async () => {
    await renderHook(() => useGameClock());
    await run(() => useGameStore.getState().startClock());

    // iOS suspends the app: no timer fires, but the game goes on.
    jest.setSystemTime(Date.now() + 30_000);
    await advance(CLOCK_TICK_MS);

    expect(clock()).toBeCloseTo(600 - 30 - CLOCK_TICK_MS / 1000, 5);
  });

  it("stops ticking at the buzzer", async () => {
    const tick = jest.fn(useGameStore.getState().tickClock);
    useGameStore.setState({ tickClock: tick });
    await run(() => useGameStore.getState().adjustClock(1));
    await renderHook(() => useGameClock());
    await run(() => useGameStore.getState().startClock());

    await advance(1_500);
    expect(clock()).toBe(0);
    expect(useGameStore.getState().clockRunning).toBe(false);

    tick.mockClear();
    await advance(1_000);
    expect(tick).not.toHaveBeenCalled();
  });

  it("counts a timeout down and stops when it runs out", async () => {
    await renderHook(() => useGameClock());
    await run(() => useGameStore.getState().recordTimeout("home"));

    await advance(1_000);
    expect(useGameStore.getState().breakSeconds).toBeCloseTo(59, 5);
    expect(clock()).toBe(600);

    await advance(60_000);
    expect(useGameStore.getState().breakSeconds).toBe(0);
    expect(isClockCounting(useGameStore.getState())).toBe(false);
  });
});

describe("useClockCheckpoint", () => {
  it("checkpoints the clock once a second while it runs, and where it stopped", async () => {
    await renderHook(() => {
      useGameClock();
      useClockCheckpoint();
    });

    await run(() => useGameStore.getState().startClock());
    expect(checkpoint()?.clockSeconds).toBe(600);

    // Taken at the 1 s mark, at most one tick behind the clock.
    await advance(1_000);
    const saved = checkpoint()?.clockSeconds ?? Number.NaN;
    expect(Math.abs(saved - 599)).toBeLessThanOrEqual(CLOCK_TICK_MS / 1000 + 1e-9);

    await advance(500);
    await run(() => useGameStore.getState().stopClock());
    expect(checkpoint()).toMatchObject({ clockSeconds: clock(), breakSeconds: 0 });
    expect(clock()).toBeCloseTo(598.5, 5);
  });

  it("checkpoints whenever the app leaves the foreground, running or not", async () => {
    await renderHook(() => useClockCheckpoint());
    await run(() => useGameStore.getState().adjustClock(300));

    await run(() => appStateListener?.("inactive"));
    expect(checkpoint()).toMatchObject({ clockSeconds: 300, savedAt: Date.now() });

    await run(() => useGameStore.getState().adjustClock(240));
    await run(() => appStateListener?.("active"));
    expect(checkpoint()?.clockSeconds).toBe(300);

    await run(() => appStateListener?.("background"));
    expect(checkpoint()?.clockSeconds).toBe(240);
  });

  it("stops listening when unmounted", async () => {
    const { unmount } = await renderHook(() => useClockCheckpoint());
    await unmount();
    expect(removeAppStateListener).toHaveBeenCalled();
  });
});
