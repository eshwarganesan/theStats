import { test, expect } from "@playwright/test";
import { seedAndEnterGame, tapPlayerByNumber } from "./_helpers";

test("ends a period via the secondary End Period button and starts the next", async ({ page }) => {
  await seedAndEnterGame(page);
  await page.getByRole("button", { name: /Tip Off/ }).click();

  // Use the secondary End Period (in the grid) — the primary CTA only flips
  // to End Period when the buzzer hits 0. The secondary one is enabled while live.
  const endPeriodSecondary = page
    .getByRole("button", { name: /End Period/ })
    .last();
  await endPeriodSecondary.click();

  // Status: period-break — the centre CTA shows the period-appropriate label.
  // From P1 → P2 in a 4-period game this is "Start Next Quarter".
  await expect(page.getByRole("button", { name: /Start Next Quarter/ })).toBeVisible();
  await page.getByRole("button", { name: /Start Next Quarter/ }).click();

  // Period label updates to 2nd in the Scoreboard centre column
  await expect(page.getByText("2nd").first()).toBeVisible();
});

test("finishes the game after the last regulation period", async ({ page }) => {
  await seedAndEnterGame(page);
  await page.getByRole("button", { name: /Tip Off/ }).click();

  // Break the tie so ending Q4 finalizes the game instead of triggering the
  // overtime-on-tie path (feature 003).
  await tapPlayerByNumber(page, "home", "1");
  await page.getByRole("button", { name: /^\+2 Made/ }).click();
  await expect(page.getByRole("button", { name: /^\+2 Made/ })).not.toBeVisible();

  // End all 4 quarters. The "advance to next period" button label varies by
  // boundary: Next Quarter between non-half quarters, Second Half after Q2.
  const advanceLabels = [
    /Start Next Quarter/, // after Q1 → Q2
    /Start Second Half/, // after Q2 → Q3 (halftime boundary)
    /Start Next Quarter/, // after Q3 → Q4
  ];
  for (let p = 1; p <= 4; p++) {
    await page.getByRole("button", { name: /End Period/ }).last().click();
    if (p < 4) {
      await page.getByRole("button", { name: advanceLabels[p - 1]! }).click();
    }
  }

  // The Final plate appears in the centre column
  await expect(page.locator("section").filter({ hasText: "Final" }).first()).toBeVisible();
});
