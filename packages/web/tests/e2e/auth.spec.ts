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

// Give each test its own X-Forwarded-For so the per-IP throttle key is
// unique. Without this, every browser request from localhost shares
// `ip:unknown` and the intentional failed sign-in in the US2 unconfirmed
// test bumps the counter for concurrent tests running in other workers.
test.beforeEach(async ({ context }) => {
  const oct = () => Math.floor(Math.random() * 254) + 1;
  await context.setExtraHTTPHeaders({
    "x-forwarded-for": `10.${oct()}.${oct()}.${oct()}`,
  });
});

test.describe("US1: sign up", () => {
  test("a new visitor signs up and lands on / signed in", async ({
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

      await page.waitForURL("/");
      // The shell no longer surfaces an email / pending-confirmation pill;
      // the signed-in affordance is the account icon in the sidebar.
      await expect(page.getByRole("link", { name: /account/i })).toBeVisible();

      // Confirm the account via the admin API to simulate the user clicking
      // the email link (Mailpit isn't available in cloud-only setups).
      const { data } = await admin().auth.admin.listUsers({ page: 1, perPage: 200 });
      const user = data.users.find((u) => u.email === email);
      expect(user).toBeDefined();
      await admin().auth.admin.updateUserById(user!.id, { email_confirm: true });

      await page.reload();
      await expect(page.getByRole("link", { name: /account/i })).toBeVisible();
    } finally {
      await deleteUserByEmail(email);
    }
  });

  test("an already-signed-in user visiting /login is redirected to /", async ({ page }) => {
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
      await page.waitForURL("/");

      // Second visit — already signed in — LoginPage should redirect to /.
      await page.goto("/login");
      await expect(page).toHaveURL("/");
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
      // Signed-in affordance is the account icon in the sidebar.
      await expect(page.getByRole("link", { name: /account/i })).toBeVisible();

      // Session survives a hard reload (FR-008).
      await page.reload();
      await expect(page.getByRole("link", { name: /account/i })).toBeVisible();
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
      await page.waitForURL("/");

      // Sign out now lives on the account page.
      await page.getByRole("link", { name: /account/i }).click();
      await page.waitForURL("/account");
      await page.getByRole("button", { name: /sign out/i }).click();
      // SignOutButton returns the user to `/` in anonymous mode; the
      // account icon (the signed-in affordance) disappears.
      await page.waitForURL("/");
      await expect(page.getByRole("link", { name: /account/i })).toHaveCount(0);

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
