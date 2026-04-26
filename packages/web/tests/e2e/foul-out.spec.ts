import { test, expect } from "@playwright/test";
import { seedAndEnterGame, tapPlayerByNumber } from "./_helpers";

test("a 5v5 player fouls out at 5 personal fouls and is struck through on /game/stats", async ({ page }) => {
  await seedAndEnterGame(page);
  await page.getByRole("button", { name: /Tip Off/ }).click();

  // Assign 5 personal fouls to home #1
  for (let i = 0; i < 5; i++) {
    await tapPlayerByNumber(page, "home", "1");
    await page.getByRole("button", { name: "Personal" }).click();
  }

  // Navigate to stats
  await page.getByRole("link", { name: "Stats" }).click();
  await expect(page).toHaveURL(/\/game\/stats$/);

  // Player row should have line-through (fouledOut)
  const row = page.getByRole("row").filter({ has: page.getByText("Home One") });
  await expect(row).toHaveClass(/line-through/);
});
