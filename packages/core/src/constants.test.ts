import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "./constants";

describe("DEFAULT_SETTINGS — possessionArrowEnabled (feature 007)", () => {
  it("defaults to true for 5v5 (refereed format uses an alternating-possession arrow)", () => {
    expect(DEFAULT_SETTINGS["5v5"].possessionArrowEnabled).toBe(true);
  });

  it("defaults to false for 3v3 (FIBA 3x3 has no alternating-possession arrow concept)", () => {
    expect(DEFAULT_SETTINGS["3v3"].possessionArrowEnabled).toBe(false);
  });
});
