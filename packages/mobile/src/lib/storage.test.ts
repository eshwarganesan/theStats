import { CLOCK_CHECKPOINT_KEY, readClockCheckpoint, writeClockCheckpoint } from "@thestats/app";
import Storage from "expo-sqlite/kv-store";

import { deviceStorage } from "./storage";

const setItemSync = jest.mocked(Storage.setItemSync);

describe("deviceStorage", () => {
  it("round-trips values through the kv-store", () => {
    deviceStorage.setItem("k", "v");
    expect(deviceStorage.getItem("k")).toBe("v");
    deviceStorage.removeItem("k");
    expect(deviceStorage.getItem("k")).toBeNull();
  });

  it("skips writing a value the key already holds", () => {
    setItemSync.mockClear();
    deviceStorage.setItem("game", "a");
    deviceStorage.setItem("game", "a");
    expect(setItemSync).toHaveBeenCalledTimes(1);

    deviceStorage.setItem("game", "b");
    expect(setItemSync).toHaveBeenCalledTimes(2);
    expect(deviceStorage.getItem("game")).toBe("b");

    // After a removal the same value has to be written again.
    deviceStorage.removeItem("game");
    deviceStorage.setItem("game", "b");
    expect(setItemSync).toHaveBeenCalledTimes(3);
    expect(deviceStorage.getItem("game")).toBe("b");
  });

  it("retries a write that failed", () => {
    setItemSync.mockClear();
    setItemSync.mockImplementationOnce(() => {
      throw new Error("disk full");
    });
    expect(() => deviceStorage.setItem("retry", "v")).toThrow("disk full");
    deviceStorage.setItem("retry", "v");
    expect(setItemSync).toHaveBeenCalledTimes(2);
    expect(deviceStorage.getItem("retry")).toBe("v");
  });

  it("satisfies the shared clock-checkpoint contract", () => {
    const checkpoint = { schemaVersion: 1 as const, clockSeconds: 95, breakSeconds: 0, savedAt: 1 };
    writeClockCheckpoint(deviceStorage, checkpoint);
    expect(deviceStorage.getItem(CLOCK_CHECKPOINT_KEY)).not.toBeNull();
    expect(readClockCheckpoint(deviceStorage)).toEqual(checkpoint);
  });
});
