import { test, expect } from "@playwright/test";
import { seedSetup, DEFAULT_HOME, DEFAULT_AWAY } from "./_helpers";

test.describe("Setup", () => {
  test("signed-in navigation to /setup renders the Game Setup screen", async ({ page }) => {
    // Under feature 011 the app is auth-gated; the shared authenticated
    // storage state from global-setup applies here. Direct navigation
    // reaches setup because the shared user is signed in. (The pre-011
    // "landing → New Game button → /setup" flow is gone: the landing
    // is now a signed-out marketing surface whose CTAs go to /login.)
    await page.goto("/setup");
    await expect(page).toHaveURL(/\/setup$/);
    await expect(page.getByRole("heading", { name: "Game Setup" })).toBeVisible();
  });

  test("format toggle 5v5 ↔ 3v3 updates the starter target", async ({ page }) => {
    await page.goto("/setup");
    // 5v5 by default → 0/5
    await expect(page.getByText("0/5").first()).toBeVisible();
    await page.getByRole("button", { name: "3v3" }).click();
    await expect(page.getByText("0/3").first()).toBeVisible();
    // Period count input reflects 3v3 default of 1
    await expect(page.getByLabel("Periods")).toHaveValue("1");
  });

  test("Continue with insufficient roster shows an error", async ({ page }) => {
    await page.goto("/setup");
    await page.getByRole("button", { name: /Continue to Game/ }).first().click();
    // Use the visible alert text, not Next's route-announcer alert.
    const alert = page.getByText(/at least 5 players/);
    await expect(alert).toBeVisible();
    await expect(page).toHaveURL(/\/setup$/);
  });

  test("happy path: seed both teams and enter the game console", async ({ page }) => {
    await seedSetup(page, {
      home: DEFAULT_HOME,
      away: DEFAULT_AWAY,
      homeName: "Home",
      awayName: "Away",
    });
    await page.getByRole("button", { name: /Continue to Game/ }).first().click();
    await expect(page).toHaveURL(/\/game$/);
    await expect(page.getByRole("button", { name: /Tip Off/ })).toBeVisible();
  });
});
