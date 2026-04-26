import type { Page } from "@playwright/test";

interface PlayerSeed {
  number: string;
  name: string;
}

interface SeedOptions {
  format?: "5v5" | "3v3";
  home?: PlayerSeed[];
  away?: PlayerSeed[];
  homeName?: string;
  awayName?: string;
}

/* Default rosters — 5 players each, sequential jersey numbers. */
export const DEFAULT_HOME: PlayerSeed[] = [
  { number: "1", name: "Home One" },
  { number: "2", name: "Home Two" },
  { number: "3", name: "Home Three" },
  { number: "4", name: "Home Four" },
  { number: "5", name: "Home Five" },
];

export const DEFAULT_AWAY: PlayerSeed[] = [
  { number: "11", name: "Away One" },
  { number: "12", name: "Away Two" },
  { number: "13", name: "Away Three" },
  { number: "14", name: "Away Four" },
  { number: "15", name: "Away Five" },
];

const THREE_HOME: PlayerSeed[] = DEFAULT_HOME.slice(0, 3);
const THREE_AWAY: PlayerSeed[] = DEFAULT_AWAY.slice(0, 3);

/**
 * Fills the setup form and (optionally) navigates to /game.
 * Leaves the test on /setup if `goToGame` is false.
 */
export async function seedSetup(page: Page, options: SeedOptions = {}) {
  const format = options.format ?? "5v5";
  const home =
    options.home ?? (format === "5v5" ? DEFAULT_HOME : THREE_HOME);
  const away =
    options.away ?? (format === "5v5" ? DEFAULT_AWAY : THREE_AWAY);

  await page.goto("/setup");

  // Format toggle
  await page.getByRole("button", { name: format }).click();

  if (options.homeName) {
    await page
      .getByLabel("Team name")
      .first()
      .fill(options.homeName);
  }
  if (options.awayName) {
    await page
      .getByLabel("Team name")
      .nth(1)
      .fill(options.awayName);
  }

  // Add home players via the home card's Add button (first one in the DOM)
  for (const p of home) {
    const numFields = page.getByPlaceholder("#");
    const nameFields = page.getByPlaceholder("Player name");
    const addBtns = page.getByRole("button", { name: "Add" });
    await numFields.first().fill(p.number);
    await nameFields.first().fill(p.name);
    await addBtns.first().click();
  }

  // Then away players via the second card
  for (const p of away) {
    const numFields = page.getByPlaceholder("#");
    const nameFields = page.getByPlaceholder("Player name");
    const addBtns = page.getByRole("button", { name: "Add" });
    await numFields.nth(1).fill(p.number);
    await nameFields.nth(1).fill(p.name);
    await addBtns.nth(1).click();
  }
}

/**
 * Fast-path: seed the setup, click Continue, wait for the game console.
 */
export async function seedAndEnterGame(page: Page, options: SeedOptions = {}) {
  await seedSetup(page, options);
  await page
    .getByRole("button", { name: /Continue to Game/ })
    .first()
    .click();
  await page.waitForURL("**/game");
}

/** Click the home/away team panel tile for a given jersey number. */
export async function tapPlayerByNumber(
  page: Page,
  side: "home" | "away",
  number: string,
) {
  // The team panels are in column 0 (home) and column 2 (away). We scope
  // by the section containing the team name to disambiguate.
  const panel = side === "home"
    ? page.locator("section").filter({ hasText: "Home" }).first()
    : page.locator("section").filter({ hasText: "Away" }).first();
  await panel.locator("button").filter({ hasText: new RegExp(`^${number}`) }).first().click();
}
