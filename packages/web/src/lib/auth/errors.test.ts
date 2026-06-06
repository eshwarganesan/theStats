import { describe, it, expect } from "vitest";
import { toJsonError, AUTH_ERROR_STATUS } from "./errors";

async function bodyOf(res: Response): Promise<unknown> {
  return await res.json();
}

describe("toJsonError", () => {
  it("emits invalid_input with 400 and the documented body shape", async () => {
    const res = toJsonError("invalid_input", "Please fix the highlighted fields and try again.", {
      details: { field: "email", reason: "Invalid email format" },
    });
    expect(res.status).toBe(400);
    expect(await bodyOf(res)).toEqual({
      error: {
        code: "invalid_input",
        message: "Please fix the highlighted fields and try again.",
        details: { field: "email", reason: "Invalid email format" },
      },
    });
  });

  it("emits email_exists with 409", async () => {
    const res = toJsonError(
      "email_exists",
      "An account already exists for this email. Sign in instead.",
    );
    expect(res.status).toBe(409);
    expect(await bodyOf(res)).toEqual({
      error: {
        code: "email_exists",
        message: "An account already exists for this email. Sign in instead.",
      },
    });
  });

  it("emits invalid_credentials with 401", async () => {
    const res = toJsonError("invalid_credentials", "Invalid email or password.");
    expect(res.status).toBe(401);
  });

  it("emits email_unconfirmed with 403", async () => {
    const res = toJsonError("email_unconfirmed", "Please confirm your email before signing in.", {
      details: { resend_endpoint: "/api/auth/resend-confirmation" },
    });
    expect(res.status).toBe(403);
  });

  it("emits rate_limited with 429 and includes retry_after_seconds", async () => {
    const res = toJsonError("rate_limited", "Too many attempts.", { retryAfterSeconds: 17 });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("17");
    expect(await bodyOf(res)).toEqual({
      error: {
        code: "rate_limited",
        message: "Too many attempts.",
        retry_after_seconds: 17,
      },
    });
  });

  it("emits missing_code as a 400 (used by /auth/callback only)", async () => {
    const res = toJsonError("missing_code", "Missing code.");
    expect(res.status).toBe(400);
  });

  it("emits internal_error with 500", async () => {
    const res = toJsonError("internal_error", "Something went wrong.");
    expect(res.status).toBe(500);
  });

  it("AUTH_ERROR_STATUS includes every documented code exactly once", () => {
    expect(Object.keys(AUTH_ERROR_STATUS).sort()).toEqual(
      [
        "email_exists",
        "email_unconfirmed",
        "internal_error",
        "invalid_credentials",
        "invalid_input",
        "missing_code",
        "rate_limited",
      ].sort(),
    );
  });
});
