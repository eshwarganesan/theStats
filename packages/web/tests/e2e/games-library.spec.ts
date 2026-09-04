/**
 * Playwright E2E spec for feature 010-games-library, US1.
 *
 * Covers the /games page list rendering: empty state, populated list
 * (correct labels/date/status/score), most-recent-activity ordering, and
 * incremental pagination. Also carries over the anonymous-game-on-sign-in
 * flows from feature 009 (they now surface the library on /games instead
 * of /account).
 *
 * Skipped when NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are
 * missing. Assumes migration 0002_account_library.sql has been applied to
 * the hosted Supabase — this feature adds no new migration.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.skip(
  !url || !serviceRole,
  "Hosted Supabase env vars missing — skipping games library E2E flow",
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

function uniqueEmail(prefix = "e2e-games-library"): string {
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

interface SeedGameInput {
  ownerId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore?: number;
  awayScore?: number;
  status?: "in-progress" | "finished";
  lastActivityAt?: string;
}

async function seedGame(input: SeedGameInput): Promise<string> {
  const {
    ownerId,
    homeTeamName,
    awayTeamName,
    homeScore = 0,
    awayScore = 0,
    status = "in-progress",
    lastActivityAt,
  } = input;
  const insert = await admin()
    .from("games")
    .insert({
      owner_id: ownerId,
      state: {
        schemaVersion: 1,
        homeTeam: { id: "h", name: homeTeamName, tag: "H", color: "#000", coach: "", roster: [] },
        awayTeam: { id: "a", name: awayTeamName, tag: "A", color: "#fff", coach: "", roster: [] },
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
        status: status === "finished" ? "final" : "live",
        currentPeriod: 1,
        events: [],
        possession: "home",
        onCourt: { home: [], away: [] },
      } as never,
      status,
      home_team_name: homeTeamName,
      away_team_name: awayTeamName,
      home_score: homeScore,
      away_score: awayScore,
      event_count: 0,
      current_period: 1,
      ...(lastActivityAt ? { last_activity_at: lastActivityAt } : {}),
    })
    .select("id")
    .single();
  if (insert.error) throw insert.error;
  return insert.data.id as string;
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

test.describe("Games page — list rendering", () => {
  test("empty state — a fresh signed-in user sees the empty-state message on /games", async ({
    page,
  }) => {
    const email = uniqueEmail();
    const password = "password12345";
    await createConfirmedUser(email, password);
    try {
      await signIn(page, email, password);
      await page.goto("/games");
      await expect(page.getByRole("heading", { name: "Games" })).toBeVisible();
      await expect(
        page.getByText(/games you play will appear here/i),
      ).toBeVisible();
      // New game CTA (US2) MUST be visible on the empty state page shell.
      await expect(page.getByRole("button", { name: /new game/i })).toBeVisible();
    } finally {
      await cleanup(email);
    }
  });

  test("populated list — every seeded game renders with correct team labels, status pill, and score, ordered by most-recent activity", async ({
    page,
  }) => {
    const email = uniqueEmail();
    const password = "password12345";
    const uid = await createConfirmedUser(email, password);
    try {
      // Seed three games with distinct, monotonically-decreasing
      // last_activity_at values. The oldest is finished; the newer two
      // are in-progress. Expected top-down order after render: 3, 2, 1.
      const t1 = new Date(Date.now() - 3 * 60_000).toISOString();
      const t2 = new Date(Date.now() - 2 * 60_000).toISOString();
      const t3 = new Date(Date.now() - 1 * 60_000).toISOString();
      await seedGame({
        ownerId: uid,
        homeTeamName: "Oldest Home",
        awayTeamName: "Oldest Away",
        homeScore: 88,
        awayScore: 72,
        status: "finished",
        lastActivityAt: t1,
      });
      await seedGame({
        ownerId: uid,
        homeTeamName: "Middle Home",
        awayTeamName: "Middle Away",
        homeScore: 12,
        awayScore: 14,
        status: "in-progress",
        lastActivityAt: t2,
      });
      await seedGame({
        ownerId: uid,
        homeTeamName: "Newest Home",
        awayTeamName: "Newest Away",
        homeScore: 6,
        awayScore: 2,
        status: "in-progress",
        lastActivityAt: t3,
      });

      await signIn(page, email, password);
      await page.goto("/games");

      const rows = page.getByRole("listitem");
      await expect(rows).toHaveCount(3);
      // First row = the newest activity.
      await expect(rows.nth(0)).toContainText("Newest Home");
      await expect(rows.nth(0)).toContainText("Newest Away");
      await expect(rows.nth(0)).toContainText("In progress");
      await expect(rows.nth(1)).toContainText("Middle Home");
      await expect(rows.nth(1)).toContainText("In progress");
      await expect(rows.nth(2)).toContainText("Oldest Home");
      await expect(rows.nth(2)).toContainText("Final");
      // Scores render.
      await expect(rows.nth(2)).toContainText("88");
      await expect(rows.nth(2)).toContainText("72");
    } finally {
      await cleanup(email);
    }
  });

  test("list fetch failure — page shell + New game CTA still render when /api/games returns 500", async ({
    page,
  }) => {
    const email = uniqueEmail();
    const password = "password12345";
    const uid = await createConfirmedUser(email, password);
    try {
      // Seed one game so an initial-batch nextCursor is expected and the
      // client will attempt to load more (which is the request we sabotage).
      await seedGame({
        ownerId: uid,
        homeTeamName: "One Home",
        awayTeamName: "One Away",
      });
      await signIn(page, email, password);
      // Intercept the client-side /api/games load-more calls.
      await page.route("**/api/games?**", (route) =>
        route.fulfill({ status: 500, body: JSON.stringify({ error: { code: "internal_error", message: "boom" } }) }),
      );
      await page.goto("/games");
      // Page shell is still there (header + CTA), the failure is confined
      // to the list section.
      await expect(page.getByRole("heading", { name: "Games" })).toBeVisible();
      await expect(page.getByRole("button", { name: /new game/i })).toBeVisible();
    } finally {
      await cleanup(email);
    }
  });
});

test.describe("Games page — anonymous game on sign-in prompt (FR-024 carry-over)", () => {
  const SAMPLE_RECORD = {
    schemaVersion: 1,
    homeTeam: { id: "home", name: "E2E Home", tag: "HOM", color: "#ff0000", coach: "", roster: [] },
    awayTeam: { id: "away", name: "E2E Away", tag: "AWY", color: "#0000ff", coach: "", roster: [] },
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
      { type: "score", id: "e1", timestamp: 1, period: 1, clockAt: 590, side: "home", playerId: "p1", kind: "2pt", made: true },
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

  test("Save to my account uploads the game and adds it to the Games list", async ({
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
      // Games list surface has moved from /account → /games.
      await page.getByRole("link", { name: "Games" }).click();
      await page.waitForURL("/games");
      const entry = page.getByRole("listitem").filter({ hasText: "E2E Home" });
      await expect(entry).toBeVisible();
      await expect(entry).toContainText("E2E Away");
    } finally {
      await cleanup(email);
    }
  });
});
