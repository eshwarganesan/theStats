/**
 * Playwright E2E — sidebar / Games nav item under the hamburger-toggle
 * redesign.
 *
 * The old rail-vs-overlay assertions are gone (there is no rail anymore).
 * These tests now exercise the hamburger flow that lives inside every
 * `(authenticated)/` route: fixed top-left button opens the drawer, the
 * "Games" link inside routes to `/games`, and the drawer closes after
 * navigation.
 *
 * Signed-out visitors see the public landing at `/` (feature 011); the
 * landing has NO sidebar and NO hamburger. So all cases in this file
 * run through an authenticated session obtained by the shared
 * `global-setup.ts` storage state, EXCEPT the deep-link-to-/games
 * redirect check, which explicitly resets storage to observe the
 * signed-out path.
 */
import { test, expect } from "@playwright/test";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.skip(
  !url || !serviceRole,
  "Hosted Supabase env vars missing — skipping games sidebar E2E flow",
);

test.describe("Hamburger drawer + Games nav item (signed-in)", () => {
  test("the hamburger button is visible in the top-left of an authenticated page", async ({
    page,
  }) => {
    await page.goto("/games");
    const hamburger = page.getByRole("button", { name: /open navigation menu/i });
    await expect(hamburger).toBeVisible();
  });

  test("the drawer starts closed; clicking the hamburger opens it and reveals the Games link", async ({
    page,
  }) => {
    await page.goto("/games");
    // Closed drawer — aria-hidden hides its contents from AT; assert
    // the state on the underlying attribute.
    const nav = page.locator('nav[aria-label="Primary"]');
    await expect(nav).toHaveAttribute("data-open", "false");

    await page.getByRole("button", { name: /open navigation menu/i }).click();
    await expect(nav).toHaveAttribute("data-open", "true");

    const gamesLink = page.getByRole("link", { name: "Games" });
    await expect(gamesLink).toBeVisible();
    await expect(gamesLink).toHaveAttribute("href", "/games");
  });

  test("clicking Games inside the drawer navigates to /games and closes the drawer", async ({
    page,
  }) => {
    await page.goto("/account");
    await page.getByRole("button", { name: /open navigation menu/i }).click();
    await page.getByRole("link", { name: "Games" }).click();
    await page.waitForURL("/games");
    // Drawer dismisses after navigation.
    const nav = page.locator('nav[aria-label="Primary"]');
    await expect(nav).toHaveAttribute("data-open", "false");
  });

  test("the Games item is marked active while on /games (aria-current + data-active)", async ({
    page,
  }) => {
    await page.goto("/games");
    await page.getByRole("button", { name: /open navigation menu/i }).click();
    const gamesLink = page.getByRole("link", { name: "Games" });
    await expect(gamesLink).toHaveAttribute("data-active", "true");
    await expect(gamesLink).toHaveAttribute("aria-current", "page");
  });

  test("clicking the backdrop closes the drawer", async ({ page }) => {
    await page.goto("/games");
    await page.getByRole("button", { name: /open navigation menu/i }).click();
    const nav = page.locator('nav[aria-label="Primary"]');
    await expect(nav).toHaveAttribute("data-open", "true");
    await page.getByTestId("sidebar-backdrop").click();
    await expect(nav).toHaveAttribute("data-open", "false");
  });

  test("Escape closes the drawer", async ({ page }) => {
    await page.goto("/games");
    await page.getByRole("button", { name: /open navigation menu/i }).click();
    const nav = page.locator('nav[aria-label="Primary"]');
    await expect(nav).toHaveAttribute("data-open", "true");
    await page.keyboard.press("Escape");
    await expect(nav).toHaveAttribute("data-open", "false");
  });
});

test.describe("Signed-out deep link routes through /login?from=%2Fgames", () => {
  // Reset the shared authenticated storage state for this block so we
  // observe the unauthenticated redirect.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("navigating directly to /games while signed out bounces to /login with the `from` param", async ({
    page,
  }) => {
    await page.goto("/games");
    await page.waitForURL(/\/login\?from=%2Fgames/);
    // The public landing / login pages must NOT render the sidebar or
    // the hamburger — those live only inside `(authenticated)/`.
    await expect(
      page.getByRole("button", { name: /open navigation menu/i }),
    ).toHaveCount(0);
    await expect(page.locator('nav[aria-label="Primary"]')).toHaveCount(0);
  });
});
