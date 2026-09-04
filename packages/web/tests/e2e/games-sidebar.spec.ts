/**
 * Playwright E2E spec for feature 010-games-library, US1 (sidebar
 * affordance + auth-gated redirect).
 *
 * Covers FR-001..FR-004 and FR-006 — the "Games" nav item appears in
 * both collapsed rail and expanded overlay, indicates active state on
 * /games and its descendants, and (for signed-out visitors) routes
 * through /login?from=%2Fgames before returning to /games.
 *
 * Skipped when NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are
 * missing (the signed-in cases seed a real user).
 */
import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.skip(
  !url || !serviceRole,
  "Hosted Supabase env vars missing — skipping games sidebar E2E flow",
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

function uniqueEmail(prefix = "e2e-games-sidebar"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function createConfirmedUser(email: string, password: string): Promise<string> {
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

async function cleanup(email: string): Promise<void> {
  const { data } = await admin().auth.admin.listUsers({ page: 1, perPage: 200 });
  const u = data.users.find((x) => x.email === email);
  if (u) {
    try {
      await admin().from("games").delete().eq("owner_id", u.id);
    } catch {
      /* best-effort */
    }
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
    await admin().from("auth_attempts").delete().like("key", "ip:%");
  } catch {
    /* best-effort */
  }
}

test.beforeEach(async ({ context }) => {
  const oct = () => Math.floor(Math.random() * 254) + 1;
  await context.setExtraHTTPHeaders({
    "x-forwarded-for": `10.${oct()}.${oct()}.${oct()}`,
  });
});

test.describe("Sidebar Games item", () => {
  test("signed-out visitor sees the item; clicking it routes through /login?from=%2Fgames and returns to /games", async ({
    page,
  }) => {
    const email = uniqueEmail();
    const password = "password12345";
    await createConfirmedUser(email, password);
    try {
      await page.goto("/");
      const gamesLink = page.getByRole("link", { name: "Games" });
      await expect(gamesLink).toBeVisible();
      await expect(gamesLink).toHaveAttribute("href", "/games");
      await gamesLink.click();
      await page.waitForURL(/\/login\?from=%2Fgames/);

      // Sign in and confirm the return-to-Games behavior.
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill(password);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL("/games");
      await expect(page.getByRole("heading", { name: "Games" })).toBeVisible();
    } finally {
      await cleanup(email);
    }
  });

  test("signed-in click on the sidebar Games item navigates to /games and marks the item active", async ({
    page,
  }) => {
    const email = uniqueEmail();
    const password = "password12345";
    await createConfirmedUser(email, password);
    try {
      await page.goto("/login");
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill(password);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL("/");

      const gamesLink = page.getByRole("link", { name: "Games" });
      await expect(gamesLink).toBeVisible();
      await gamesLink.click();
      await page.waitForURL("/games");

      // Active-state indicator (FR-003).
      await expect(gamesLink).toHaveAttribute("data-active", "true");
      await expect(gamesLink).toHaveAttribute("aria-current", "page");
    } finally {
      await cleanup(email);
    }
  });

  test("collapsed rail vs expanded overlay — the item is reachable in both", async ({
    page,
  }) => {
    // Signed-out state is fine — we're only asserting the item is present
    // and clickable in each sidebar mode.
    await page.goto("/");
    // Rail-first: the sidebar defaults collapsed.
    await expect(
      page.getByRole("navigation").first(),
    ).toHaveAttribute("data-collapsed", "true");
    const collapsedLink = page.getByRole("link", { name: "Games" });
    await expect(collapsedLink).toBeVisible();

    // Expand the sidebar via its toggle.
    await page.getByRole("button", { name: /expand sidebar/i }).click();
    await expect(
      page.getByRole("navigation").first(),
    ).toHaveAttribute("data-collapsed", "false");
    const expandedLink = page.getByRole("link", { name: "Games" });
    await expect(expandedLink).toBeVisible();
  });
});
