/**
 * Tests for reading GET /api/account/status replies.
 * Feature 018-account-deletion, task T068.
 */
import { describe, expect, it } from "vitest";
import { parseAccountStatus } from "./status";

describe("parseAccountStatus", () => {
  it.each([true, false])("reads { exists: %s }", (exists) => {
    expect(parseAccountStatus({ exists })).toEqual({ exists });
  });

  it.each([
    ["null", null],
    ["an empty object", {}],
    ["a string flag", { exists: "yes" }],
    ["a numeric flag", { exists: 1 }],
    ["a string", "exists"],
    ["a number", 200],
  ])("returns null for %s", (_label, body) => {
    expect(parseAccountStatus(body)).toBeNull();
  });
});
