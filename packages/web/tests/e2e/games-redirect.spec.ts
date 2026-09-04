/**
 * Playwright E2E spec for feature 010-games-library, FR-021.
 *
 * The old per-game route beneath the account page — `/account/games/:id`
 * — MUST issue a permanent redirect to `/games/:id` (declared in
 * `next.config.mjs`) so existing bookmarks and shared links continue to
 * resolve rather than 404. Verifies both the 3xx status and the
 * resolved-page correctness (auth + RLS still enforced downstream).
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
  "Hosted Supabase env vars missing — skipping games redirect E2E flow",
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

function uniqueEmail(prefix = "e2e-games-redirect"): string {
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

async function seedFinishedGame(userId: string): Promise<string> {
  const state = {
    schemaVersion: 1,
    homeTeam: { id: "home", name: "Redirect Home", tag: "RH", color: "#000", coach: "", roster: [] },
    awayTeam: { id: "away", name: "Redirect Away", tag: "RA", color: "#fff", coach: "", roster: [] },
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
    status: "finished",
    currentPeriod: 4,
    events: [],
    possession: "home",
    onCourt: { home: [], away: [] },
  };
  const insert = await admin()
    .from("games")
    .insert({
      owner_id: userId,
      state,
      status: "finished",
      home_team_name: "Redirect Home",
      away_team_name: "Redirect Away",
      home_score: 0,
      away_score: 0,
      event_count: 0,
      current_period: 4,
      finished_at: new Date().toISOString(),
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

test.beforeEach(async ({ context }) => {
  const oct = () => Math.floor(Math.random() * 254) + 1;
  await context.setExtraHTTPHeaders({
    "x-forwarded-for": `10.${oct()}.${oct()}.${oct()}`,
  });
});

test.describe("Legacy /account/games/[id] redirect (FR-021)", () => {
  test("issues a 3xx redirect to /games/[id] and resolves to the review view", async ({
    page,
  }) => {
    const email = uniqueEmail();
    const password = "password12345";
    const uid = await createConfirmedUser(email, password);
    const gameId = await seedFinishedGame(uid);

    try {
      await signIn(page, email, password);

      // Observe the response chain for the legacy URL.
      const redirected: number[] = [];
      page.on("response", (res) => {
        if (res.url().includes(`/account/games/${gameId}`)) {
          redirected.push(res.status());
        }
      });

      await page.goto(`/account/games/${gameId}`);
      await page.waitForURL(`**/games/${gameId}`);

      // The final URL is the new /games/[id] route.
      await expect(page).toHaveURL(new RegExp(`/games/${gameId}$`));
      // Downstream page rendered (RLS + auth chain intact).
      await expect(page.getByText("Redirect Home").first()).toBeVisible();
      // A 3xx status was recorded for the legacy URL (permanent = 308 in
      // Next.js's redirects() output).
      expect(redirected.some((s) => s >= 300 && s < 400)).toBe(true);
    } finally {
      await cleanup(email);
    }
  });
});
