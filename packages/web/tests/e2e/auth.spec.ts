/**
 * Playwright E2E spec for the User Authentication feature.
 *
 * Runs against the dev server (next dev) + your hosted Supabase. Covers:
 *   - US1: sign up → account is created and lands on /games
 *   - US2: sign in / already-signed-in redirect / unconfirmed user flow
 *   - US3: sign out → landing at /, /account gated again
 *
 * Requires .env.local in packages/web/ to have:
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *   SUPABASE_SERVICE_ROLE_KEY.
 *
 * Because this whole file is about the unauthenticated → authenticated
 * transition, it opts out of the shared authenticated storage state
 * (from `global-setup.ts`) via `test.use({ storageState: {…} })` AND a
 * defensive `context.clearCookies()` in `beforeEach` — Playwright's
 * `test.use` override has been observed to leak the shared cookies
 * through on CI, so belt-and-suspenders.
 */
import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomForwardedFor } from "./_auth-helpers";

test.use({ storageState: { cookies: [], origins: [] } });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.skip(!url || !serviceRole, "Hosted Supabase env vars missing — skipping E2E auth flow");

let _admin: SupabaseClient | undefined;
function admin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(url!, serviceRole!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _admin;
}

function uniqueEmail(prefix = "e2e-signup"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function deleteUserByEmail(email: string): Promise<void> {
  const { data } = await admin().auth.admin.listUsers({ page: 1, perPage: 200 });
  const u = data.users.find((x) => x.email === email);
  if (u) {
    try {
      await admin().auth.admin.deleteUser(u.id);
    } catch {
      /* best-effort */
    }
  }
  try {
    await admin().from("auth_attempts").delete().eq("key", `e:${email}`);
  } catch {
    /* best-effort */
  }
}

// Belt-and-suspenders: even though `test.use({ storageState: {...} })`
// at file scope should give every test a fresh empty context, the
// shared cookies from `global-setup.ts` have been observed to bleed
// through on CI. Explicitly clear them at the top of every test.
// Also stamp a per-test X-Forwarded-For so the per-IP throttle key is
// unique across parallel workers.
test.beforeEach(async ({ context }) => {
  await context.clearCookies();
  await context.setExtraHTTPHeaders({
    "x-forwarded-for": randomForwardedFor(),
  });
});

test.describe("US1: sign up", () => {
  test("a new visitor signs up and lands on /games signed in", async ({
    page,
  }) => {
    const email = uniqueEmail();
    try {
      await page.goto("/login");
      await page.getByRole("tab", { name: /sign up/i }).click();
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill("password12345");

      // Sign-up triggers a Supabase confirmation email; the hosted
      // project's per-hour SMTP quota (2/hr on the built-in mailer) is
      // shared across every test run. If we've exhausted the quota, the
      // route responds with the same "rate_limited" envelope our own
      // throttle uses. Detect that here and skip cleanly rather than
      // waste 30 s on a doomed `waitForURL`.
      const [signUpRes] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().includes("/api/auth/sign-up") &&
            r.request().method() === "POST",
        ),
        page.getByRole("button", { name: /create account/i }).click(),
      ]);
      test.skip(
        signUpRes.status() === 429,
        "Supabase provider throttled the sign-up email send; try again after the mailer quota resets.",
      );
      expect(signUpRes.status()).toBe(200);

      // Post-signin lands on /games (feature 011 FR-010).
      await page.waitForURL("/games");
      // Proof the authenticated shell mounted — the hamburger button is
      // visible on every authenticated page (the Account link lives
      // inside the closed drawer, so we don't assert on it directly).
      await expect(
        page.getByRole("button", { name: /open navigation menu/i }),
      ).toBeVisible();

      // Confirm the account via the admin API to simulate the user clicking
      // the email link (Mailpit isn't available in cloud-only setups).
      const { data } = await admin().auth.admin.listUsers({ page: 1, perPage: 200 });
      const user = data.users.find((u) => u.email === email);
      expect(user).toBeDefined();
      await admin().auth.admin.updateUserById(user!.id, { email_confirm: true });

      await page.reload();
      await expect(
        page.getByRole("button", { name: /open navigation menu/i }),
      ).toBeVisible();
    } finally {
      await deleteUserByEmail(email);
    }
  });

  test("an already-signed-in user visiting /login is redirected to /games", async ({ page }) => {
    const email = uniqueEmail("e2e-signed-in");
    try {
      const { data: created } = await admin().auth.admin.createUser({
        email,
        password: "password12345",
        email_confirm: true,
      });
      expect(created.user).toBeDefined();

      await page.goto("/login");
      await page.getByRole("tab", { name: /sign in/i }).click();
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill("password12345");
      await page.getByRole("button", { name: /^sign in$/i }).click();
      await page.waitForURL("/games");

      // Second visit — already signed in — LoginPage should redirect to
      // /games (feature 011 FR-012).
      await page.goto("/login");
      await expect(page).toHaveURL("/games");
    } finally {
      await deleteUserByEmail(email);
    }
  });
});

test.describe("US2: sign in", () => {
  test("a confirmed user signs in via the panel toggle and lands on /games", async ({ page }) => {
    const email = uniqueEmail("e2e-signin");
    try {
      await admin().auth.admin.createUser({
        email,
        password: "password12345",
        email_confirm: true,
      });

      await page.goto("/login");
      // Default mode is sign-in for US2; ensure we're on the right tab.
      await page.getByRole("tab", { name: /sign in/i }).click();
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill("password12345");
      await page.getByRole("button", { name: /^sign in$/i }).click();

      // Post-signin lands on /games (feature 011 FR-010).
      await page.waitForURL("/games");
      // Proof the authenticated shell mounted (hamburger visible on
      // every authenticated page). Account link lives inside the closed
      // drawer under the new hamburger design.
      await expect(
        page.getByRole("button", { name: /open navigation menu/i }),
      ).toBeVisible();

      // Session survives a hard reload (FR-008).
      await page.reload();
      await expect(
        page.getByRole("button", { name: /open navigation menu/i }),
      ).toBeVisible();
    } finally {
      await deleteUserByEmail(email);
    }
  });

  test("an unconfirmed user is shown a resend CTA rather than being signed in", async ({
    page,
  }) => {
    const email = uniqueEmail("e2e-unconfirmed");
    try {
      await admin().auth.admin.createUser({
        email,
        password: "password12345",
        email_confirm: false,
      });

      await page.goto("/login");
      await page.getByRole("tab", { name: /sign in/i }).click();
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill("password12345");
      await page.getByRole("button", { name: /^sign in$/i }).click();

      await expect(page.getByRole("button", { name: /resend confirmation/i })).toBeVisible();
      // We did NOT land on /; the URL stays on /login because the session
      // was never established (FR-005).
      expect(page.url()).toContain("/login");
    } finally {
      await deleteUserByEmail(email);
    }
  });
});

test.describe("US3: sign out + account-gate", () => {
  test("anonymous deep-link to /account redirects to /login?from=%2Faccount; signed-in deep-link renders", async ({
    page,
  }) => {
    const email = uniqueEmail("e2e-gate");
    try {
      await admin().auth.admin.createUser({
        email,
        password: "password12345",
        email_confirm: true,
      });

      // Anonymous deep link → redirect to login carrying the destination.
      await page.goto("/account");
      await page.waitForURL((url) => url.pathname === "/login");
      expect(page.url()).toContain("from=%2Faccount");

      // Sign in via the same page.
      await page.getByRole("tab", { name: /sign in/i }).click();
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill("password12345");
      await page.getByRole("button", { name: /^sign in$/i }).click();

      // After sign-in we should be returned to the originally requested
      // screen (the page reads `from` from searchParams and redirects).
      await page.waitForURL("/account");
      await expect(page.getByText(/signed in as/i)).toBeVisible();
      // The email appears in both the header and the profile form on
      // /account; scope to the first match to avoid a strict-mode conflict.
      await expect(page.getByRole("main").getByText(email).first()).toBeVisible();
    } finally {
      await deleteUserByEmail(email);
    }
  });

  test("sign-out reverts the app to anonymous mode and blocks subsequent access to /account", async ({
    page,
  }) => {
    const email = uniqueEmail("e2e-signout");
    try {
      await admin().auth.admin.createUser({
        email,
        password: "password12345",
        email_confirm: true,
      });

      await page.goto("/login");
      await page.getByRole("tab", { name: /sign in/i }).click();
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill("password12345");
      await page.getByRole("button", { name: /^sign in$/i }).click();
      await page.waitForURL("/games");

      // Reach the account page directly (Account link now lives inside
      // the closed hamburger drawer under the redesigned sidebar; direct
      // navigation is more robust than opening the drawer to click a
      // link).
      await page.goto("/account");
      await expect(page).toHaveURL("/account");
      await page.getByRole("button", { name: /sign out/i }).click();
      // SignOutButton returns the user to `/` (public landing, feature 011).
      await page.waitForURL("/");
      // The hamburger (and thus the authenticated shell) is gone on the
      // public landing.
      await expect(
        page.getByRole("button", { name: /open navigation menu/i }),
      ).toHaveCount(0);

      // Anonymous visit to `/` stays on `/` (landing).
      await page.goto("/");
      await expect(page).toHaveURL("/");

      // But /account now redirects to /login again.
      await page.goto("/account");
      await page.waitForURL((url) => url.pathname === "/login");
    } finally {
      await deleteUserByEmail(email);
    }
  });
});
