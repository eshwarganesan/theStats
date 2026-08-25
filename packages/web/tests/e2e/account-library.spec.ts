/**
 * Playwright E2E spec for feature 009-account-library, US2.
 *
 * Covers the library view and the anonymous-game-on-sign-in prompt.
 * Skipped when NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are
 * missing. Assumes migration 0002_account_library.sql has been applied
 * to the hosted Supabase — if the `games` table is absent, tests that
 * touch it will fail loudly rather than silently succeed.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.skip(
  !url || !serviceRole,
  "Hosted Supabase env vars missing — skipping account library E2E flow",
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

function uniqueEmail(prefix = "e2e-library"): string {
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

test.beforeEach(async () => {
  try {
    await admin().from("auth_attempts").delete().like("key", "ip:%");
  } catch {
    /* best-effort */
  }
});

test.describe("Account library — empty state", () => {
  test("a fresh signed-in user sees the empty-state message on /account", async ({
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

      await page.getByRole("link", { name: /account/i }).click();
      await page.waitForURL("/account");

      await expect(
        page.getByText(/games you play will appear here/i),
      ).toBeVisible();
    } finally {
      await cleanup(email);
    }
  });
});

test.describe("Anonymous game on sign-in prompt (FR-024)", () => {
  const SAMPLE_RECORD = {
    schemaVersion: 1,
    homeTeam: {
      id: "home",
      name: "E2E Home",
      tag: "HOM",
      color: "#ff0000",
      coach: "",
      roster: [],
    },
    awayTeam: {
      id: "away",
      name: "E2E Away",
      tag: "AWY",
      color: "#0000ff",
      coach: "",
      roster: [],
    },
    settings: {
      format: "5v5",
      periods: 4,
      periodSeconds: 600,
      overtimeSeconds: 300,
      overtimeEnabled: true,
      possessionArrowEnabled: true,
      bonusFoulThreshold: 5,
      timeoutsPerGame: 4,
      timeoutSeconds: 60,
      quarterBreakSeconds: 60,
      halftimeBreakSeconds: 900,
      venue: "",
      competition: "",
    },
    status: "live",
    currentPeriod: 1,
    events: [
      {
        type: "score",
        id: "e1",
        timestamp: 1,
        period: 1,
        clockAt: 590,
        side: "home",
        playerId: "p1",
        kind: "2pt",
        made: true,
      },
    ],
    possession: "home",
    onCourt: { home: [], away: [] },
  };

  async function seedLocalGame(page: Page) {
    await page.goto("/login");
    await page.evaluate((rec) => {
      window.localStorage.setItem(
        "thestats.game.v1",
        JSON.stringify({ state: rec, version: 1 }),
      );
    }, SAMPLE_RECORD);
  }

  test("Discard clears the local key and completes the redirect", async ({ page }) => {
    const email = uniqueEmail();
    const password = "password12345";
    await createConfirmedUser(email, password);
    try {
      await seedLocalGame(page);

      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill(password);
      await page.getByRole("button", { name: /sign in/i }).click();

      // The prompt appears; click Discard.
      const discard = page.getByRole("button", { name: /discard/i });
      await expect(discard).toBeVisible();
      await discard.click();

      await page.waitForURL("/");
      const local = await page.evaluate(() =>
        window.localStorage.getItem("thestats.game.v1"),
      );
      expect(local).toBeNull();
    } finally {
      await cleanup(email);
    }
  });

  test("Keep local leaves the local key untouched", async ({ page }) => {
    const email = uniqueEmail();
    const password = "password12345";
    await createConfirmedUser(email, password);
    try {
      await seedLocalGame(page);

      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill(password);
      await page.getByRole("button", { name: /sign in/i }).click();

      const keep = page.getByRole("button", { name: /keep local/i });
      await expect(keep).toBeVisible();
      await keep.click();

      await page.waitForURL("/");
      const local = await page.evaluate(() =>
        window.localStorage.getItem("thestats.game.v1"),
      );
      expect(local).not.toBeNull();
    } finally {
      await cleanup(email);
    }
  });

  test("Save to my account uploads the game and adds it to the library", async ({
    page,
  }) => {
    const email = uniqueEmail();
    const password = "password12345";
    await createConfirmedUser(email, password);
    try {
      await seedLocalGame(page);

      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill(password);
      await page.getByRole("button", { name: /sign in/i }).click();

      const save = page.getByRole("button", { name: /save to my account/i });
      await expect(save).toBeVisible();
      await save.click();

      await page.waitForURL("/");
      // Local key was cleared as part of the save flow.
      const local = await page.evaluate(() =>
        window.localStorage.getItem("thestats.game.v1"),
      );
      expect(local).toBeNull();

      // The game should now show up in the account library. Scope to the
      // library list item so the (hidden) sign-in prompt node that lingers
      // in the DOM with the same team names doesn't cause a strict-mode
      // conflict.
      await page.getByRole("link", { name: /account/i }).click();
      await page.waitForURL("/account");
      const entry = page.getByRole("listitem").filter({ hasText: "E2E Home" });
      await expect(entry).toBeVisible();
      await expect(entry).toContainText("E2E Away");
    } finally {
      await cleanup(email);
    }
  });
});
