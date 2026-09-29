import { describe, it, expect } from "vitest";
import { safeFrom } from "./safe-from";

describe("safeFrom", () => {
  it("returns undefined for undefined input", () => {
    expect(safeFrom(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(safeFrom("")).toBeUndefined();
  });

  it("returns undefined for values longer than 512 characters", () => {
    const tooLong = "/" + "a".repeat(512);
    expect(safeFrom(tooLong)).toBeUndefined();
  });

  it("accepts a simple absolute path", () => {
    expect(safeFrom("/games")).toBe("/games");
  });

  it("accepts an absolute path with a query string", () => {
    expect(safeFrom("/games/abc?tab=history")).toBe("/games/abc?tab=history");
  });

  it("accepts a nested absolute path", () => {
    expect(safeFrom("/game/stats")).toBe("/game/stats");
  });

  it("rejects protocol-relative URLs (open-redirect guard)", () => {
    expect(safeFrom("//evil.com")).toBeUndefined();
    expect(safeFrom("//attacker.example/path")).toBeUndefined();
  });

  it("rejects absolute URLs with a scheme", () => {
    expect(safeFrom("http://evil.com")).toBeUndefined();
    expect(safeFrom("https://evil.com/path")).toBeUndefined();
    expect(safeFrom("javascript:alert(1)")).toBeUndefined();
  });

  it("rejects relative paths without a leading slash", () => {
    expect(safeFrom("games")).toBeUndefined();
    expect(safeFrom("./games")).toBeUndefined();
    expect(safeFrom("../games")).toBeUndefined();
  });

  it("accepts a path at exactly the length limit", () => {
    const atLimit = "/" + "a".repeat(511);
    expect(atLimit.length).toBe(512);
    expect(safeFrom(atLimit)).toBe(atLimit);
  });
});
