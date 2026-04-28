import { test, expect } from "@playwright/test";
import { seedAndEnterGame } from "./_helpers";

/**
 * End-to-end coverage for spec 001-adjust-clock-time.
 *
 * The buzzer-recovery flow (clock at 0:00 → adjust up → "End Period" CTA
 * disappears) is exercised at the unit/store level rather than here, since
 * letting a real clock tick to 0 would require running the game for the full
 * default period (10 minutes).
 */

test("typed mm:ss edit while paused updates the clock and is logged (US1 + US3)", async ({
  page,
}) => {
  await seedAndEnterGame(page);
  await page.getByRole("button", { name: /Tip Off/ }).click();
  // The clock is paused right after Tip Off (we have not started it yet) —
  // status is "live" and clockRunning is false, which is exactly the state
  // ClockAdjuster gates on.

  const trigger = page.getByRole("button", { name: /adjust clock time/i });
  await expect(trigger).toBeVisible();

  await trigger.click();
  const editor = page.getByRole("textbox", { name: /minutes and seconds/i });
  await editor.fill("05:00");
  await editor.press("Enter");

  // The visible clock now reads 05:00.
  await expect(page.getByText("05:00").first()).toBeVisible();

  // Play-by-play log: the ADJ chip is unique to adjust events. Use exact
  // matching so the substring "adj" inside "Clock adjusted ..." doesn't
  // collide.
  await expect(page.getByText("ADJ", { exact: true })).toBeVisible();
  await expect(page.getByText(/Clock adjusted/)).toBeVisible();
});

test("rapid −1s taps coalesce into a single play-by-play entry (US2 + US3)", async ({
  page,
}) => {
  await seedAndEnterGame(page);
  await page.getByRole("button", { name: /Tip Off/ }).click();

  // Pre-start: clock is live + paused at the period max. −1s is enabled
  // because clockSeconds > 0; +1s would be disabled at the ceiling. Using
  // −1s avoids any dependency on rAF actually ticking in headless.
  const minus = page.getByRole("button", { name: /^−1s$/ });
  await expect(minus).toBeVisible();

  // Five rapid taps within the 1500 ms coalesce window.
  for (let i = 0; i < 5; i++) {
    await minus.click();
  }

  // Exactly one ADJ chip should appear in the log.
  await expect(page.getByText("ADJ", { exact: true })).toHaveCount(1);
});

test("the edit trigger is hidden when the clock is running (US1 gating)", async ({
  page,
}) => {
  await seedAndEnterGame(page);
  await page.getByRole("button", { name: /Tip Off/ }).click();

  // Pre-start: live + paused — trigger visible.
  await expect(
    page.getByRole("button", { name: /adjust clock time/i }),
  ).toBeVisible();

  await page.getByRole("button", { name: /^Start Clock$/ }).click();
  // Once running, the edit trigger and nudge buttons must be gone.
  await expect(
    page.getByRole("button", { name: /adjust clock time/i }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^\+1s$/ })).toHaveCount(0);
});
