import { test, expect } from "@playwright/test";
import { seedAndEnterGame, DEFAULT_HOME, DEFAULT_AWAY } from "./_helpers";

test("substitutes a starter for a bench player and reflects on the panel", async ({ page }) => {
  await seedAndEnterGame(page, {
    home: [...DEFAULT_HOME, { number: "99", name: "Bench One" }],
    away: DEFAULT_AWAY,
  });
  await page.getByRole("button", { name: /Tip Off/ }).click();

  // Open the home Sub modal
  const homePanel = page
    .locator("section")
    .filter({ has: page.getByRole("button", { name: "Sub" }) })
    .first();
  await homePanel.getByRole("button", { name: "Sub" }).click();

  // Scope to the dialog so we don't collide with the same-named tile on the panel.
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Home One/ }).click();
  await dialog.getByRole("button", { name: /Bench One/ }).click();
  await dialog.getByRole("button", { name: /Confirm Swap/ }).click();

  // Bench One now visible on the home panel; Home One gone
  await expect(homePanel.getByText("99")).toBeVisible();
  await expect(homePanel.getByText("1", { exact: true })).not.toBeVisible();

  // Log shows SUB
  const log = page.locator("section").filter({ hasText: "Play by Play" });
  await expect(log.getByText("SUB", { exact: true })).toBeVisible();

  // Undo restores the original on-court roster
  await page.getByRole("button", { name: /Undo/ }).click();
  await expect(homePanel.getByText("99")).not.toBeVisible();
});
