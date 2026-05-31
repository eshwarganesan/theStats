import { describe, it, expect, vi, afterEach } from "vitest";
import { uid } from "./ids";

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
