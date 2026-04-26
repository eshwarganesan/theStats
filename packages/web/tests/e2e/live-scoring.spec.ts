import { test, expect } from "@playwright/test";
import { seedAndEnterGame, tapPlayerByNumber } from "./_helpers";

test.describe("Live scoring", () => {
  test("scoring +2 home and +3 away updates the scoreboard and play-by-play", async ({ page }) => {
    await seedAndEnterGame(page);

    // Tip off
    await page.getByRole("button", { name: /Tip Off/ }).click();

    // Home #1 → +2 made
    await tapPlayerByNumber(page, "home", "1");
    await page.getByRole("button", { name: /^\+2 Made/ }).click();
    // Wait for the modal to close
    await expect(page.getByRole("button", { name: /^\+2 Made/ })).not.toBeVisible();

    // Away #11 → +3 made
    await tapPlayerByNumber(page, "away", "11");
    await page.getByRole("button", { name: /^\+3 Made/ }).click();
    await expect(page.getByRole("button", { name: /^\+3 Made/ })).not.toBeVisible();

    // Scoreboard reads 2-3 (look for those big numerals)
    await expect(page.getByText("2", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("3", { exact: true }).first()).toBeVisible();

    // Play-by-Play log entries (newest first)
    const log = page.locator("section").filter({ hasText: "Play by Play" });
    await expect(log.getByText(/scored 3/)).toBeVisible();
    await expect(log.getByText(/scored 2/)).toBeVisible();
    await expect(log.getByText("3PT", { exact: true })).toBeVisible();
    await expect(log.getByText("2PT", { exact: true })).toBeVisible();
  });

  test("missed shot logs a MISS tag without changing the score", async ({ page }) => {
    await seedAndEnterGame(page);
    await page.getByRole("button", { name: /Tip Off/ }).click();

    await tapPlayerByNumber(page, "home", "1");
    await page.getByRole("button", { name: /^2 Missed/ }).click();

    const log = page.locator("section").filter({ hasText: "Play by Play" });
    await expect(log.getByText("MISS", { exact: true })).toBeVisible();
    await expect(log.getByText(/missed 2/)).toBeVisible();
  });
});
