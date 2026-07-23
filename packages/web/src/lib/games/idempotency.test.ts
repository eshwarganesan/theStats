/**
 * Tests for idempotency-key helpers.
 * Feature 009-account-library, task T011.
 */
import { describe, expect, it } from "vitest";
import { newIdempotencyKey, readIdempotencyKey } from "./idempotency";

describe("newIdempotencyKey", () => {
  it("returns a syntactically valid v4 UUID", () => {
    const key = newIdempotencyKey();
    expect(key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("produces a fresh key each call", () => {
    const a = newIdempotencyKey();
    const b = newIdempotencyKey();
    expect(a).not.toBe(b);
  });
});

describe("readIdempotencyKey", () => {
  function makeRequest(headers: Record<string, string> = {}): Request {
    return new Request("http://localhost/api/games", {
      method: "POST",
      headers,
    });
  }

  it("returns the header value when the header is present", () => {
    const key = "01234567-89ab-cdef-0123-456789abcdef";
    const req = makeRequest({ "Idempotency-Key": key });
    expect(readIdempotencyKey(req)).toBe(key);
  });

  it("returns null when the header is missing", () => {
    const req = makeRequest();
    expect(readIdempotencyKey(req)).toBeNull();
  });

  it("returns null when the header value is empty", () => {
    const req = makeRequest({ "Idempotency-Key": "" });
    expect(readIdempotencyKey(req)).toBeNull();
  });

  it("trims whitespace from the header value", () => {
    const key = "01234567-89ab-cdef-0123-456789abcdef";
    const req = makeRequest({ "Idempotency-Key": `  ${key}  ` });
    expect(readIdempotencyKey(req)).toBe(key);
  });
});
