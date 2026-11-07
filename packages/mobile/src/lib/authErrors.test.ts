import { authErrorText } from "./authErrors";

describe("authErrorText", () => {
  it("counts down a rate limit, in seconds", () => {
    expect(authErrorText({ ok: false, code: "rate_limited", message: "x", retryAfterSeconds: 2 })).toBe(
      "Too many attempts. Try again in 2 seconds.",
    );
    expect(authErrorText({ ok: false, code: "rate_limited", message: "x", retryAfterSeconds: 1 })).toBe(
      "Too many attempts. Try again in 1 second.",
    );
    expect(authErrorText({ ok: false, code: "rate_limited", message: "Slow down." })).toBe("Slow down.");
  });

  it("explains an unconfirmed email, and passes other messages through", () => {
    expect(authErrorText({ ok: false, code: "email_unconfirmed", message: "x" })).toBe(
      "Please confirm your email before signing in. Check your inbox for the link.",
    );
    expect(authErrorText({ ok: false, code: "email_exists", message: "Taken." })).toBe("Taken.");
  });
});
