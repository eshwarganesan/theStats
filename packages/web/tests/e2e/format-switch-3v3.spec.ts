import { test, expect } from "@playwright/test";
import { seedAndEnterGame, tapPlayerByNumber } from "./_helpers";

test("3v3: foul-out at 3 personal fouls and single-period structure", async ({ page }) => {
  await seedAndEnterGame(page, {
    format: "3v3",
    home: [
      { number: "1", name: "Home One" },
      { number: "2", name: "Home Two" },
      { number: "3", name: "Home Three" },
    ],
    away: [
      { number: "11", name: "Away One" },
      { number: "12", name: "Away Two" },
      { number: "13", name: "Away Three" },
    ],
  });
  await page.getByRole("button", { name: /Tip Off/ }).click();

  // 3 personal fouls on home #1 should foul them out
  for (let i = 0; i < 3; i++) {
    await tapPlayerByNumber(page, "home", "1");
    await page.getByRole("button", { name: "Personal" }).click();
  }

  await page.getByRole("link", { name: "Stats" }).click();
  const row = page.getByRole("row").filter({ has: page.getByText("Home One") });
  await expect(row).toHaveClass(/line-through/);
});
