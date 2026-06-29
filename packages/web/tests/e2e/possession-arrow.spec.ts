import { test, expect } from "@playwright/test";
import { seedAndEnterGame } from "./_helpers";

test.describe("Possession arrow — US1 tap-to-select (feature 007)", () => {
  test("default 5v5 game renders both arrow buttons in the unset state and selects on click", async ({
    page,
  }) => {
    await seedAndEnterGame(page);

    const homeArrow = page.getByRole("button", { name: /^Possession arrow: home$/ });
    const awayArrow = page.getByRole("button", { name: /^Possession arrow: away$/ });

    await expect(homeArrow).toBeVisible();
    await expect(awayArrow).toBeVisible();
    await expect(homeArrow).toHaveAttribute("aria-pressed", "false");
    await expect(awayArrow).toHaveAttribute("aria-pressed", "false");

    await homeArrow.click();
    await expect(homeArrow).toHaveAttribute("aria-pressed", "true");
    await expect(awayArrow).toHaveAttribute("aria-pressed", "false");

    await awayArrow.click();
    await expect(homeArrow).toHaveAttribute("aria-pressed", "false");
    await expect(awayArrow).toHaveAttribute("aria-pressed", "true");

    await homeArrow.click();
    await expect(homeArrow).toHaveAttribute("aria-pressed", "true");
    await expect(awayArrow).toHaveAttribute("aria-pressed", "false");
  });

  test("clicking the already-selected arrow is a no-op (FR-006)", async ({ page }) => {
    await seedAndEnterGame(page);

    const homeArrow = page.getByRole("button", { name: /^Possession arrow: home$/ });
    const awayArrow = page.getByRole("button", { name: /^Possession arrow: away$/ });

    await homeArrow.click();
    await expect(homeArrow).toHaveAttribute("aria-pressed", "true");

    // Click the already-selected arrow several times — state must not change.
    await homeArrow.click();
    await homeArrow.click();
    await homeArrow.click();
    await expect(homeArrow).toHaveAttribute("aria-pressed", "true");
    await expect(awayArrow).toHaveAttribute("aria-pressed", "false");
  });

  test("selecting does not affect the scoreboard, clock, or play-by-play row count", async ({
    page,
  }) => {
    await seedAndEnterGame(page);

    const homeArrow = page.getByRole("button", { name: /^Possession arrow: home$/ });
    const awayArrow = page.getByRole("button", { name: /^Possession arrow: away$/ });

    const playByPlay = page.locator("section").filter({ hasText: "Play by Play" });
    const initialLogRows = await playByPlay.locator("li, [data-event-row]").count();

    await homeArrow.click();
    await awayArrow.click();
    await homeArrow.click();

    await expect(page.getByText("0", { exact: true }).first()).toBeVisible();

    const finalLogRows = await playByPlay.locator("li, [data-event-row]").count();
    expect(finalLogRows).toBe(initialLogRows);
  });
});

test.describe("Possession arrow — US2 toggle gates display (feature 007)", () => {
  test("default 3v3 game does NOT render the possession arrow buttons", async ({
    page,
  }) => {
    await seedAndEnterGame(page, { format: "3v3" });

    await expect(
      page.getByRole("button", { name: /^Possession arrow:/ }),
    ).toHaveCount(0);
  });

  test("flipping the toggle Off in 5v5 setup hides the indicator on the live screen", async ({
    page,
  }) => {
    await page.goto("/setup");
    await page.getByRole("button", { name: "5v5" }).click();

    // Flip Possession arrow toggle to Off.
    await page
      .getByRole("button", { name: "Possession arrow Off" })
      .click();

    for (let i = 1; i <= 5; i++) {
      const numFields = page.getByPlaceholder("#");
      const nameFields = page.getByPlaceholder("Player name");
      const addBtns = page.getByRole("button", { name: "Add" });
      await numFields.first().fill(String(i));
      await nameFields.first().fill(`Home ${i}`);
      await addBtns.first().click();
    }
    for (let i = 11; i <= 15; i++) {
      const numFields = page.getByPlaceholder("#");
      const nameFields = page.getByPlaceholder("Player name");
      const addBtns = page.getByRole("button", { name: "Add" });
      await numFields.nth(1).fill(String(i));
      await nameFields.nth(1).fill(`Away ${i - 10}`);
      await addBtns.nth(1).click();
    }

    await page.getByRole("button", { name: /Continue to Game/ }).first().click();
    await page.waitForURL("**/game");

    await expect(
      page.getByRole("button", { name: /^Possession arrow:/ }),
    ).toHaveCount(0);
  });
});

test.describe("Possession arrow — US3 persistence across refresh (feature 007)", () => {
  test("refresh restores the selected arrow", async ({ page }) => {
    await seedAndEnterGame(page);

    const awayArrow = page.getByRole("button", { name: /^Possession arrow: away$/ });
    await awayArrow.click();
    await expect(awayArrow).toHaveAttribute("aria-pressed", "true");

    await page.reload();

    const restoredAway = page.getByRole("button", {
      name: /^Possession arrow: away$/,
    });
    await expect(restoredAway).toBeVisible();
    await expect(restoredAway).toHaveAttribute("aria-pressed", "true");
  });
});
