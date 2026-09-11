/**
 * Playwright E2E — Auth-Gated App with Public Landing Page (feature 011).
 *
 * Covers the three prioritized user stories in spec.md:
 *   US1 (P1): Signed-out visitor sees the public landing without a
 *             sidebar. Both landing CTAs route to /login.
 *   US2 (P2): Signed-in user hitting / or /login is redirected to /games.
 *             Sign-out returns the user to the public landing at /.
 *   US3 (P3): Signed-out deep links to /setup, /game, /games/<id>,
 *             /account bounce to /login?from=<encoded>. After sign-in,
 *             the browser lands on the originally-requested URL.
 *
 * Runs against the dev server (next dev) + hosted Supabase (see
 * playwright.config.ts). Skipped when the required env is absent.
 */
import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Opt this whole file out of the shared authenticated storage state
// (FOLLOW-UP-1). Feature 011's stories are all about the boundary
// between signed-out and signed-in, so every test in this file starts
// from an empty cookie jar and either stays anonymous or signs in
// through a fresh admin-provisioned user.
test.use({ storageState: { cookies: [], origins: [] } });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.skip(
  !url || !serviceRole,
  "Hosted Supabase env vars missing — skipping feature 011 E2E flow",
);

let _admin: SupabaseClient | undefined;
function admin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(url!, serviceRole!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _admin;
}

function uniqueEmail(prefix = "e2e-011"): string {
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

// Give each test its own X-Forwarded-For so the per-IP throttle key is
// unique across parallel workers.
test.beforeEach(async ({ context }) => {
  const oct = () => Math.floor(Math.random() * 254) + 1;
  await context.setExtraHTTPHeaders({
    "x-forwarded-for": `10.${oct()}.${oct()}.${oct()}`,
  });
});

test.describe("US1 — public landing for signed-out visitors", () => {
  test("landing at / renders the hero and does not render the app sidebar", async ({ page }) => {
    await page.goto("/");
    // Marketing hero copy from app/page.tsx — a stable landmark that
    // signals the landing rendered.
    await expect(page.getByText(/Every Bucket\./i)).toBeVisible();
    // Sidebar's semantic landmark — MUST be absent on the public landing.
    await expect(page.getByRole("navigation", { name: /primary/i })).toHaveCount(0);
  });

  test('the "New Game" CTA routes a signed-out visitor to /login', async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /new game/i }).click();
    await page.waitForURL(/\/login(\?.*)?$/);
    expect(page.url()).toContain("/login");
  });

  test('the "Continue Game" CTA routes a signed-out visitor to /login', async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /continue game/i }).click();
    await page.waitForURL(/\/login(\?.*)?$/);
    expect(page.url()).toContain("/login");
  });

  test("the login page itself does not render the app sidebar (FR-011)", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole("navigation", { name: /primary/i })).toHaveCount(0);
  });
});

test.describe("US2 — signed-in users skip the landing", () => {
  test("a signed-in visit to / is redirected to /games with no landing flash", async ({ page }) => {
    const email = uniqueEmail("e2e-011-us2-slash");
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

      await page.goto("/");
      await expect(page).toHaveURL("/games");
      // Absence of the landing hero — the redirect MUST fire before render.
      await expect(page.getByText(/Every Bucket\./i)).toHaveCount(0);
    } finally {
      await deleteUserByEmail(email);
    }
  });

  test("a signed-in visit to /login is redirected to /games", async ({ page }) => {
    const email = uniqueEmail("e2e-011-us2-login");
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

      await page.goto("/login");
      await expect(page).toHaveURL("/games");
    } finally {
      await deleteUserByEmail(email);
    }
  });

  test("signing out from an authenticated page returns the user to the public landing at /", async ({ page }) => {
    const email = uniqueEmail("e2e-011-us2-signout");
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

      await page.getByRole("link", { name: /account/i }).click();
      await page.waitForURL("/account");
      await page.getByRole("button", { name: /sign out/i }).click();

      await page.waitForURL("/");
      // The landing hero renders again — signed-out state.
      await expect(page.getByText(/Every Bucket\./i)).toBeVisible();
    } finally {
      await deleteUserByEmail(email);
    }
  });
});

test.describe("US3 — deep-link protection for signed-out users", () => {
  for (const path of ["/setup", "/game", "/games", "/account"]) {
    test(`a signed-out deep link to ${path} bounces to /login?from=${encodeURIComponent(path)}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForURL((u) => u.pathname === "/login");
      expect(page.url()).toContain(`from=${encodeURIComponent(path)}`);
      // Login page must NOT show the sidebar (spec FR-011).
      await expect(page.getByRole("navigation", { name: /primary/i })).toHaveCount(0);
    });
  }

  test("after signing in from a deep-link redirect, the user lands on the originally-requested URL", async ({ page }) => {
    const email = uniqueEmail("e2e-011-us3-roundtrip");
    try {
      await admin().auth.admin.createUser({
        email,
        password: "password12345",
        email_confirm: true,
      });

      await page.goto("/account");
      await page.waitForURL((u) => u.pathname === "/login");
      expect(page.url()).toContain("from=%2Faccount");

      await page.getByRole("tab", { name: /sign in/i }).click();
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill("password12345");
      await page.getByRole("button", { name: /^sign in$/i }).click();

      await page.waitForURL("/account");
      await expect(page.getByText(/signed in as/i)).toBeVisible();
    } finally {
      await deleteUserByEmail(email);
    }
  });

  test("the query string is preserved through the from-round-trip", async ({ page }) => {
    const email = uniqueEmail("e2e-011-us3-query");
    try {
      await admin().auth.admin.createUser({
        email,
        password: "password12345",
        email_confirm: true,
      });

      const deepLink = "/games?filter=in-progress";
      await page.goto(deepLink);
      await page.waitForURL((u) => u.pathname === "/login");
      // The `from` value should be the encoded original URL including query.
      expect(page.url()).toContain(
        `from=${encodeURIComponent(deepLink)}`,
      );

      await page.getByRole("tab", { name: /sign in/i }).click();
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill("password12345");
      await page.getByRole("button", { name: /^sign in$/i }).click();

      await page.waitForURL(deepLink);
    } finally {
      await deleteUserByEmail(email);
    }
  });
});
