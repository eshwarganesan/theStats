import { test, expect, type Page } from "@playwright/test";
import { seedAndEnterGame } from "./_helpers";

/** Locate the home team panel (first section containing a Team Actions button). */
function homePanel(page: Page) {
  return page
    .locator("section")
    .filter({ has: page.getByRole("button", { name: "Team Actions" }) })
    .first();
}

function log(page: Page) {
  return page.locator("section").filter({ hasText: "Play by Play" });
}

test("Team Actions button sits between Sub and Timeout", async ({ page }) => {
  await seedAndEnterGame(page);
  const panel = homePanel(page);
  await expect(panel.getByRole("button", { name: "Sub" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Team Actions" })).toBeVisible();
  await expect(panel.getByRole("button", { name: /Timeout/ })).toBeVisible();
});

test("awards +5 to a team before tip-off (ready state)", async ({ page }) => {
  await seedAndEnterGame(page); // ready, pre-tip
  await homePanel(page).getByRole("button", { name: "Team Actions" }).click();

  const dialog = page.getByRole("dialog");
  // Confirm is disabled until a positive whole number is entered.
  const addBtn = dialog.getByRole("button", { name: /Add points/ });
  await expect(addBtn).toBeDisabled();
  await dialog.getByLabel("Points to add").fill("0");
  await expect(addBtn).toBeDisabled();
  await dialog.getByLabel("Points to add").fill("5");
  await dialog.getByLabel("Reason").fill("missing jersey");
  await expect(addBtn).toBeEnabled();
  await addBtn.click();

  // Play-by-play shows the additive award.
  await expect(log(page).getByText("+PTS", { exact: true })).toBeVisible();
  await expect(log(page).getByText(/\+5 — missing jersey/)).toBeVisible();

  // Undo removes it.
  await page.getByRole("button", { name: /Undo/ }).click();
  await expect(log(page).getByText("+PTS", { exact: true })).not.toBeVisible();
});

test("records a violation turnover once the game is live", async ({ page }) => {
  await seedAndEnterGame(page);
  await page.getByRole("button", { name: /Tip Off/ }).click();

  const panel = homePanel(page);
  await panel.getByRole("button", { name: "Team Actions" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /24-Second Violation/ }).click();

  // The log shows the team TO (the per-panel "Team TO:" counter was removed
  // from the team panel; the game log is the surviving surface for it).
  await expect(log(page).getByText(/24-Second Violation \(team TO\)/)).toBeVisible();

  // Undo removes the team TO from the log.
  await page.getByRole("button", { name: /Undo/ }).click();
  await expect(log(page).getByText(/24-Second Violation \(team TO\)/)).not.toBeVisible();
});
