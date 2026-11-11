/**
 * Tests for reading the API's `{ error: { code, message } }` envelope.
 * Feature 018-account-deletion, task T004.
 */
import { describe, expect, it } from "vitest";
import { parseApiError, readApiErrorCode } from "./errors";

describe("parseApiError", () => {
  it("parses the envelope, including the retry delay", () => {
    expect(
      parseApiError({
        error: { code: "rate_limited", message: "Too many attempts.", retry_after_seconds: 4 },
      }),
    ).toEqual({ code: "rate_limited", message: "Too many attempts.", retryAfterSeconds: 4 });
  });

  it("leaves out the retry delay unless it is a non-negative number", () => {
    for (const retry of [-1, "4", null, undefined]) {
      expect(
        parseApiError({ error: { code: "rate_limited", message: "m", retry_after_seconds: retry } }),
      ).toEqual({ code: "rate_limited", message: "m" });
    }
  });

  it("accepts a zero retry delay", () => {
    expect(
      parseApiError({ error: { code: "rate_limited", message: "m", retry_after_seconds: 0 } }),
    ).toEqual({ code: "rate_limited", message: "m", retryAfterSeconds: 0 });
  });

  it.each([
    ["null", null],
    ["a string", "account_deleted"],
    ["a number", 401],
    ["an object without error", {}],
    ["a null error", { error: null }],
    ["a missing code", { error: { message: "m" } }],
    ["a non-string code", { error: { code: 1, message: "m" } }],
    ["a missing message", { error: { code: "c" } }],
  ])("returns null for %s", (_label, body) => {
    expect(parseApiError(body)).toBeNull();
  });
});

describe("readApiErrorCode", () => {
  it("returns the code from a JSON error body", async () => {
    const response = new Response(
      JSON.stringify({ error: { code: "account_deleted", message: "This account no longer exists." } }),
      { status: 401 },
    );
    expect(await readApiErrorCode(response)).toBe("account_deleted");
  });

  it("returns null for a body that isn't JSON", async () => {
    expect(await readApiErrorCode(new Response("<html>oops</html>", { status: 500 }))).toBeNull();
  });

  it("returns null for an empty body", async () => {
    expect(await readApiErrorCode(new Response(null, { status: 401 }))).toBeNull();
  });

  it("leaves the original body readable", async () => {
    const body = { error: { code: "unauthenticated", message: "Sign in to continue." } };
    const response = new Response(JSON.stringify(body), { status: 401 });
    await readApiErrorCode(response);
    expect(await response.json()).toEqual(body);
  });
});
