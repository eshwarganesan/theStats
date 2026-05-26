import { test, expect } from "@playwright/test";
import { seedAndEnterGame, tapPlayerByNumber } from "./_helpers";

/**
 * Feature 004 — edit and delete play-by-play events.
 *
 * Each describe block exercises one independently-testable user story
 * from the spec. They share the same setup helper but stand alone.
 */

test.describe("Feature 004 — US1: correct a mis-attributed play", () => {
  test("scorekeeper changes a recorded score's side and player; scoreboard and log update", async ({
    page,
  }) => {
    await seedAndEnterGame(page);
    await page.getByRole("button", { name: /Tip Off/ }).click();

    // Home #1 → +2 made
    await tapPlayerByNumber(page, "home", "1");
    await page.getByRole("button", { name: /^\+2 Made/ }).click();
    await expect(page.getByRole("button", { name: /^\+2 Made/ })).not.toBeVisible();

    // Sanity: the play-by-play log contains the home score
    const log = page.locator("section").filter({ hasText: "Play by Play" });
    await expect(log.getByText(/Home One.*scored 2/)).toBeVisible();

    // Open the row's Edit modal
    await log.getByRole("button", { name: /Edit play/ }).first().click();

    // The edit modal is visible
    await expect(page.getByRole("button", { name: /^Save$/ })).toBeVisible();

    // Change side to away
    await page.getByLabel("Side").selectOption("away");

    // Pick Away #11 (jersey 11, "Away One")
    const awayPlayer = page.getByLabel("Player");
    const awayPlayerOptions = await awayPlayer.locator("option").allTextContents();
    const awayOneOption = awayPlayerOptions.find((t) => /Away One/.test(t));
    expect(awayOneOption).toBeTruthy();
    await awayPlayer.selectOption({ label: awayOneOption! });

    // Save
    await page.getByRole("button", { name: /^Save$/ }).click();

    // Modal closed
    await expect(page.getByRole("button", { name: /^Save$/ })).not.toBeVisible();

    // The log row now describes the away player as the scorer
    await expect(log.getByText(/Away One.*scored 2/)).toBeVisible();
    await expect(log.getByText(/Home One.*scored 2/)).not.toBeVisible();
  });
});

test.describe("Feature 004 — US2: delete an accidental play", () => {
  test("delete removes only the targeted event; later events stay intact", async ({
    page,
  }) => {
    await seedAndEnterGame(page);
    await page.getByRole("button", { name: /Tip Off/ }).click();

    // Record three events in order: stat (offensive rebound), foul (personal), score (3pt)
    await tapPlayerByNumber(page, "home", "1");
    await page.getByRole("button", { name: /Off\. Rebound/ }).click();
    await expect(page.getByRole("button", { name: /Off\. Rebound/ })).not.toBeVisible();

    await tapPlayerByNumber(page, "away", "11");
    await page.getByRole("button", { name: /^Personal$/ }).click();
    await expect(page.getByRole("button", { name: /^Personal$/ })).not.toBeVisible();

    await tapPlayerByNumber(page, "home", "2");
    await page.getByRole("button", { name: /^\+3 Made/ }).click();
    await expect(page.getByRole("button", { name: /^\+3 Made/ })).not.toBeVisible();

    const log = page.locator("section").filter({ hasText: "Play by Play" });
    // All three events present
    await expect(log.getByText(/Off\. Reb/)).toBeVisible();
    await expect(log.getByText(/Personal foul/)).toBeVisible();
    await expect(log.getByText(/scored 3/)).toBeVisible();

    // Click the Delete button on the rebound row (it's the OLDEST row, i.e.
    // the last Delete button in DOM order since the log is newest-first).
    const deleteButtons = log.getByRole("button", { name: /Delete play/ });
    await deleteButtons.last().click();

    // Confirm modal renders with the play summary
    await expect(page.getByText(/Delete play\?/)).toBeVisible();
    await expect(page.getByText(/Off\. Reb/).last()).toBeVisible();

    // Confirm
    await page.getByRole("button", { name: /^Delete$/ }).click();
    await expect(page.getByText(/Delete play\?/)).not.toBeVisible();

    // Rebound is gone; foul and score remain
    await expect(log.getByText(/Off\. Reb/)).not.toBeVisible();
    await expect(log.getByText(/Personal foul/)).toBeVisible();
    await expect(log.getByText(/scored 3/)).toBeVisible();
  });

  test("Cancel on delete confirm leaves the event intact", async ({ page }) => {
    await seedAndEnterGame(page);
    await page.getByRole("button", { name: /Tip Off/ }).click();

    await tapPlayerByNumber(page, "home", "1");
    await page.getByRole("button", { name: /Off\. Rebound/ }).click();
    await expect(page.getByRole("button", { name: /Off\. Rebound/ })).not.toBeVisible();

    const log = page.locator("section").filter({ hasText: "Play by Play" });
    await expect(log.getByText(/Off\. Reb/)).toBeVisible();

    await log.getByRole("button", { name: /Delete play/ }).first().click();
    await expect(page.getByText(/Delete play\?/)).toBeVisible();

    await page.getByRole("button", { name: /Cancel/ }).click();
    await expect(page.getByText(/Delete play\?/)).not.toBeVisible();

    // Still in the log
    await expect(log.getByText(/Off\. Reb/)).toBeVisible();
  });
});

test.describe("Feature 004 — US3: correct the game-clock time of a past play", () => {
  test("scorekeeper edits clockAt to a different valid time and the row updates", async ({
    page,
  }) => {
    await seedAndEnterGame(page);
    await page.getByRole("button", { name: /Tip Off/ }).click();

    // Record a foul (clock has not moved, so clockAt is the full period
    // length — for default 5v5 settings, 10:00).
    await tapPlayerByNumber(page, "home", "1");
    await page.getByRole("button", { name: /^Personal$/ }).click();
    await expect(page.getByRole("button", { name: /^Personal$/ })).not.toBeVisible();

    const log = page.locator("section").filter({ hasText: "Play by Play" });
    await expect(log.getByText(/Personal foul/)).toBeVisible();

    // Open the edit modal on the foul row
    await log.getByRole("button", { name: /Edit play/ }).first().click();
    await expect(page.getByRole("button", { name: /^Save$/ })).toBeVisible();

    // Change clockAt from "10:00" to "04:23" — scope to the modal dialog
    // so we don't collide with the live ClockEditor's "Adjust clock time"
    // button on the main screen.
    const modal = page.getByRole("dialog");
    const clockInput = modal.getByLabel("Clock time");
    await clockInput.fill("04:23");
    await page.getByRole("button", { name: /^Save$/ }).click();
    await expect(page.getByRole("button", { name: /^Save$/ })).not.toBeVisible();

    // The log row now shows the new clock value
    await expect(log.getByText("04:23")).toBeVisible();
  });

  test("clockAt entry outside the period range blocks Save with an inline error", async ({
    page,
  }) => {
    await seedAndEnterGame(page);
    await page.getByRole("button", { name: /Tip Off/ }).click();

    await tapPlayerByNumber(page, "home", "1");
    await page.getByRole("button", { name: /^Personal$/ }).click();
    await expect(page.getByRole("button", { name: /^Personal$/ })).not.toBeVisible();

    const log = page.locator("section").filter({ hasText: "Play by Play" });
    await log.getByRole("button", { name: /Edit play/ }).first().click();

    // 25:00 exceeds the 10-minute default period length
    const modal = page.getByRole("dialog");
    const clockInput = modal.getByLabel("Clock time");
    await clockInput.fill("25:00");

    // Save should be disabled and an error should appear
    await expect(page.getByRole("button", { name: /^Save$/ })).toBeDisabled();
    await expect(page.getByText(/out of range/i)).toBeVisible();

    // Cancel discards the change — the log clock is unchanged
    await page.getByRole("button", { name: /Cancel/ }).click();
    await expect(log.getByText("25:00")).not.toBeVisible();
  });
});
