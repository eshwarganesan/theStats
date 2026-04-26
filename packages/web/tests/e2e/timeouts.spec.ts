import { test, expect } from "@playwright/test";
import { seedAndEnterGame } from "./_helpers";

test("calling timeouts decrements the count and disables the button at zero", async ({ page }) => {
  await seedAndEnterGame(page);
  await page.getByRole("button", { name: /Tip Off/ }).click();

  // Find the home team panel by the Sub/Timeout footer
  const homePanel = page
    .locator("section")
    .filter({ has: page.getByRole("button", { name: "Sub" }) })
    .first();
  const timeoutBtn = homePanel.getByRole("button", { name: /Timeout \(\d+\)/ });

  // 5 timeouts in 5v5 by default → spend each one
  await expect(timeoutBtn).toContainText("(5)");
  for (let i = 4; i >= 0; i--) {
    await timeoutBtn.click();
    await expect(timeoutBtn).toContainText(`(${i})`);
  }
  await expect(timeoutBtn).toBeDisabled();
});
