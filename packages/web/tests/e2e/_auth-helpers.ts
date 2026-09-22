/**
 * Shared Playwright E2E auth helpers.
 *
 * Two pieces:
 *   - `signInViaAPI(page, email, password)` — signs in by POSTing to
 *     the app's own `/api/auth/sign-in` route via the page's request
 *     context. Response cookies land in the page's cookie jar
 *     automatically, so subsequent `page.goto(...)` calls carry the
 *     session. This bypasses the UI form's client-side redirect
 *     dance (fetch → setPendingRedirect → AnonymousGameOnSignInPrompt
 *     → window.location.assign), which was flaky on CI.
 *   - `randomForwardedFor()` — a per-test-random X-Forwarded-For so
 *     the per-IP auth-attempts throttle key does not collide across
 *     parallel workers.
 *
 * All auth-flow spec files should use these helpers instead of driving
 * sign-in through the UI form. Reserve UI-form testing for
 * `auth.spec.ts` (which is explicitly the auth-flow surface) and
 * `games-library.spec.ts:307` (which is specifically exercising the
 * AnonymousGameOnSignInPrompt UI).
 */
import type { Page } from "@playwright/test";

export function randomForwardedFor(): string {
  const oct = () => Math.floor(Math.random() * 254) + 1;
  return `10.${oct()}.${oct()}.${oct()}`;
}

/**
 * Sign in via a direct POST to `/api/auth/sign-in` on the given page's
 * request context. Cookies from the response land in the page's cookie
 * jar automatically. Does NOT navigate — caller decides where to go next
 * (typically `await page.goto("/games")` or a deep-link URL).
 */
export async function signInViaAPI(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  const res = await page.request.post("/api/auth/sign-in", {
    data: { email, password },
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok()) {
    const body = await res.text().catch(() => "<unreadable>");
    throw new Error(
      `[e2e signInViaAPI] sign-in failed: HTTP ${res.status()} — ${body}`,
    );
  }
}
