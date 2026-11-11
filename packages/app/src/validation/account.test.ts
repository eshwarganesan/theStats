/**
 * Tests for the account-deletion request schemas.
 * Feature 018-account-deletion, task T003.
 */
import { describe, expect, it } from "vitest";
import { AccountStatusQuerySchema, DeleteAccountBodySchema } from "./account";

describe("DeleteAccountBodySchema", () => {
  it("accepts a one-character password", () => {
    expect(DeleteAccountBodySchema.safeParse({ password: "x" }).success).toBe(true);
  });

  it("accepts a 1024-character password", () => {
    expect(DeleteAccountBodySchema.safeParse({ password: "x".repeat(1024) }).success).toBe(true);
  });

  it.each([
    ["missing", {}],
    ["empty", { password: "" }],
    ["too long", { password: "x".repeat(1025) }],
    ["not a string", { password: 12345 }],
    ["null", { password: null }],
  ])("rejects a password that is %s", (_label, body) => {
    expect(DeleteAccountBodySchema.safeParse(body).success).toBe(false);
  });

  it("strips unknown keys", () => {
    const result = DeleteAccountBodySchema.safeParse({ password: "secret", userId: "someone-else" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ password: "secret" });
  });
});

describe("AccountStatusQuerySchema", () => {
  it("accepts a UUID", () => {
    const userId = "7f9d3c2a-5b1e-4c8d-9a6f-2e4b8c1d0a3f";
    const result = AccountStatusQuerySchema.safeParse({ userId });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.userId).toBe(userId);
  });

  it.each([
    ["not a UUID", { userId: "abc" }],
    ["empty", { userId: "" }],
    ["missing", {}],
  ])("rejects a userId that is %s", (_label, query) => {
    expect(AccountStatusQuerySchema.safeParse(query).success).toBe(false);
  });
});
