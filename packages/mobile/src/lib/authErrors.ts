import type { AuthFailure } from "@/lib/auth";

/** What to tell the user about a failed sign-in, sign-up or resend. */
export function authErrorText(failure: AuthFailure): string {
  if (failure.code === "rate_limited" && failure.retryAfterSeconds !== undefined) {
    const s = failure.retryAfterSeconds;
    return `Too many attempts. Try again in ${s} second${s === 1 ? "" : "s"}.`;
  }
  if (failure.code === "email_unconfirmed") {
    return "Please confirm your email before signing in. Check your inbox for the link.";
  }
  return failure.message;
}
