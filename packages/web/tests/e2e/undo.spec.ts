import { test, expect } from "@playwright/test";
import { seedAndEnterGame, tapPlayerByNumber } from "./_helpers";

test("undo rewinds the most recent two events", async ({ page }) => {
  await seedAndEnterGame(page);
  await page.getByRole("button", { name: /Tip Off/ }).click();

  // Score +2 then call a personal foul
  await tapPlayerByNumber(page, "home", "1");
  await page.getByRole("button", { name: /^\+2 Made/ }).click();

  await tapPlayerByNumber(page, "home", "1");
  await page.getByRole("button", { name: "Personal" }).click();

  const log = page.locator("section").filter({ hasText: "Play by Play" });
  // Use exact match to disambiguate the chip from the body text "Personal foul"
  await expect(log.getByText("2PT", { exact: true })).toBeVisible();
  await expect(log.getByText("FOUL", { exact: true })).toBeVisible();

  // Undo the foul, then the score
  await page.getByRole("button", { name: /Undo/ }).click();
  await expect(log.getByText("FOUL", { exact: true })).not.toBeVisible();
  await expect(log.getByText("2PT", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Undo/ }).click();
  await expect(log.getByText("2PT", { exact: true })).not.toBeVisible();

  // The only remaining event is the period start
  await expect(log.getByText("TIP")).toBeVisible();
});

test("undo is disabled when there are no user actions to undo", async ({ page }) => {
  await seedAndEnterGame(page);
  // Before tip-off, no events
  await expect(page.getByRole("button", { name: /Undo/ })).toBeDisabled();
});
