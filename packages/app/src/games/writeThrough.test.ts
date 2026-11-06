/**
 * Tests for the shared write-through controller (feature 009-account-
 * library, T032) and its store binding. The controller is framework-free,
 * so every request goes through an injected `fetch` and timers are fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistedGameRecord } from "../persistence";
import { createGameStore } from "../store";
import {
  WriteThroughController,
  subscribeToGameRecord,
  type SyncState,
  type WriteThroughOptions,
} from "./writeThrough";

function makeRecord(overrides: Partial<PersistedGameRecord> = {}): PersistedGameRecord {
  return {
    schemaVersion: 1,
    homeTeam: { id: "home", name: "Home", tag: "HOM", color: "#ff0000", coach: "", roster: [] },
    awayTeam: { id: "away", name: "Away", tag: "AWY", color: "#0000ff", coach: "", roster: [] },
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

const created = (id = "game-1") => new Response(JSON.stringify({ game: { id } }), { status: 201 });
const replayed = (id = "game-1") => new Response(JSON.stringify({ game: { id } }), { status: 200 });
const ok = () => new Response("{}", { status: 200 });
const status = (code: number) => new Response(null, { status: code });

const fetchMock = vi.fn<(path: string, init: RequestInit) => Promise<Response>>();

function controller(opts: Partial<WriteThroughOptions> = {}) {
  return new WriteThroughController({ signedIn: true, debounceMs: 250, fetch: fetchMock, ...opts });
}

function call(n: number) {
  const entry = fetchMock.mock.calls[n];
  if (!entry) throw new Error(`no request #${n}`);
  const [path, init] = entry;
  const headers = init.headers as Record<string, string>;
  return {
    path,
    method: init.method,
    key: headers["Idempotency-Key"],
    body: JSON.parse(init.body as string) as { state: PersistedGameRecord },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("WriteThroughController", () => {
  it("does nothing when the session is anonymous", async () => {
    const ctrl = controller({ signedIn: false });
    ctrl.onCommit(makeRecord());
    await ctrl.saveNow(makeRecord());
    await vi.runAllTimersAsync();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs on the first commit, then PATCHes on subsequent commits", async () => {
    fetchMock.mockResolvedValueOnce(created()).mockResolvedValueOnce(ok());
    const onStatus = vi.fn();
    const ctrl = controller({ onStatus });

    ctrl.onCommit(makeRecord());
    await vi.advanceTimersByTimeAsync(250);
    expect(call(0)).toMatchObject({ path: "/api/games", method: "POST" });
    expect(call(0).key).toEqual(expect.any(String));
    expect(ctrl.currentGameId()).toBe("game-1");

    ctrl.onCommit(makeRecord({ currentPeriod: 2 }));
    await vi.advanceTimersByTimeAsync(250);
    expect(call(1)).toMatchObject({ path: "/api/games/game-1", method: "PATCH" });
    expect(call(1).body.state.currentPeriod).toBe(2);
    expect(onStatus.mock.calls.map(([s]) => s)).toEqual(["saving", "saved", "saving", "saved"]);
  });

  it("collapses rapid commits into one request after the debounce window", async () => {
    fetchMock.mockResolvedValue(created());
    const ctrl = controller();

    for (let i = 0; i < 5; i++) {
      ctrl.onCommit(makeRecord({ currentPeriod: i + 1 }));
      await vi.advanceTimersByTimeAsync(50);
    }
    await vi.advanceTimersByTimeAsync(250);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(call(0).body.state.currentPeriod).toBe(5);
  });

  it("uses the global fetch with same-origin paths by default", async () => {
    const globalFetch = vi.fn(async () => created());
    vi.stubGlobal("fetch", globalFetch);
    const ctrl = new WriteThroughController({ signedIn: true });

    await ctrl.saveNow(makeRecord());

    expect(globalFetch).toHaveBeenCalledWith("/api/games", expect.objectContaining({ method: "POST" }));
  });

  describe("idempotency", () => {
    it("reuses the POST key until a POST succeeds, then mints one per PATCH", async () => {
      fetchMock
        .mockResolvedValueOnce(status(500))
        .mockRejectedValueOnce(new TypeError("network down"))
        .mockResolvedValueOnce(created())
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(ok());
      const ctrl = controller();

      for (let i = 1; i <= 5; i++) await ctrl.saveNow(makeRecord({ currentPeriod: i }));

      const keys = fetchMock.mock.calls.map((_, n) => call(n).key);
      expect(keys[0]).toBe(keys[1]);
      expect(keys[1]).toBe(keys[2]);
      expect(new Set(keys).size).toBe(3);
      expect([call(3).method, call(4).method]).toEqual(["PATCH", "PATCH"]);
    });

    it("re-sends the record as a PATCH when a retried POST replays the original row", async () => {
      fetchMock.mockResolvedValueOnce(replayed("first-attempt")).mockResolvedValueOnce(ok());
      const onStatus = vi.fn();
      const ctrl = controller({ onStatus });

      await ctrl.saveNow(makeRecord({ currentPeriod: 3 }));

      expect(call(1)).toMatchObject({ path: "/api/games/first-attempt", method: "PATCH" });
      expect(call(1).body.state.currentPeriod).toBe(3);
      expect(onStatus.mock.calls.map(([s]) => s)).toEqual(["saving", "saving", "saved"]);
    });

    it("treats a success without a game id as a failure and keeps the key", async () => {
      fetchMock
        .mockResolvedValueOnce(new Response("not json", { status: 201 }))
        .mockResolvedValueOnce(new Response("42", { status: 201 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ game: {} }), { status: 201 }))
        .mockResolvedValueOnce(created());
      const onStatus = vi.fn();
      const ctrl = controller({ onStatus });

      await ctrl.saveNow(makeRecord());
      expect(onStatus).toHaveBeenLastCalledWith("error");
      for (let i = 0; i < 3; i++) await ctrl.saveNow(makeRecord());

      expect(new Set(fetchMock.mock.calls.map((_, n) => call(n).key)).size).toBe(1);
      expect(ctrl.currentGameId()).toBe("game-1");
    });
  });

  describe("failures", () => {
    it("reports an error and retries the POST on the next commit (no retry policy)", async () => {
      fetchMock.mockResolvedValueOnce(status(500)).mockResolvedValueOnce(created());
      const onStatus = vi.fn();
      const ctrl = controller({ onStatus });

      ctrl.onCommit(makeRecord());
      await vi.advanceTimersByTimeAsync(250);
      expect(onStatus).toHaveBeenLastCalledWith("error");
      expect(ctrl.currentGameId()).toBeNull();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      ctrl.onCommit(makeRecord({ currentPeriod: 2 }));
      await vi.advanceTimersByTimeAsync(250);
      expect(call(1).method).toBe("POST");
      expect(onStatus).toHaveBeenLastCalledWith("saved");
    });

    it("keeps a failed record queued so a later flush sends it", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(created());
      const ctrl = controller();

      await ctrl.saveNow(makeRecord({ currentPeriod: 2 }));
      await ctrl.flush();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(call(1).body.state.currentPeriod).toBe(2);
    });

    it("retries retryable failures with exponential backoff when given a policy", async () => {
      fetchMock
        .mockResolvedValueOnce(status(503))
        .mockRejectedValueOnce(new TypeError("offline"))
        .mockResolvedValueOnce(status(429))
        .mockResolvedValueOnce(status(401))
        .mockResolvedValueOnce(created());
      const ctrl = controller({ retry: { initialMs: 1000, maxMs: 5000 } });

      ctrl.onCommit(makeRecord());
      await vi.advanceTimersByTimeAsync(250);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const at = [1000, 2000, 4000, 5000];
      for (const [i, delay] of at.entries()) {
        await vi.advanceTimersByTimeAsync(delay - 1);
        expect(fetchMock).toHaveBeenCalledTimes(i + 1);
        await vi.advanceTimersByTimeAsync(1);
        expect(fetchMock).toHaveBeenCalledTimes(i + 2);
      }
      expect(ctrl.currentGameId()).toBe("game-1");
      await vi.advanceTimersByTimeAsync(60_000);
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    it("sends the latest record when it retries", async () => {
      let fail: (res: Response) => void = () => {};
      fetchMock
        .mockImplementationOnce(() => new Promise((resolve) => (fail = resolve)))
        .mockResolvedValueOnce(created());
      const ctrl = controller({ retry: { initialMs: 1000, maxMs: 1000 } });

      void ctrl.saveNow(makeRecord({ currentPeriod: 1 }));
      ctrl.onCommit(makeRecord({ currentPeriod: 2 }));
      fail(status(502));
      await vi.advanceTimersByTimeAsync(1000);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(call(1).body.state.currentPeriod).toBe(2);
    });

    it("gives up on failures a retry can't fix", async () => {
      for (const code of [400, 404, 409]) {
        fetchMock.mockReset().mockResolvedValue(status(code));
        const onSyncStateChange = vi.fn();
        const ctrl = controller({
          retry: { initialMs: 1000, maxMs: 1000 },
          initialState: { gameId: "game-1", createKey: null },
          onSyncStateChange,
        });

        await ctrl.saveNow(makeRecord());
        await vi.advanceTimersByTimeAsync(10_000);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(ctrl.getSyncState().unsaved).toBe(false);
      }
    });

    it("keeps a newer record queued when an older write fails for good", async () => {
      let reject: (res: Response) => void = () => {};
      fetchMock.mockImplementationOnce(() => new Promise((resolve) => (reject = resolve)));
      const ctrl = controller({ initialState: { gameId: "game-1", createKey: null } });

      void ctrl.saveNow(makeRecord({ currentPeriod: 1 }));
      ctrl.onCommit(makeRecord({ currentPeriod: 2 }));
      reject(status(409));
      await vi.advanceTimersByTimeAsync(0);

      expect(ctrl.getSyncState().unsaved).toBe(true);
    });
  });

  describe("ordering", () => {
    it("chains a manual save behind an in-flight write instead of racing it", async () => {
      let resolveFirst: (res: Response) => void = () => {};
      fetchMock
        .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
        .mockResolvedValueOnce(ok());
      const ctrl = controller();

      const first = ctrl.saveNow(makeRecord());
      const second = ctrl.saveNow(makeRecord({ currentPeriod: 2 }));
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      resolveFirst(created());
      await Promise.all([first, second]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(call(1).path).toBe("/api/games/game-1");
    });

    it("PATCHes an adopted game id without POSTing first", async () => {
      fetchMock.mockResolvedValue(ok());
      const ctrl = controller();

      ctrl.setGameId("adopted-1");
      expect(ctrl.currentGameId()).toBe("adopted-1");
      ctrl.onCommit(makeRecord({ currentPeriod: 2 }));
      await vi.advanceTimersByTimeAsync(250);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(call(0)).toMatchObject({ path: "/api/games/adopted-1", method: "PATCH" });
    });

    it("switching games drops the old game's unsent record and its POST key", async () => {
      fetchMock.mockResolvedValueOnce(status(500)).mockResolvedValue(created("game-2"));
      const ctrl = controller();

      await ctrl.saveNow(makeRecord({ currentPeriod: 4 }));
      ctrl.onCommit(makeRecord({ currentPeriod: 5 }));
      ctrl.setGameId(null);
      await vi.advanceTimersByTimeAsync(1000);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await ctrl.saveNow(makeRecord({ currentPeriod: 1 }));
      expect(call(1).method).toBe("POST");
      expect(call(1).key).not.toBe(call(0).key);
      expect(call(1).body.state.currentPeriod).toBe(1);
    });

    it("ignores the result of a write that was in flight when the game switched", async () => {
      let resolveOld: (res: Response) => void = () => {};
      let failOld: (res: Response) => void = () => {};
      fetchMock
        .mockImplementationOnce(() => new Promise((resolve) => (resolveOld = resolve)))
        .mockResolvedValueOnce(ok())
        .mockImplementationOnce(() => new Promise((resolve) => (failOld = resolve)))
        .mockResolvedValueOnce(ok());
      const onStatus = vi.fn();
      const ctrl = controller({ onStatus });

      const oldWrite = ctrl.saveNow(makeRecord());
      ctrl.setGameId("opened");
      ctrl.onCommit(makeRecord({ currentPeriod: 3 }));
      resolveOld(created("old-game"));
      await oldWrite;

      expect(ctrl.currentGameId()).toBe("opened");
      expect(call(1)).toMatchObject({ path: "/api/games/opened", method: "PATCH" });

      const second = ctrl.saveNow(makeRecord({ currentPeriod: 4 }));
      ctrl.setGameId("another");
      ctrl.onCommit(makeRecord({ currentPeriod: 5 }));
      failOld(status(500));
      await second;
      expect(onStatus).not.toHaveBeenCalledWith("error");
      expect(call(3)).toMatchObject({ path: "/api/games/another", method: "PATCH" });
    });

    it("stops writing once disposed", async () => {
      let resolveWrite: (res: Response) => void = () => {};
      fetchMock.mockImplementationOnce(() => new Promise((resolve) => (resolveWrite = resolve)));
      const onSyncStateChange = vi.fn();
      const ctrl = controller({ retry: { initialMs: 10, maxMs: 10 }, onSyncStateChange });

      const write = ctrl.saveNow(makeRecord());
      ctrl.onCommit(makeRecord({ currentPeriod: 2 }));
      ctrl.dispose();
      onSyncStateChange.mockClear();
      resolveWrite(created());
      await write;
      ctrl.onCommit(makeRecord({ currentPeriod: 3 }));
      await vi.advanceTimersByTimeAsync(1000);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(ctrl.currentGameId()).toBeNull();
      expect(onSyncStateChange).not.toHaveBeenCalled();
    });
  });

  describe("sync state", () => {
    it("reports unsaved changes, persists the POST key before sending, then the game id", async () => {
      const states: SyncState[] = [];
      let stateWhenSent: SyncState | undefined;
      fetchMock.mockImplementationOnce(async () => {
        stateWhenSent = states.at(-1);
        return created();
      });
      const ctrl = controller({ onSyncStateChange: (s) => states.push(s) });

      await ctrl.saveNow(makeRecord());

      expect(stateWhenSent).toEqual({ gameId: null, createKey: call(0).key, unsaved: true });
      expect(states.at(-1)).toEqual({ gameId: "game-1", createKey: null, unsaved: false });
      expect(ctrl.getSyncState()).toEqual(states.at(-1));
    });

    it("only reports changes", async () => {
      fetchMock.mockResolvedValue(ok());
      const onSyncStateChange = vi.fn();
      const ctrl = controller({
        initialState: { gameId: "game-1", createKey: null },
        onSyncStateChange,
      });

      ctrl.onCommit(makeRecord({ currentPeriod: 2 }));
      ctrl.onCommit(makeRecord({ currentPeriod: 3 }));
      await vi.advanceTimersByTimeAsync(250);

      expect(onSyncStateChange.mock.calls.map(([s]) => s.unsaved)).toEqual([true, false]);
    });

    it("resumes a pending POST with its original key", async () => {
      fetchMock.mockResolvedValue(created());
      const ctrl = controller({ initialState: { gameId: null, createKey: "restored-key" } });

      await ctrl.saveNow(makeRecord());

      expect(call(0)).toMatchObject({ method: "POST", key: "restored-key" });
    });
  });
});

describe("subscribeToGameRecord", () => {
  it("fires when the persisted record changes but not on clock ticks", () => {
    const store = createGameStore();
    const listener = vi.fn();
    const unsubscribe = subscribeToGameRecord(store, listener);

    store.setState({ clockRunning: true, clockSeconds: 300 });
    store.getState().tickClock(16);
    store.setState({ breakSeconds: 30 });
    expect(listener).not.toHaveBeenCalled();

    store.setState({ currentPeriod: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ schemaVersion: 1, currentPeriod: 2 }));

    unsubscribe();
    store.setState({ currentPeriod: 3 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
