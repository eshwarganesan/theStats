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
 * Sign in via a browser-side `fetch` to `/api/auth/sign-in`.
 *
 * We first navigate to `/login` (a same-origin public page) to
 * establish the origin, then run the sign-in POST inside the page
 * context via `page.evaluate`. The Set-Cookie headers flow through
 * the browser's own cookie management — the same path a real user's
 * form submit would take — which avoids a Chromium quirk observed on
 * CI where cookies set by `page.request.post` (a Node-side request
 * context) don't reliably propagate to subsequent `page.goto` calls.
 *
 * Does NOT navigate after sign-in — the caller decides where to go
 * next (typically `page.goto("/games")` or a deep-link URL).
 */
export async function signInViaAPI(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  const result = await page.evaluate(
    async ({ email, password }) => {
      const res = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
      const bodyText = await res.text().catch(() => "");
      return { ok: res.ok, status: res.status, body: bodyText };
    },
    { email, password },
  );
  if (!result.ok) {
    throw new Error(
      `[e2e signInViaAPI] sign-in failed: HTTP ${result.status} — ${result.body}`,
    );
  }
}
