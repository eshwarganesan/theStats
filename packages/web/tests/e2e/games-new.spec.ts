/**
 * Playwright E2E spec for feature 010-games-library, US2.
 *
 * Covers FR-013 / FR-014 — the "New game" CTA is prominently visible
 * on the Games page in both populated and empty states, and clicking
 * it opens the existing /setup flow.
 *
 * Skipped when NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are
 * missing.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.skip(
  !url || !serviceRole,
  "Hosted Supabase env vars missing — skipping games new-CTA E2E flow",
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

function uniqueEmail(prefix = "e2e-games-new"): string {
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

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("/");
}

test.beforeEach(async ({ context }) => {
  const oct = () => Math.floor(Math.random() * 254) + 1;
  await context.setExtraHTTPHeaders({
    "x-forwarded-for": `10.${oct()}.${oct()}.${oct()}`,
  });
});

test.describe("Games page — New game CTA", () => {
  test("empty state — CTA is visible and click navigates to /setup", async ({
    page,
  }) => {
    const email = uniqueEmail();
    const password = "password12345";
    await createConfirmedUser(email, password);
    try {
      await signIn(page, email, password);
      await page.goto("/games");
      const cta = page.getByRole("button", { name: /new game/i });
      await expect(cta).toBeVisible();
      // Above-the-fold: sits alongside the "Games" header.
      await expect(page.getByRole("heading", { name: "Games" })).toBeVisible();
      // Also assert the FR-010 empty-state text is present.
      await expect(
        page.getByText(/games you play will appear here/i),
      ).toBeVisible();
      await cta.click();
      await page.waitForURL("/setup");
      await expect(page).toHaveURL("/setup");
    } finally {
      await cleanup(email);
    }
  });

  test("populated state — CTA is still visible above the list; click still routes to /setup", async ({
    page,
  }) => {
    const email = uniqueEmail();
    const password = "password12345";
    const uid = await createConfirmedUser(email, password);
    try {
      await admin()
        .from("games")
        .insert({
          owner_id: uid,
          state: {
            schemaVersion: 1,
            homeTeam: { id: "h", name: "CTA Home", tag: "H", color: "#000", coach: "", roster: [] },
            awayTeam: { id: "a", name: "CTA Away", tag: "A", color: "#fff", coach: "", roster: [] },
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
            events: [],
            possession: "home",
            onCourt: { home: [], away: [] },
          } as never,
          status: "in-progress",
          home_team_name: "CTA Home",
          away_team_name: "CTA Away",
          home_score: 0,
          away_score: 0,
          event_count: 0,
          current_period: 1,
        });

      await signIn(page, email, password);
      await page.goto("/games");

      // Row is present.
      await expect(
        page.getByRole("listitem").filter({ hasText: "CTA Home" }),
      ).toBeVisible();

      // CTA is still there and works.
      const cta = page.getByRole("button", { name: /new game/i });
      await expect(cta).toBeVisible();
      await cta.click();
      await page.waitForURL("/setup");
    } finally {
      await cleanup(email);
    }
  });
});
