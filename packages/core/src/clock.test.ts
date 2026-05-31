import { describe, it, expect } from "vitest";
import { formatClock, formatPeriod, parseClock } from "./clock";

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

  it("absorbs floating-point noise from typed deciseconds", () => {
    // These IEEE 754 representations are slightly less than the literal —
    // a naive floor would render them as the previous tenth (regression
    // test for the typed-input rounding bug).
    expect(formatClock(9.1)).toBe("09.1");
    expect(formatClock(4.3)).toBe("04.3");
    expect(formatClock(0.1)).toBe("00.1");
    expect(formatClock(7.7)).toBe("07.7");
    expect(formatClock(58.9)).toBe("58.9");
  });

  it("caps sub-minute display at 59.9 so values in [59.95, 60) don't render '60.0'", () => {
    expect(formatClock(59.95)).toBe("59.9");
    expect(formatClock(59.99)).toBe("59.9");
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

  it("numbers further overtimes 2OT, 3OT, … (feature 003 format)", () => {
    expect(formatPeriod(6, 4)).toBe("2OT");
    expect(formatPeriod(7, 4)).toBe("3OT");
    expect(formatPeriod(8, 4)).toBe("4OT");
  });

  it("falls back to Nth for periods past the named ordinals", () => {
    expect(formatPeriod(7, 10)).toBe("7th");
  });
});

describe("parseClock", () => {
  it("parses standard mm:ss", () => {
    expect(parseClock("7:42")).toBe(462);
  });

  it("accepts leading zero on minutes", () => {
    expect(parseClock("07:42")).toBe(462);
  });

  it("parses 0:00 as zero", () => {
    expect(parseClock("0:00")).toBe(0);
  });

  it("parses pure-seconds shorthand (1-3 digits)", () => {
    expect(parseClock("42")).toBe(42);
    expect(parseClock("700")).toBe(700);
    expect(parseClock("9")).toBe(9);
  });

  it("rejects seconds component out of range (>= 60)", () => {
    expect(parseClock("7:60")).toBeNull();
    expect(parseClock("7:99")).toBeNull();
  });

  it("rejects negative inputs", () => {
    expect(parseClock("-1:00")).toBeNull();
    expect(parseClock("-30")).toBeNull();
  });

  it("rejects empty input", () => {
    expect(parseClock("")).toBeNull();
  });

  it("rejects non-numeric input", () => {
    expect(parseClock("abc")).toBeNull();
    expect(parseClock("ab:cd")).toBeNull();
    expect(parseClock("1:0a")).toBeNull();
  });

  it("rejects missing minutes component", () => {
    expect(parseClock(":30")).toBeNull();
  });

  it("rejects missing seconds component", () => {
    expect(parseClock("5:")).toBeNull();
  });

  it("trims surrounding whitespace before parsing", () => {
    expect(parseClock("  7:42  ")).toBe(462);
  });

  it("parses pure-second shorthand with a tenths suffix", () => {
    expect(parseClock("42.5")).toBe(42.5);
    expect(parseClock("0.5")).toBe(0.5);
    expect(parseClock("9.9")).toBe(9.9);
  });

  it("parses mm:ss with a tenths suffix", () => {
    expect(parseClock("5:30.5")).toBeCloseTo(330.5);
    expect(parseClock("0:30.5")).toBeCloseTo(30.5);
    expect(parseClock("01:23.4")).toBeCloseTo(83.4);
  });

  it("still rejects seconds >= 60 even with a tenths suffix", () => {
    expect(parseClock("5:60.5")).toBeNull();
  });

  it("rejects more than one digit of tenths", () => {
    expect(parseClock("42.55")).toBeNull();
    expect(parseClock("5:30.55")).toBeNull();
  });

  it("rejects a trailing decimal point with no tenths digit", () => {
    expect(parseClock("42.")).toBeNull();
    expect(parseClock("5:30.")).toBeNull();
  });

  it("rejects a leading decimal point with no whole part", () => {
    expect(parseClock(".5")).toBeNull();
  });
});
