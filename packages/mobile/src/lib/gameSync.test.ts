import { act, renderHook } from "@testing-library/react-native";
import { GAME_STORAGE_KEY } from "@thestats/app";
import Storage from "expo-sqlite/kv-store";
import { AppState, type AppStateStatus } from "react-native";

import { apiFetch } from "@/lib/api";
import { deviceStorage } from "@/lib/storage";
import { useGameStore } from "@/lib/store";

import { SYNC_STORAGE_KEY, claimDeviceGame, flushGameSync, useGameSync } from "./gameSync";

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
