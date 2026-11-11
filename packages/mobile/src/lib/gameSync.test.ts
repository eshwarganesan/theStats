import { act, renderHook } from "@testing-library/react-native";
import { CLOCK_CHECKPOINT_KEY, GAME_STORAGE_KEY, toPersistedGameRecord } from "@thestats/app";
import Storage from "expo-sqlite/kv-store";
import { AppState, type AppStateStatus } from "react-native";

import { apiFetch } from "@/lib/api";
import { deviceStorage } from "@/lib/storage";
import { useGameStore } from "@/lib/store";
import { startLiveGame } from "@/test/gameFixtures";

import {
  SYNC_STORAGE_KEY,
  claimDeviceGame,
  continueSavedGame,
  deviceGameId,
  deviceGameOwner,
  flushGameSync,
  forgetDeviceGame,
  hasUnsavedGameChanges,
  startNewGame,
  useGameSync,
} from "./gameSync";

jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
const apiFetchMock = jest.mocked(apiFetch);

let appStateListener: ((state: AppStateStatus) => void) | undefined;
const removeAppStateListener = jest.fn();

const created = (id = "game-1") => new Response(JSON.stringify({ game: { id } }), { status: 201 });
const ok = () => new Response("{}", { status: 200 });

function storedSync(): unknown {
  const raw = deviceStorage.getItem(SYNC_STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

function seedSync(value: Record<string, unknown>): void {
  deviceStorage.setItem(
    SYNC_STORAGE_KEY,
    JSON.stringify({ schemaVersion: 1, gameId: null, createKey: null, unsaved: false, ...value }),
  );
}

function request(n: number) {
  const [path, init] = apiFetchMock.mock.calls[n] ?? [];
  return { path, method: init?.method, body: JSON.parse(String(init?.body)) };
}

/** Commit a change to the device's game record. */
async function score(period: number) {
  await act(async () => {
    useGameStore.setState({ currentPeriod: period });
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  apiFetchMock.mockReset();
  removeAppStateListener.mockReset();
  appStateListener = undefined;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    appStateListener = listener;
    return { remove: removeAppStateListener };
  });
  useGameStore.getState().resetAll();
  deviceStorage.removeItem(SYNC_STORAGE_KEY);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("claimDeviceGame", () => {
  it("records the owner of a device that has no sync record yet", () => {
    useGameStore.getState().setTeam("home", { name: "Kept" });
    claimDeviceGame("user-a");

    expect(storedSync()).toEqual({
      schemaVersion: 1,
      userId: "user-a",
      gameId: null,
      createKey: null,
      unsaved: false,
    });
    expect(useGameStore.getState().homeTeam.name).toBe("Kept");
  });

  it("keeps the same user's game, unsaved changes included", () => {
    useGameStore.getState().setTeam("home", { name: "Mine" });
    seedSync({ userId: "user-a", gameId: "g1", unsaved: true });

    claimDeviceGame("user-a");

    expect(storedSync()).toMatchObject({ userId: "user-a", gameId: "g1", unsaved: true });
    expect(useGameStore.getState().homeTeam.name).toBe("Mine");
  });

  it.each([
    ["another account's", () => seedSync({ userId: "user-a", gameId: "g1" })],
    ["an unreadable", () => deviceStorage.setItem(SYNC_STORAGE_KEY, "{not json")],
    ["a malformed", () => deviceStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify({ userId: 7 }))],
    ["a non-object", () => deviceStorage.setItem(SYNC_STORAGE_KEY, "42")],
  ])("clears the game when it has %s sync record", (_label, seed) => {
    useGameStore.getState().setTeam("home", { name: "Theirs" });
    seed();

    claimDeviceGame("user-b");

    expect(useGameStore.getState().homeTeam.name).not.toBe("Theirs");
    expect(deviceStorage.getItem(GAME_STORAGE_KEY)).toBeNull();
    expect(storedSync()).toEqual({
      schemaVersion: 1,
      userId: "user-b",
      gameId: null,
      createKey: null,
      unsaved: false,
    });
  });
});

describe("when device storage fails", () => {
  it("clears the game if the owner can't be read", () => {
    useGameStore.getState().setTeam("home", { name: "Unknown owner" });
    jest.spyOn(deviceStorage, "getItem").mockImplementation(() => {
      throw new Error("disk I/O error");
    });

    claimDeviceGame("user-b");

    expect(useGameStore.getState().homeTeam.name).not.toBe("Unknown owner");
  });

  it("keeps syncing when the sync record can't be written", async () => {
    apiFetchMock.mockResolvedValueOnce(created()).mockResolvedValueOnce(ok());
    jest.spyOn(deviceStorage, "setItem").mockImplementation((key, value) => {
      if (key === SYNC_STORAGE_KEY) throw new Error("disk full");
      Storage.setItemSync(key, value);
    });
    await renderHook(() => useGameSync("user-a"));

    await score(2);
    await act(() => jest.advanceTimersByTimeAsync(250));
    await score(3);
    await act(() => jest.advanceTimersByTimeAsync(250));

    expect(request(1)).toMatchObject({ path: "/api/games/game-1", method: "PATCH" });
  });
});

describe("useGameSync", () => {
  it("saves committed changes with the bearer-token client and remembers the game id", async () => {
    apiFetchMock.mockResolvedValueOnce(created()).mockResolvedValueOnce(ok());
    await renderHook(() => useGameSync("user-a"));

    await score(2);
    await act(() => jest.advanceTimersByTimeAsync(250));
    await score(3);
    await act(() => jest.advanceTimersByTimeAsync(250));

    expect(request(0)).toMatchObject({ path: "/api/games", method: "POST" });
    expect(request(1)).toMatchObject({ path: "/api/games/game-1", method: "PATCH" });
    expect(request(1).body.state.currentPeriod).toBe(3);
    expect(storedSync()).toEqual({
      schemaVersion: 1,
      userId: "user-a",
      gameId: "game-1",
      createKey: null,
      unsaved: false,
    });
  });

  it("finishes an unsaved write left over from before a restart", async () => {
    apiFetchMock.mockResolvedValue(ok());
    await score(4);
    seedSync({ userId: "user-a", gameId: "g1", unsaved: true });

    await renderHook(() => useGameSync("user-a"));
    await act(() => jest.advanceTimersByTimeAsync(250));

    expect(request(0)).toMatchObject({ path: "/api/games/g1", method: "PATCH" });
    expect(request(0).body.state.currentPeriod).toBe(4);
    expect(storedSync()).toMatchObject({ unsaved: false });
  });

  it("doesn't write on launch when everything was saved", async () => {
    seedSync({ userId: "user-a", gameId: "g1", unsaved: false });
    await renderHook(() => useGameSync("user-a"));
    await act(() => jest.advanceTimersByTimeAsync(60_000));
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("never resumes another account's game", async () => {
    apiFetchMock.mockResolvedValue(created("mine"));
    seedSync({ userId: "user-a", gameId: "theirs", unsaved: true });

    await renderHook(() => useGameSync("user-b"));
    await act(() => jest.advanceTimersByTimeAsync(250));
    expect(apiFetchMock).not.toHaveBeenCalled();

    await score(2);
    await act(() => jest.advanceTimersByTimeAsync(250));
    expect(request(0)).toMatchObject({ path: "/api/games", method: "POST" });
  });

  it("retries a failed write with backoff, and right away when the app returns", async () => {
    apiFetchMock
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new TypeError("Network request failed"))
      .mockResolvedValueOnce(created());
    await renderHook(() => useGameSync("user-a"));

    await score(2);
    await act(() => jest.advanceTimersByTimeAsync(250));
    expect(storedSync()).toMatchObject({ unsaved: true, createKey: expect.any(String) });

    await act(() => jest.advanceTimersByTimeAsync(2_000));
    expect(apiFetchMock).toHaveBeenCalledTimes(2);

    await act(async () => appStateListener?.("active"));
    expect(apiFetchMock).toHaveBeenCalledTimes(3);
    expect(storedSync()).toMatchObject({ gameId: "game-1", unsaved: false });
  });

  it("writes pending changes as soon as the app is backgrounded", async () => {
    apiFetchMock.mockResolvedValue(created());
    await renderHook(() => useGameSync("user-a"));

    await score(2);
    await act(async () => appStateListener?.("background"));

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops syncing when unmounted (signed out)", async () => {
    apiFetchMock.mockResolvedValue(created());
    const { unmount } = await renderHook(() => useGameSync("user-a"));

    await score(2);
    await unmount();
    await act(() => jest.advanceTimersByTimeAsync(60_000));

    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(removeAppStateListener).toHaveBeenCalled();
    expect(storedSync()).toMatchObject({ unsaved: true });
  });
});

describe("flushGameSync", () => {
  it("does nothing when sync isn't running", async () => {
    await expect(flushGameSync()).resolves.toBeUndefined();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("writes pending changes immediately", async () => {
    apiFetchMock.mockResolvedValue(created());
    await renderHook(() => useGameSync("user-a"));
    await score(2);

    await act(() => flushGameSync());

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after the timeout when the connection hangs", async () => {
    apiFetchMock.mockReturnValue(new Promise(() => {}));
    await renderHook(() => useGameSync("user-a"));
    await score(2);

    let settled = false;
    const flushed = flushGameSync(1_000).then(() => {
      settled = true;
    });
    await act(() => jest.advanceTimersByTimeAsync(999));
    expect(settled).toBe(false);
    await act(() => jest.advanceTimersByTimeAsync(1));
    await flushed;
    expect(settled).toBe(true);
  });
});

describe("hasUnsavedGameChanges", () => {
  it("is true from a change until the server has it", async () => {
    apiFetchMock.mockResolvedValue(created());
    await renderHook(() => useGameSync("user-a"));
    expect(hasUnsavedGameChanges()).toBe(false);

    await score(2);
    expect(hasUnsavedGameChanges()).toBe(true);

    await act(() => jest.advanceTimersByTimeAsync(250));
    expect(hasUnsavedGameChanges()).toBe(false);
  });

  it("reads the saved sync record when sync isn't running", () => {
    expect(hasUnsavedGameChanges()).toBe(false);
    seedSync({ userId: "user-a", gameId: "g1", unsaved: true });
    expect(hasUnsavedGameChanges()).toBe(true);
  });
});

describe("startNewGame", () => {
  it("resets the game and saves the next one as a new library entry", async () => {
    apiFetchMock.mockResolvedValueOnce(created("old")).mockResolvedValueOnce(created("new"));
    await renderHook(() => useGameSync("user-a"));
    await act(async () => useGameStore.getState().setTeam("home", { name: "Last week" }));
    await act(() => jest.advanceTimersByTimeAsync(250));

    await act(async () => startNewGame());
    expect(useGameStore.getState().homeTeam.name).toBe("Home Team");
    await act(() => jest.advanceTimersByTimeAsync(250));

    expect(request(1)).toMatchObject({ path: "/api/games", method: "POST" });
    expect(request(1).body.state.homeTeam.name).toBe("Home Team");
    expect(storedSync()).toMatchObject({ gameId: "new", unsaved: false });
  });

  it("lets go of the saved game when sync isn't running", () => {
    seedSync({ userId: "user-a", gameId: "g1", createKey: "k1", unsaved: true });
    useGameStore.getState().setTeam("home", { name: "Old" });

    startNewGame();

    expect(storedSync()).toEqual({
      schemaVersion: 1,
      userId: "user-a",
      gameId: null,
      createKey: null,
      unsaved: false,
    });
    expect(useGameStore.getState().homeTeam.name).toBe("Home Team");
  });

  it("works on a device with no sync record", () => {
    startNewGame();
    expect(storedSync()).toBeNull();
    expect(useGameStore.getState().status).toBe("setup");
  });
});

describe("deviceGameId", () => {
  it("is the library id sync is writing to", async () => {
    apiFetchMock.mockResolvedValueOnce(created("game-7"));
    await renderHook(() => useGameSync("user-a"));
    expect(deviceGameId()).toBeNull();

    await score(2);
    await act(() => jest.advanceTimersByTimeAsync(250));
    expect(deviceGameId()).toBe("game-7");
  });

  it("reads the saved sync record when sync isn't running", () => {
    expect(deviceGameId()).toBeNull();
    seedSync({ userId: "user-a", gameId: "g9" });
    expect(deviceGameId()).toBe("g9");
  });
});

describe("continueSavedGame", () => {
  /** A game in progress, as the library returns it. */
  function savedGame() {
    startLiveGame();
    useGameStore.getState().setTeam("home", { name: "Saved Central" });
    const record = toPersistedGameRecord(useGameStore.getState());
    useGameStore.getState().resetAll();
    return record;
  }

  it("loads the game and saves its changes to that library entry", async () => {
    const record = savedGame();
    apiFetchMock.mockResolvedValue(ok());
    await renderHook(() => useGameSync("user-a"));

    await act(async () => continueSavedGame("saved-1", record));
    expect(useGameStore.getState()).toMatchObject({
      status: "live",
      clockSeconds: 600,
      clockRunning: false,
    });
    expect(useGameStore.getState().homeTeam.name).toBe("Saved Central");
    expect(deviceGameId()).toBe("saved-1");

    await score(3);
    await act(() => jest.advanceTimersByTimeAsync(250));
    expect(request(0)).toMatchObject({ path: "/api/games/saved-1", method: "PATCH" });
    expect(request(0).body.state.currentPeriod).toBe(3);
  });

  it("replaces a game in progress on the device, clock checkpoint included", async () => {
    const record = savedGame();
    startLiveGame();
    useGameStore.getState().adjustClock(42);
    deviceStorage.setItem(
      "thestats.clock.v1",
      JSON.stringify({ schemaVersion: 1, clockSeconds: 42, breakSeconds: 0, savedAt: 1 }),
    );

    continueSavedGame("saved-2", record);

    expect(useGameStore.getState().homeTeam.name).toBe("Saved Central");
    expect(useGameStore.getState().clockSeconds).toBe(600);
  });

  it("records the switch when sync isn't running", () => {
    seedSync({ userId: "user-a", gameId: "old", createKey: "k", unsaved: true });
    continueSavedGame("saved-3", savedGame());
    expect(storedSync()).toEqual({
      schemaVersion: 1,
      userId: "user-a",
      gameId: "saved-3",
      createKey: null,
      unsaved: false,
    });
  });
});

describe("forgetDeviceGame (feature 018)", () => {
  it("drops unsent changes and clears the game, its clock and the sync record", async () => {
    apiFetchMock.mockResolvedValue(created());
    seedSync({ userId: "u1" });
    renderHook(() => useGameSync("u1"));
    await score(2);
    deviceStorage.setItem(CLOCK_CHECKPOINT_KEY, JSON.stringify({ clockSeconds: 1, breakSeconds: 0, savedAt: 0 }));

    forgetDeviceGame();
    await act(async () => {
      jest.runAllTimers();
    });

    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(useGameStore.getState().currentPeriod).not.toBe(2);
    expect(deviceStorage.getItem(GAME_STORAGE_KEY)).toBeNull();
    expect(deviceStorage.getItem(CLOCK_CHECKPOINT_KEY)).toBeNull();
    expect(storedSync()).toBeNull();
  });

  it("is safe when sync isn't running", () => {
    seedSync({ userId: "u1" });
    expect(() => forgetDeviceGame()).not.toThrow();
    expect(storedSync()).toBeNull();
  });
});

describe("deviceGameOwner (feature 018)", () => {
  it("names the account the device's game belongs to", () => {
    seedSync({ userId: "u1" });
    expect(deviceGameOwner()).toBe("u1");
  });

  it("is null without a sync record", () => {
    expect(deviceGameOwner()).toBeNull();
  });

  it("is null when the record can't be read", () => {
    deviceStorage.setItem(SYNC_STORAGE_KEY, "{not json");
    expect(deviceGameOwner()).toBeNull();
  });
});
