import { describe, it, expect } from "vitest";
import { signUpInput, signInInput, resendInput } from "./schemas";

describe("signUpInput", () => {
  it("accepts a valid email + non-empty password", () => {
    const out = signUpInput.parse({ email: "alice@example.com", password: "hunter2" });
    expect(out).toEqual({ email: "alice@example.com", password: "hunter2" });
  });

  it("lowercases and trims the email", () => {
    const out = signUpInput.parse({ email: "  Alice@Example.COM  ", password: "hunter2" });
    expect(out.email).toBe("alice@example.com");
  });

  it("rejects an invalid email", () => {
    expect(() => signUpInput.parse({ email: "not-an-email", password: "hunter2" })).toThrow();
  });

  it("rejects an empty password (per R5: no length rule, but non-empty)", () => {
    expect(() => signUpInput.parse({ email: "alice@example.com", password: "" })).toThrow();
  });

  it("accepts an optional next that is a relative path", () => {
    const out = signUpInput.parse({
      email: "alice@example.com",
      password: "hunter2",
      next: "/account",
    });
    expect(out.next).toBe("/account");
  });

  it("rejects an absolute-URL next (open-redirect guard)", () => {
    expect(() =>
      signUpInput.parse({
        email: "alice@example.com",
        password: "hunter2",
        next: "https://evil.com/path",
      }),
    ).toThrow();
  });

  it("rejects a protocol-relative next", () => {
    expect(() =>
      signUpInput.parse({
        email: "alice@example.com",
        password: "hunter2",
        next: "//evil.com",
      }),
    ).toThrow();
  });
});

describe("signInInput", () => {
  it("accepts a valid email + non-empty password", () => {
    const out = signInInput.parse({ email: "alice@example.com", password: "hunter2" });
    expect(out.email).toBe("alice@example.com");
  });

  it("rejects an empty password", () => {
    expect(() => signInInput.parse({ email: "alice@example.com", password: "" })).toThrow();
  });
});

describe("resendInput", () => {
  it("accepts a valid email and ignores extra fields", () => {
    const out = resendInput.parse({ email: "ALICE@example.com" });
    expect(out).toEqual({ email: "alice@example.com" });
  });

  it("rejects an invalid email", () => {
    expect(() => resendInput.parse({ email: "x" })).toThrow();
  });
});
