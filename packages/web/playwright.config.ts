import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local is optional — tests guard on the vars and skip when missing.
}

// Shared authenticated storage state produced by `tests/e2e/global-setup.ts`
// (feature 011 FOLLOW-UP-1). Every worker starts pre-signed-in as the
// dedicated E2E user, so `_helpers.ts::seedSetup` and friends can navigate
// to `/setup` / `/game` without tripping the auth-gate middleware. Auth-
// flow specs (`auth.spec.ts`, `auth-gated-landing.spec.ts`) opt back out
// with `test.use({ storageState: { cookies: [], origins: [] } })`.
const STORAGE_STATE = path.resolve(
  __dirname,
  "tests/e2e/.auth/user.json",
);

export default defineConfig({
  testDir: "./tests/e2e",
  // Per-test timeout for every e2e spec. Bumped to 120s because the auth /
  // account suites make real round-trips to the hosted Supabase, which is
  // slower under GitHub Actions than locally (default is 30s).
  timeout: 120_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 5 : undefined,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: require.resolve("./tests/e2e/global-setup.ts"),
  globalTeardown: require.resolve("./tests/e2e/global-teardown.ts"),
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    storageState: STORAGE_STATE,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
