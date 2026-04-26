import { describe, it, expect, vi, afterEach } from "vitest";
import { cn, uid, formatClock, formatPeriod } from "./utils";

describe("cn", () => {
  it("joins truthy class names", () => {
    expect(cn("a", "b", false && "c", undefined, null, "d")).toBe("a b d");
  });

  it("dedupes conflicting Tailwind utilities (twMerge)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm", "text-lg")).toBe("text-lg");
  });

  it("supports object and array inputs (clsx)", () => {
    expect(cn({ a: true, b: false }, ["c", { d: true }])).toBe("a c d");
  });
});

describe("uid", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a non-empty string", () => {
    expect(typeof uid()).toBe("string");
    expect(uid().length).toBeGreaterThan(0);
  });

  it("is unique across many calls", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uid()));
    expect(ids.size).toBe(1000);
  });

  it("falls back when crypto.randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", {});
    const id = uid();
    expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/i);
  });

  it("falls back when crypto is undefined entirely", () => {
    vi.stubGlobal("crypto", undefined);
    const id = uid();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });
});

describe("formatClock", () => {
  it("renders MM:SS for values >= 60s", () => {
    expect(formatClock(600)).toBe("10:00");
    expect(formatClock(125)).toBe("02:05");
    expect(formatClock(60)).toBe("01:00");
  });

  it("renders SS.T for values < 60s", () => {
    expect(formatClock(59)).toBe("59.0");
    expect(formatClock(12.4)).toBe("12.4");
    expect(formatClock(0.9)).toBe("00.9");
    expect(formatClock(0)).toBe("00.0");
  });

  it("clamps negative values to 0", () => {
    expect(formatClock(-5)).toBe("00.0");
  });

  it("pads single-digit minutes and seconds", () => {
    expect(formatClock(61)).toBe("01:01");
    expect(formatClock(3600)).toBe("60:00");
  });
});

describe("formatPeriod", () => {
  it("returns ordinals 1st through 4th for regular periods", () => {
    expect(formatPeriod(1, 4)).toBe("1st");
    expect(formatPeriod(2, 4)).toBe("2nd");
    expect(formatPeriod(3, 4)).toBe("3rd");
    expect(formatPeriod(4, 4)).toBe("4th");
  });

  it("returns 'OT' for the first overtime", () => {
    expect(formatPeriod(5, 4)).toBe("OT");
  });

  it("numbers further overtimes OT2, OT3, …", () => {
    expect(formatPeriod(6, 4)).toBe("OT2");
    expect(formatPeriod(7, 4)).toBe("OT3");
  });

  it("falls back to Nth for periods past the named ordinals", () => {
    expect(formatPeriod(7, 10)).toBe("7th");
  });
});
