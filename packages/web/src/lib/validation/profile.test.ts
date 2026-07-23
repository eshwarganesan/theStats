/**
 * Tests for profile Server Action Zod schemas.
 * Feature 009-account-library, task T014.
 */
import { describe, expect, it } from "vitest";
import { ChangePasswordSchema, UpdateDisplayNameSchema } from "./profile";

describe("UpdateDisplayNameSchema", () => {
  it("normalizes an empty string to null", () => {
    const result = UpdateDisplayNameSchema.safeParse({ displayName: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.displayName).toBeNull();
  });

  it("trims trailing whitespace", () => {
    const result = UpdateDisplayNameSchema.safeParse({ displayName: "  Alex  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.displayName).toBe("Alex");
  });

  it("accepts a valid display name", () => {
    const result = UpdateDisplayNameSchema.safeParse({ displayName: "Coach K" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.displayName).toBe("Coach K");
  });

  it("rejects display names longer than 64 characters", () => {
    const result = UpdateDisplayNameSchema.safeParse({
      displayName: "x".repeat(65),
    });
    expect(result.success).toBe(false);
  });

  it("accepts exactly 64 characters", () => {
    const result = UpdateDisplayNameSchema.safeParse({
      displayName: "x".repeat(64),
    });
    expect(result.success).toBe(true);
  });

  it("rejects when displayName field is missing", () => {
    const result = UpdateDisplayNameSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("ChangePasswordSchema", () => {
  it("accepts a valid pair of passwords", () => {
    const result = ChangePasswordSchema.safeParse({
      currentPassword: "old-secret",
      newPassword: "new-secret",
    });
    expect(result.success).toBe(true);
  });

  it("rejects when currentPassword is missing", () => {
    const result = ChangePasswordSchema.safeParse({ newPassword: "new-secret" });
    expect(result.success).toBe(false);
  });

  it("rejects when newPassword is missing", () => {
    const result = ChangePasswordSchema.safeParse({
      currentPassword: "old-secret",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when currentPassword is empty", () => {
    const result = ChangePasswordSchema.safeParse({
      currentPassword: "",
      newPassword: "new-secret",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when newPassword is empty", () => {
    const result = ChangePasswordSchema.safeParse({
      currentPassword: "old-secret",
      newPassword: "",
    });
    expect(result.success).toBe(false);
  });
});
