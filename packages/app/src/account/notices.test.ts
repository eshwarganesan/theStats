/**
 * Tests for the account notices shown after a deletion.
 * Feature 018-account-deletion, task T005.
 */
import { describe, expect, it } from "vitest";
import { ACCOUNT_NOTICE_TEXT, parseAccountNoticeKind } from "./notices";

describe("ACCOUNT_NOTICE_TEXT", () => {
  it("matches the contract's copy", () => {
    expect(ACCOUNT_NOTICE_TEXT).toEqual({
      deleted: "Your account has been deleted.",
      "deleted-elsewhere": "You were signed out because this account was deleted.",
    });
  });

  it("never names the account (FR-018)", () => {
    for (const text of Object.values(ACCOUNT_NOTICE_TEXT)) {
      expect(text).not.toContain("@");
    }
  });
});

describe("parseAccountNoticeKind", () => {
  it.each(["deleted", "deleted-elsewhere"] as const)("accepts %s", (kind) => {
    expect(parseAccountNoticeKind(kind)).toBe(kind);
  });

  it.each([
    ["another string", "nope"],
    ["an empty string", ""],
    ["an array", ["deleted"]],
    ["undefined", undefined],
    ["null", null],
    ["a number", 1],
  ])("returns null for %s", (_label, value) => {
    expect(parseAccountNoticeKind(value)).toBeNull();
  });
});
