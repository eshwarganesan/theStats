/**
 * Tests for `handleAccountGone`, the browser's cleanup once its account
 * is gone. Feature 018-account-deletion, task T024.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as AccountGoneModule from "./account-gone";
import type * as DeviceAccountModule from "./device-account";
import { CLOCK_CHECKPOINT_KEY, GAME_STORAGE_KEY } from "@/lib/persistence";

// Each step records whether the device's game was still stored at that
// moment, which pins the order: reset, clear, broadcast, navigate.
const calls: string[] = [];
const stored = () => (localStorage.getItem(GAME_STORAGE_KEY) === null ? "cleared" : "stored");

const resetAll = vi.fn(() => calls.push(`resetAll:${stored()}`));
vi.mock("@/lib/store", () => ({
  useGameStore: { getState: () => ({ resetAll }) },
}));

const posted: Array<{ channel: string; message: unknown }> = [];
class FakeChannel {
  constructor(readonly name: string) {}
  postMessage(message: unknown) {
    calls.push(`broadcast:${stored()}`);
    posted.push({ channel: this.name, message });
  }
  close() {}
}

let accountGone: typeof AccountGoneModule;
let deviceAccount: typeof DeviceAccountModule;
let assign: ReturnType<typeof vi.fn>;
const originalLocation = window.location;

beforeEach(async () => {
  // Fresh modules: the once-only guard and the own-deletion flag are module state.
  vi.resetModules();
  calls.length = 0;
  posted.length = 0;
  resetAll.mockClear();
  localStorage.clear();
  localStorage.setItem(GAME_STORAGE_KEY, "{}");
  localStorage.setItem(CLOCK_CHECKPOINT_KEY, "{}");
  vi.stubGlobal("BroadcastChannel", FakeChannel);
  assign = vi.fn(() => calls.push(`assign:${stored()}`));
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { ...originalLocation, assign },
  });
  deviceAccount = await import("./device-account");
  accountGone = await import("./account-gone");
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: originalLocation,
  });
});

describe("handleAccountGone", () => {
  it("resets the store, clears the device, tells other tabs, then shows the landing notice", () => {
    accountGone.handleAccountGone("deleted");

    expect(calls).toEqual(["resetAll:stored", "broadcast:cleared", "assign:cleared"]);
    expect(localStorage.getItem(CLOCK_CHECKPOINT_KEY)).toBeNull();
    expect(posted).toEqual([{ channel: "thestats.account", message: "deleted" }]);
    expect(assign).toHaveBeenCalledWith("/?account=deleted");
  });

  it("does the same for an account deleted elsewhere", () => {
    accountGone.handleAccountGone("deleted-elsewhere");

    expect(posted).toEqual([{ channel: "thestats.account", message: "deleted-elsewhere" }]);
    expect(assign).toHaveBeenCalledWith("/?account=deleted-elsewhere");
  });

  it("doesn't tell other tabs again when the news came from one", () => {
    accountGone.handleAccountGone("deleted", { fromBroadcast: true });

    expect(calls).toEqual(["resetAll:stored", "assign:cleared"]);
    expect(posted).toEqual([]);
  });

  it("still cleans up where BroadcastChannel doesn't exist", () => {
    vi.stubGlobal("BroadcastChannel", undefined);

    expect(() => accountGone.handleAccountGone("deleted")).not.toThrow();
    expect(localStorage.getItem(GAME_STORAGE_KEY)).toBeNull();
    expect(assign).toHaveBeenCalledWith("/?account=deleted");
  });

  it("runs only once before the page navigates away", () => {
    accountGone.handleAccountGone("deleted-elsewhere");
    accountGone.handleAccountGone("deleted-elsewhere");

    expect(assign).toHaveBeenCalledTimes(1);
    expect(resetAll).toHaveBeenCalledTimes(1);
  });

  it("ignores deleted-elsewhere while this device's own deletion is in flight", () => {
    deviceAccount.beginOwnDeletion();

    accountGone.handleAccountGone("deleted-elsewhere");

    expect(calls).toEqual([]);
    expect(localStorage.getItem(GAME_STORAGE_KEY)).toBe("{}");
    accountGone.handleAccountGone("deleted");
    expect(assign).toHaveBeenCalledWith("/?account=deleted");
  });
});
