/**
 * Playwright E2E spec for the User Authentication feature.
 *
 * Runs against the dev server (next dev) + your hosted Supabase. The US1
 * block here is sufficient to exercise the MVP shipped in Phase 3:
 * sign-up via the UI → an unconfirmed session lands on `/` → AuthPill
 * reflects the new identity → confirmation via admin.generateLink (in lieu
 * of clicking a real email) → AuthPill drops the "Pending confirmation"
 * badge.
 *
 * Requires .env.local in packages/web/ to have:
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *   SUPABASE_SERVICE_ROLE_KEY.
 *
 * US2 (sign-in) and US3 (sign-out + deep-link redirect) extend this file
 * in their own task phases.
 */
import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

// Clear per-IP throttle rows before every test. The auth handler throttles
// per-account AND per-IP; localhost runs all share `ip:unknown`, so without
// this the IP key accumulates failures across consecutive runs and trips
// `rate_limited` even with a fresh email.
test.beforeEach(async () => {
  try {
    await admin().from("auth_attempts").delete().like("key", "ip:%");
  } catch {
    /* best-effort */
  }
});

test.describe("US1: sign up", () => {
  test("a new visitor signs up and lands on / with the AuthPill showing their email", async ({
    page,
  }) => {
    const email = uniqueEmail();
    try {
      await page.goto("/login");
      await page.getByRole("tab", { name: /sign up/i }).click();
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill("password12345");
      await page.getByRole("button", { name: /create account/i }).click();

      await page.waitForURL("/");
      await expect(page.getByText(email)).toBeVisible();
      await expect(page.getByText(/pending confirmation/i)).toBeVisible();

      // Confirm the account via the admin API to simulate the user clicking
      // the email link (Mailpit isn't available in cloud-only setups).
      const { data } = await admin().auth.admin.listUsers({ page: 1, perPage: 200 });
      const user = data.users.find((u) => u.email === email);
      expect(user).toBeDefined();
      await admin().auth.admin.updateUserById(user!.id, { email_confirm: true });

      await page.reload();
      await expect(page.getByText(email)).toBeVisible();
      await expect(page.getByText(/pending confirmation/i)).toHaveCount(0);
    } finally {
      await deleteUserByEmail(email);
    }
  });

  test("an already-signed-in user visiting /login is redirected to /", async ({ page: _page }) => {
    const email = uniqueEmail("e2e-signed-in");
    try {
      // Seed: create a confirmed user.
      const { data: created } = await admin().auth.admin.createUser({
        email,
        password: "password12345",
        email_confirm: true,
      });
      expect(created.user).toBeDefined();

      // Sign in via the (yet-to-exist) sign-in endpoint OR — for US1 only —
      // skip; this scenario is covered by US2's E2E once sign-in lands.
      test.skip(true, "Deferred to US2: requires the sign-in flow");
    } finally {
      await deleteUserByEmail(email);
    }
  });
});

test.describe("US2: sign in", () => {
  test("a confirmed user signs in via the panel toggle and lands on /", async ({ page }) => {
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

      await page.waitForURL("/");
      await expect(page.getByText(email)).toBeVisible();
      await expect(page.getByText(/pending confirmation/i)).toHaveCount(0);

      // Session survives a hard reload (FR-008).
      await page.reload();
      await expect(page.getByText(email)).toBeVisible();
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
      await expect(page.getByRole("main").getByText(email)).toBeVisible();
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
      await page.waitForURL("/");

      // Sign out from the AuthPill.
      await page.getByRole("button", { name: /sign out/i }).click();
      await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();

      // Anonymous screens still load (`/` is anonymous-accessible per the
      // hybrid mode clarification).
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
