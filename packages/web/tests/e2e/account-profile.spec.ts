/**
 * Playwright E2E spec for feature 009-account-library, US1.
 * Covers FR-001..FR-008 (account page + editable display name +
 * self-service password change + redirect when signed out).
 *
 * Runs against `next dev` + a Supabase project reachable via the
 * NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars, mirroring
 * the pattern in `auth.spec.ts`. Skipped when those are missing.
 */
import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.skip(
  !url || !serviceRole,
  "Hosted Supabase env vars missing — skipping account E2E flow",
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

function uniqueEmail(prefix = "e2e-account"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function createConfirmedUser(
  email: string,
  password: string,
): Promise<string> {
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

async function cleanup(email: string): Promise<void> {
  const { data } = await admin().auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const u = data.users.find((x) => x.email === email);
  if (u) {
    try {
      await admin().from("profiles").delete().eq("id", u.id);
    } catch {
      /* best-effort */
    }
    try {
      await admin().auth.admin.deleteUser(u.id);
    } catch {
      /* best-effort */
    }
  }
  try {
    await admin().from("auth_attempts").delete().eq("key", `e:${email}`);
    await admin().from("auth_attempts").delete().like("key", "ip:%");
  } catch {
    /* best-effort */
  }
}

test.beforeEach(async () => {
  try {
    await admin().from("auth_attempts").delete().like("key", "ip:%");
  } catch {
    /* best-effort */
  }
});

test.describe("Account page", () => {
  test("unauthenticated /account redirects to /login", async ({ page }) => {
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login/);
  });

  test("edit display name persists across reload", async ({ page }) => {
    const email = uniqueEmail();
    const password = "password12345";
    await createConfirmedUser(email, password);

    try {
      await page.goto("/login");
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill(password);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL("/");

      // Click the profile icon at the bottom of the sidebar (visible only
      // when signed in) to reach the account page.
      await page.getByRole("link", { name: /account/i }).click();
      await page.waitForURL("/account");

      // Email renders in both the header and the profile form; scope to the
      // first match to avoid a strict-mode conflict.
      await expect(page.getByText(email).first()).toBeVisible();

      const nameInput = page.getByLabel(/display name/i);
      await nameInput.fill("Coach K");
      await page.getByRole("button", { name: /save/i }).click();
      await expect(page.getByText(/saved/i)).toBeVisible();

      await page.reload();
      await expect(page.getByLabel(/display name/i)).toHaveValue("Coach K");
    } finally {
      await cleanup(email);
    }
  });

  test("change password: wrong current password rejects; correct succeeds and keeps the session", async ({
    page,
  }) => {
    const email = uniqueEmail();
    const password = "password12345";
    const newPassword = "brand-new-secret";
    await createConfirmedUser(email, password);

    try {
      await page.goto("/login");
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill(password);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL("/");

      await page.getByRole("link", { name: /account/i }).click();
      await page.waitForURL("/account");

      // Wrong current password → inline error, no logout.
      await page.getByLabel(/current password/i).fill("nope");
      await page.getByLabel(/new password/i).fill(newPassword);
      await page.getByRole("button", { name: /change password/i }).click();
      await expect(
        page.getByText(/current password is incorrect/i),
      ).toBeVisible();

      // Correct current + valid new → success, session intact.
      await page.getByLabel(/current password/i).fill(password);
      await page.getByLabel(/new password/i).fill(newPassword);
      await page.getByRole("button", { name: /change password/i }).click();
      await expect(page.getByText(/password updated/i)).toBeVisible();

      // Sanity: still signed in — reload the account page and see the email.
      await page.reload();
      await expect(page.getByText(email).first()).toBeVisible();
    } finally {
      await cleanup(email);
    }
  });
});
