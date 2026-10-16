import { CLOCK_CHECKPOINT_KEY, readClockCheckpoint, writeClockCheckpoint } from "@thestats/app";

import { deviceStorage } from "./storage";

describe("deviceStorage", () => {
  it("round-trips values through the kv-store", () => {
    deviceStorage.setItem("k", "v");
    expect(deviceStorage.getItem("k")).toBe("v");
    deviceStorage.removeItem("k");
    expect(deviceStorage.getItem("k")).toBeNull();
  });

  it("satisfies the shared clock-checkpoint contract", () => {
    const checkpoint = { schemaVersion: 1 as const, clockSeconds: 95, breakSeconds: 0, savedAt: 1 };
    writeClockCheckpoint(deviceStorage, checkpoint);
    expect(deviceStorage.getItem(CLOCK_CHECKPOINT_KEY)).not.toBeNull();
    expect(readClockCheckpoint(deviceStorage)).toEqual(checkpoint);
  });
});
