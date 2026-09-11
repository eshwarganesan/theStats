/**
 * Playwright global setup — shared authenticated session for the E2E
 * suite (feature 011 FOLLOW-UP-1).
 *
 * Feature 011 auth-gates every route the E2E suite consumes, so a plain
 * `page.goto("/setup")` from `_helpers.ts::seedSetup` now bounces to
 * `/login`. To let the 16 downstream specs remain unchanged, we:
 *
 *   1. Provision a dedicated E2E user via the Supabase admin API
 *      (deleted + recreated each run so no state leaks between runs).
 *   2. Sign in through the real UI so the resulting session cookies
 *      match what a production browser would carry.
 *   3. Persist that browser context via `context.storageState()` to
 *      `tests/e2e/.auth/user.json`. `playwright.config.ts` wires this
 *      file into `use.storageState` so every worker starts already
 *      signed in.
 *
 * Auth-flow specs (`auth.spec.ts`, `auth-gated-landing.spec.ts`) opt
 * back out with `test.use({ storageState: { cookies: [], origins: [] } })`
 * — those are the tests that need to observe unauthenticated behavior.
 *
 * When the required Supabase env vars are missing (local dev without
 * .env.local), this writes an EMPTY storage state so Playwright can
 * still load a config that references the file. Every spec that
 * requires the fixture is guarded by
 * `test.skip(!url || !serviceRole, …)`, so a run without env variables
 * simply skips everything auth-related instead of failing at config
 * load.
 */
import { chromium, type FullConfig } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

export const E2E_SHARED_EMAIL = "e2e-shared-user@example.com";
export const E2E_SHARED_PASSWORD = "password12345";
export const E2E_STORAGE_STATE_PATH = path.resolve(
  __dirname,
  ".auth",
  "user.json",
);

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeEmptyStorageState(): void {
  ensureDir(E2E_STORAGE_STATE_PATH);
  fs.writeFileSync(
    E2E_STORAGE_STATE_PATH,
    JSON.stringify({ cookies: [], origins: [] }),
  );
}

async function globalSetup(config: FullConfig): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    // No env — every auth-dependent spec self-skips. Emit an empty
    // storage state so config load does not fail.
    writeEmptyStorageState();
    return;
  }

  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Idempotent create: if a prior run left the shared user behind (test
  // crash, aborted teardown), start fresh so we do not inherit stale
  // library rows or throttle-key state.
  const { data: listData } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const existing = listData.users.find((u) => u.email === E2E_SHARED_EMAIL);
  if (existing) {
    try {
      await admin.auth.admin.deleteUser(existing.id);
    } catch {
      /* best-effort */
    }
  }
  try {
    await admin.from("auth_attempts").delete().eq("key", `e:${E2E_SHARED_EMAIL}`);
  } catch {
    /* best-effort — table may be empty */
  }

  await admin.auth.admin.createUser({
    email: E2E_SHARED_EMAIL,
    password: E2E_SHARED_PASSWORD,
    email_confirm: true,
  });

  // Sign in through the UI so the storage state matches what a real
  // browser would carry (Supabase SSR cookies, not a raw JWT).
  const baseURL =
    (config.projects[0]?.use.baseURL as string | undefined) ??
    "http://localhost:3000";
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByRole("tab", { name: /sign in/i }).click();
    await page.getByLabel(/email/i).fill(E2E_SHARED_EMAIL);
    await page.getByLabel(/password/i).fill(E2E_SHARED_PASSWORD);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    // Feature 011 lands post-signin on /games.
    await page.waitForURL(/\/games/);

    ensureDir(E2E_STORAGE_STATE_PATH);
    await context.storageState({ path: E2E_STORAGE_STATE_PATH });
  } finally {
    await browser.close();
  }
}

export default globalSetup;
