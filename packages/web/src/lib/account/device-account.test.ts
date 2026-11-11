/**
 * Tests for the browser's own record of the account it holds.
 * Feature 018-account-deletion, task T023.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// This module runs on public pages; pulling in the game store would put
// it (and its dependencies) into their bundles.
vi.mock("@/lib/store", () => {
  throw new Error("device-account must not import the game store");
});

import { ACCOUNT_STORAGE_KEY, CLOCK_CHECKPOINT_KEY, GAME_STORAGE_KEY } from "@/lib/persistence";
import {
  beginOwnDeletion,
  clearDeviceGameData,
  endOwnDeletion,
  fetchAccountExists,
  isOwnDeletionInProgress,
} from "./device-account";

beforeEach(() => {
  localStorage.clear();
  endOwnDeletion();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("clearDeviceGameData", () => {
  it("removes the game, the clock checkpoint and the remembered account", () => {
    localStorage.setItem(GAME_STORAGE_KEY, "{}");
    localStorage.setItem(CLOCK_CHECKPOINT_KEY, "{}");
    localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify({ userId: "u-1" }));
    localStorage.setItem("unrelated", "kept");

    clearDeviceGameData();

    expect(localStorage.getItem(GAME_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(CLOCK_CHECKPOINT_KEY)).toBeNull();
    expect(localStorage.getItem(ACCOUNT_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem("unrelated")).toBe("kept");
  });

  it("doesn't throw without storage", () => {
    vi.stubGlobal("window", undefined);
    expect(() => clearDeviceGameData()).not.toThrow();
  });
});

describe("own-deletion flag", () => {
  it("is set between begin and end", () => {
    expect(isOwnDeletionInProgress()).toBe(false);
    beginOwnDeletion();
    expect(isOwnDeletionInProgress()).toBe(true);
    endOwnDeletion();
    expect(isOwnDeletionInProgress()).toBe(false);
  });
});

describe("fetchAccountExists (feature 018)", () => {
  function stubFetch(reply: Response | Error) {
    const fetchMock = vi.fn(async () => {
      if (reply instanceof Error) throw reply;
      return reply;
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("asks the status endpoint, uncached, about the given id", async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify({ exists: false }), { status: 200 }));

    expect(await fetchAccountExists("7f9d3c2a-5b1e-4c8d-9a6f-2e4b8c1d0a3f")).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/account/status?userId=7f9d3c2a-5b1e-4c8d-9a6f-2e4b8c1d0a3f",
      { cache: "no-store" },
    );
  });

  it("encodes the id", async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify({ exists: true }), { status: 200 }));
    expect(await fetchAccountExists("a b&c")).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/account/status?userId=a%20b%26c", { cache: "no-store" });
  });

  it.each([
    ["a server error", () => new Response("{}", { status: 500 })],
    ["a body that isn't JSON", () => new Response("nope", { status: 200 })],
    ["an unexpected shape", () => new Response(JSON.stringify({ exists: "yes" }), { status: 200 })],
  ])("returns null for %s", async (_label, reply) => {
    stubFetch(reply());
    expect(await fetchAccountExists("u-1")).toBeNull();
  });

  it("returns null when offline", async () => {
    stubFetch(new TypeError("Failed to fetch"));
    expect(await fetchAccountExists("u-1")).toBeNull();
  });
});
