import { test, expect } from "@playwright/test";
import { seedAndEnterGame } from "./_helpers";

test("ends a period via the secondary End Period button and starts the next", async ({ page }) => {
  await seedAndEnterGame(page);
  await page.getByRole("button", { name: /Tip Off/ }).click();

  // Use the secondary End Period (in the grid) — the primary CTA only flips
  // to End Period when the buzzer hits 0. The secondary one is enabled while live.
  const endPeriodSecondary = page
    .getByRole("button", { name: /End Period/ })
    .last();
  await endPeriodSecondary.click();

  // Status: period-break — the centre CTA flips to "Start Next Period"
  await expect(page.getByRole("button", { name: /Start Next Period/ })).toBeVisible();
  await page.getByRole("button", { name: /Start Next Period/ }).click();

  // Period label updates to 2nd in the Scoreboard centre column
  await expect(page.getByText("2nd").first()).toBeVisible();
});

test("finishes the game after the last regulation period", async ({ page }) => {
  await seedAndEnterGame(page);
  await page.getByRole("button", { name: /Tip Off/ }).click();

  // End all 4 quarters
  for (let p = 1; p <= 4; p++) {
    await page.getByRole("button", { name: /End Period/ }).last().click();
    if (p < 4) {
      await page.getByRole("button", { name: /Start Next Period/ }).click();
    }
  }

  // The Final plate appears in the centre column
  await expect(page.locator("section").filter({ hasText: "Final" }).first()).toBeVisible();
});
