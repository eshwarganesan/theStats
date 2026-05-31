import { describe, it, expect } from "vitest";
import { cn } from "./utils";

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
