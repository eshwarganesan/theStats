/**
 * Playwright E2E spec for feature 009-account-library, US4.
 *
 * Covers the review view for a finished game and the Delete flow for
 * both in-progress and finished games. Skipped when Supabase env is
 * missing; assumes migration 0002 has been applied.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.skip(!url || !serviceRole, "Hosted Supabase env vars missing — skipping review E2E flow");

let _admin: SupabaseClient | undefined;
function admin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(url!, serviceRole!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _admin;
}

function uniqueEmail(prefix = "e2e-review"): string {
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

function baseState(status: "live" | "finished", eventCount = 3) {
  const events = Array.from({ length: eventCount }).map((_, i) => ({
    type: "score",
    id: `e${i + 1}`,
    timestamp: i + 1,
    period: 1,
    clockAt: 590 - i,
    side: i % 2 === 0 ? "home" : "away",
    playerId: i % 2 === 0 ? "h1" : "a1",
    kind: "2pt",
    made: true,
  }));
  return {
    schemaVersion: 1,
    homeTeam: {
      id: "home",
      name: "Review Home",
      tag: "HOM",
      color: "#ff0000",
      coach: "",
      roster: [
        { id: "h1", number: "10", name: "H One", isStarter: true, isCaptain: false },
      ],
    },
    awayTeam: {
      id: "away",
      name: "Review Away",
      tag: "AWY",
      color: "#0000ff",
      coach: "",
      roster: [
        { id: "a1", number: "20", name: "A One", isStarter: true, isCaptain: false },
      ],
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
    status,
    currentPeriod: status === "finished" ? 4 : 2,
    events,
    possession: "home",
    onCourt: { home: [], away: [] },
  };
}

async function seedFinishedGame(userId: string): Promise<string> {
  const state = baseState("finished", 6);
  const insert = await admin()
    .from("games")
    .insert({
      owner_id: userId,
      state,
      status: "finished",
      home_team_name: "Review Home",
      away_team_name: "Review Away",
      home_score: 6,
      away_score: 6,
      event_count: 6,
      current_period: 4,
      finished_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (insert.error || !insert.data) throw insert.error ?? new Error("seed failed");
  return insert.data.id;
}

async function seedInProgressGame(userId: string): Promise<string> {
  const state = baseState("live", 3);
  const insert = await admin()
    .from("games")
    .insert({
      owner_id: userId,
      state,
      status: "in-progress",
      home_team_name: "Review Home",
      away_team_name: "Review Away",
      home_score: 4,
      away_score: 2,
      event_count: 3,
      current_period: 2,
    })
    .select("id")
    .single();
  if (insert.error || !insert.data) throw insert.error ?? new Error("seed failed");
  return insert.data.id;
}

async function cleanup(email: string): Promise<void> {
  const { data } = await admin().auth.admin.listUsers({ page: 1, perPage: 200 });
  const u = data.users.find((x) => x.email === email);
  if (u) {
    try { await admin().from("games").delete().eq("owner_id", u.id); } catch { /* best-effort */ }
    try { await admin().from("profiles").delete().eq("id", u.id); } catch { /* best-effort */ }
    try { await admin().auth.admin.deleteUser(u.id); } catch { /* best-effort */ }
  }
  try { await admin().from("auth_attempts").delete().like("key", "ip:%"); } catch { /* best-effort */ }
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("/");
}

// Give each test its own X-Forwarded-For so the per-IP throttle key is
// unique. Localhost requests otherwise share `ip:unknown`, letting a
// sibling test's failed sign-in race-poison this one under parallel workers.
test.beforeEach(async ({ context }) => {
  const oct = () => Math.floor(Math.random() * 254) + 1;
  await context.setExtraHTTPHeaders({
    "x-forwarded-for": `10.${oct()}.${oct()}.${oct()}`,
  });
});

test.describe("Review a finished game (US4)", () => {
  test("Review opens the read-only statsheet + game log; back returns to /account", async ({ page }) => {
    const email = uniqueEmail();
    const password = "password12345";
    const uid = await createConfirmedUser(email, password);
    await seedFinishedGame(uid);

    try {
      await signIn(page, email, password);
      await page.getByRole("link", { name: /account/i }).click();
      await page.waitForURL("/account");

      await page.getByRole("button", { name: /review/i }).click();
      await page.waitForURL(/\/account\/games\//);

      // The read-only review renders the team names in several places
      // (scoreboard + statsheet); scope to the first to avoid a
      // strict-mode conflict.
      await expect(page.getByText("Review Home").first()).toBeVisible();
      await expect(page.getByText("Review Away").first()).toBeVisible();
      // Read-only guarantee: no Edit play / Delete play buttons anywhere.
      await expect(page.getByRole("button", { name: /^edit play$/i })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^delete play$/i })).toHaveCount(0);

      await page.getByRole("link", { name: /back to your library/i }).click();
      await page.waitForURL("/account");
    } finally {
      await cleanup(email);
    }
  });
});

test.describe("Delete a game from the library (US4)", () => {
  test("Deleting a finished game removes it from the library", async ({ page }) => {
    const email = uniqueEmail();
    const password = "password12345";
    const uid = await createConfirmedUser(email, password);
    await seedFinishedGame(uid);

    try {
      await signIn(page, email, password);
      await page.getByRole("link", { name: /account/i }).click();
      await page.waitForURL("/account");

      await page.getByRole("button", { name: /^delete game$/i }).first().click();
      // Confirmation copy for finished games is generic.
      await expect(page.getByText(/statsheet.*permanently|permanently.*statsheet/i)).toBeVisible();
      await page.getByRole("button", { name: /^delete$/i }).click();

      await expect(page.getByText("Review Home")).toHaveCount(0);
    } finally {
      await cleanup(email);
    }
  });

  test("Deleting an in-progress game names the event count in the confirmation", async ({ page }) => {
    const email = uniqueEmail();
    const password = "password12345";
    const uid = await createConfirmedUser(email, password);
    await seedInProgressGame(uid);

    try {
      await signIn(page, email, password);
      await page.getByRole("link", { name: /account/i }).click();
      await page.waitForURL("/account");

      await page.getByRole("button", { name: /^delete game$/i }).first().click();
      // Confirmation copy for in-progress: names the event count + period.
      await expect(page.getByText(/3 event/i)).toBeVisible();
      await expect(page.getByText(/period 2/i)).toBeVisible();
      await page.getByRole("button", { name: /^delete$/i }).click();

      await expect(page.getByText("Review Home")).toHaveCount(0);
    } finally {
      await cleanup(email);
    }
  });
});
