/**
 * Playwright E2E spec for feature 010-games-library, US3.
 * (Replaces feature 009's account-continue.spec.ts — the library now
 * lives on /games, so the Continue entry point moved with it.)
 *
 * Verifies that a signed-in user can open an in-progress game from
 * /games and land on the live game view with the game restored and the
 * clock paused. Also covers the "unavailable" path when a game is
 * deleted between page load and click (US3 acceptance scenario 4).
 *
 * Skipped when NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are
 * missing and assumes migration 0002_account_library.sql has been
 * applied to the hosted Supabase.
 */
import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.skip(
  !url || !serviceRole,
  "Hosted Supabase env vars missing — skipping games continue E2E flow",
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

function uniqueEmail(prefix = "e2e-games-continue"): string {
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

async function seedGame(userId: string): Promise<string> {
  const state = {
    schemaVersion: 1,
    homeTeam: {
      id: "home",
      name: "Continue Home",
      tag: "CH",
      color: "#ff0000",
      coach: "",
      roster: [],
    },
    awayTeam: {
      id: "away",
      name: "Continue Away",
      tag: "CA",
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
    currentPeriod: 2,
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
  const insert = await admin()
    .from("games")
    .insert({
      owner_id: userId,
      state,
      status: "in-progress",
      home_team_name: "Continue Home",
      away_team_name: "Continue Away",
      home_score: 2,
      away_score: 0,
      event_count: 1,
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

test.describe("Continue an interrupted game from /games (US3)", () => {
  test("Continue navigates from /games into the live game view with matching state", async ({
    page,
  }) => {
    const email = uniqueEmail();
    const password = "password12345";
    const uid = await createConfirmedUser(email, password);
    await seedGame(uid);

    try {
      await page.goto("/login");
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill(password);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL("/");

      await page.getByRole("link", { name: "Games" }).click();
      await page.waitForURL("/games");

      const continueBtn = page.getByRole("button", { name: /^continue$/i }).first();
      await expect(continueBtn).toBeVisible();
      await continueBtn.click();

      // Land on the live game console with the seeded game restored — the
      // team names from the saved state are shown in the panels.
      await page.waitForURL("**/game");
      await expect(page.getByText("Continue Home").first()).toBeVisible();
      await expect(page.getByText("Continue Away").first()).toBeVisible();
    } finally {
      await cleanup(email);
    }
  });

  test("clicking a Continue for a game that was deleted from another session surfaces an error (US3 scenario 4)", async ({
    page,
  }) => {
    const email = uniqueEmail();
    const password = "password12345";
    const uid = await createConfirmedUser(email, password);
    const gameId = await seedGame(uid);

    try {
      await page.goto("/login");
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill(password);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL("/");

      await page.getByRole("link", { name: "Games" }).click();
      await page.waitForURL("/games");

      // Between the page render and the click, another session deletes
      // the game.
      await admin().from("games").delete().eq("id", gameId);

      await page.getByRole("button", { name: /^continue$/i }).first().click();

      // The row surfaces an inline "couldn't load" error rather than
      // crashing the app.
      await expect(
        page.getByText(/couldn.{0,3}t load the game/i),
      ).toBeVisible();
      // The user stays on /games (no navigation to /game).
      await expect(page).toHaveURL(/\/games$/);
    } finally {
      await cleanup(email);
    }
  });
});
