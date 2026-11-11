/**
 * Tests for the delete-account wording and reply mapping both clients share.
 * Feature 018-account-deletion, task T006.
 */
import { describe, expect, it } from "vitest";
import {
  DELETE_ACCOUNT_COPY,
  deleteAccountErrorText,
  toDeleteAccountOutcome,
} from "./deleteAccount";

describe("DELETE_ACCOUNT_COPY", () => {
  it("matches contracts/confirmation-ui.md", () => {
    expect(DELETE_ACCOUNT_COPY).toEqual({
      sectionHeading: "Delete account",
      sectionText:
        "Permanently delete your account, your profile and all of your saved games. This can't be undone.",
      actionLabel: "Delete account",
      dialogTitle: "Delete your account?",
      dialogExplanation:
        "This permanently deletes your account, your profile and all of your saved games, including any game in progress. You can't undo this.",
      passwordLabel: "Password",
      cancelLabel: "Cancel",
      confirmLabel: "Delete account",
      confirmAccessibleName: "Delete account permanently",
      pendingLabel: "Deleting…",
    });
  });
});

const envelope = (code: string, extra: Record<string, unknown> = {}) => ({
  error: { code, message: "message", ...extra },
});

describe("toDeleteAccountOutcome", () => {
  it("maps 204 to deleted", () => {
    expect(toDeleteAccountOutcome(204, null)).toEqual({ kind: "deleted" });
  });

  it("maps 401 account_deleted to deleted (already gone)", () => {
    expect(toDeleteAccountOutcome(401, envelope("account_deleted"))).toEqual({ kind: "deleted" });
  });

  it("maps any other 401 to signed-out", () => {
    expect(toDeleteAccountOutcome(401, envelope("unauthenticated"))).toEqual({ kind: "signed-out" });
    expect(toDeleteAccountOutcome(401, null)).toEqual({ kind: "signed-out" });
  });

  it("maps 403 to wrong-password", () => {
    expect(toDeleteAccountOutcome(403, envelope("current_password_incorrect"))).toEqual({
      kind: "wrong-password",
    });
  });

  it("maps 429 to rate-limited with the server's delay", () => {
    expect(toDeleteAccountOutcome(429, envelope("rate_limited", { retry_after_seconds: 8 }))).toEqual({
      kind: "rate-limited",
      retryAfterSeconds: 8,
    });
  });

  it("falls back to 30 seconds when a 429 has no delay", () => {
    expect(toDeleteAccountOutcome(429, null)).toEqual({ kind: "rate-limited", retryAfterSeconds: 30 });
  });

  it("maps 400 to invalid", () => {
    expect(toDeleteAccountOutcome(400, envelope("invalid_body"))).toEqual({ kind: "invalid" });
  });

  it.each([500, 502, 404, 200])("maps %i to failed", (status) => {
    expect(toDeleteAccountOutcome(status, null)).toEqual({ kind: "failed" });
  });
});

describe("deleteAccountErrorText", () => {
  it("explains each failure", () => {
    expect(deleteAccountErrorText({ kind: "wrong-password" })).toBe("Current password is incorrect.");
    expect(deleteAccountErrorText({ kind: "failed" })).toBe(
      "Something went wrong, and your account wasn't deleted. Please try again.",
    );
    expect(deleteAccountErrorText({ kind: "offline" })).toBe(
      "Couldn't reach theStats. Check your connection and try again.",
    );
    expect(deleteAccountErrorText({ kind: "invalid" })).toBe("Enter your password to confirm.");
  });

  it("uses the singular for one second", () => {
    expect(deleteAccountErrorText({ kind: "rate-limited", retryAfterSeconds: 1 })).toBe(
      "Too many attempts. Try again in 1 second.",
    );
  });

  it("uses the plural otherwise", () => {
    expect(deleteAccountErrorText({ kind: "rate-limited", retryAfterSeconds: 12 })).toBe(
      "Too many attempts. Try again in 12 seconds.",
    );
  });
});
