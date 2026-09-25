/**
 * Playwright global setup — shared authenticated session for the E2E
 * suite (feature 011 FOLLOW-UP-1).
 *
 * Feature 011 auth-gates every route the E2E suite consumes, so a plain
 * `page.goto("/setup")` from `_helpers.ts::seedSetup` now bounces to
 * `/login`. To let the 16 downstream specs remain unchanged, we:
 *
 *   1. Provision a dedicated E2E user via the Supabase admin API
 *      (delete + recreate each run so no state leaks between runs).
 *   2. Sign the user in by POSTing directly to the app's own
 *      `/api/auth/sign-in` route via Playwright's request context.
 *      This exercises the exact same code path production uses and
 *      makes the response's `Set-Cookie` headers land in the request
 *      context's cookie jar — no UI rendering involved.
 *   3. Persist the resulting cookies via `context.storageState()` to
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
 * `test.skip(!url || !serviceRole, …)`, so a run without env vars
 * simply skips everything auth-related instead of failing at config
 * load.
 *
 * Rationale (design shift from an earlier iteration): an earlier
 * version drove sign-in through the UI (`page.goto("/login")` →
 * `page.fill` → `page.click`). That flow was flaky on CI — Supabase's
 * per-IP throttle and browser-side race conditions occasionally
 * produced an empty storage state, silently unauthenticating every
 * downstream spec. Bypassing the UI removes both classes of flake.
 */
import { request, type FullConfig } from "@playwright/test";
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

  // Sign in by hitting the app's own sign-in route. The response's
  // Set-Cookie headers (Supabase SSR session cookies) automatically
  // land in the request context's cookie jar, and `storageState()`
  // serializes them to disk.
  const baseURL =
    (config.projects[0]?.use.baseURL as string | undefined) ??
    "http://localhost:3000";
  // Fresh-per-run X-Forwarded-For so the per-IP throttle key does not
  // collide with prior runs on shared CI infra.
  const oct = () => Math.floor(Math.random() * 254) + 1;
  const forwardedFor = `10.${oct()}.${oct()}.${oct()}`;

  const ctx = await request.newContext({
    baseURL,
    extraHTTPHeaders: { "x-forwarded-for": forwardedFor },
  });

  try {
    const res = await ctx.post("/api/auth/sign-in", {
      data: {
        email: E2E_SHARED_EMAIL,
        password: E2E_SHARED_PASSWORD,
      },
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok()) {
      const body = await res.text().catch(() => "<unreadable>");
      throw new Error(
        `[e2e global-setup] sign-in failed: HTTP ${res.status()} — ${body}`,
      );
    }
    ensureDir(E2E_STORAGE_STATE_PATH);
    await ctx.storageState({ path: E2E_STORAGE_STATE_PATH });
  } finally {
    await ctx.dispose();
  }
}

export default globalSetup;
