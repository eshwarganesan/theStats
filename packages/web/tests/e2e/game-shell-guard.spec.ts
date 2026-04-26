import { test, expect } from "@playwright/test";

test("/game without a configured game shows a setup prompt", async ({ page }) => {
  await page.goto("/game");
  await expect(page.getByRole("heading", { name: /No active game/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Go to Setup/ })).toBeVisible();
});

test("the prompt link navigates to /setup", async ({ page }) => {
  await page.goto("/game");
  await page.getByRole("link", { name: /Go to Setup/ }).click();
  await expect(page).toHaveURL(/\/setup$/);
});
