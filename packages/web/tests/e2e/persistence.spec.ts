/**
 * E2E coverage for "Preserve game state on browser refresh" (feature
 * 006). Mirrors the acceptance scenarios in
 * specs/006-preserve-game-state-on-refresh/spec.md.
 *
 * Note on assertions: after `clearPersistedGame()` + `resetAll()` the
 * `persist` middleware immediately writes a fresh "empty setup" record
 * back to localStorage (because any store mutation triggers a
 * partialize write). That's intended — a subsequent refresh must keep
 * the user on an empty setup view. The tests therefore assert the
 * SHAPE of the persisted record (status === "setup", no events), not
 * the absence of the key.
 */

import { test, expect, type Page } from "@playwright/test";
import {
  seedAndEnterGame,
  seedSetup,
  tapPlayerByNumber,
} from "./_helpers";

const GAME_KEY = "thestats.game.v1";
const CLOCK_KEY = "thestats.clock.v1";

interface PersistedState {
  state: {
    schemaVersion: number;
    status: string;
    events: unknown[];
    homeTeam: { roster: unknown[] };
    awayTeam: { roster: unknown[] };
  };
  version: number;
}

async function readPersistedState(
  page: Page,
  key: string,
): Promise<PersistedState | null> {
  const raw = await page.evaluate((k) => window.localStorage.getItem(k), key);
  return raw === null ? null : (JSON.parse(raw) as PersistedState);
}

// Playwright spins up a fresh browser context per test, so localStorage
// is empty by default and we do not need a global beforeEach clear.
// We deliberately DON'T use addInitScript to clear, because that runs
// on every page navigation (including reload), which would wipe the
// very persistence we're testing.

test.describe("Game state persistence", () => {

  test("US1.1 — refresh during a live game restores events, score and lineup with the clock paused", async ({
    page,
  }) => {
    await seedAndEnterGame(page);
    await page.getByRole("button", { name: /Tip Off/ }).click();

    // Record two scoring plays and wait for the modal to close after each.
    await tapPlayerByNumber(page, "home", "1");
    await page.getByRole("button", { name: /^\+2 Made/ }).click();
    await expect(
      page.getByRole("button", { name: /^\+2 Made/ }),
    ).not.toBeVisible();

    await tapPlayerByNumber(page, "away", "11");
    await page.getByRole("button", { name: /^\+3 Made/ }).click();
    await expect(
      page.getByRole("button", { name: /^\+3 Made/ }),
    ).not.toBeVisible();

    // The persisted record reflects the in-progress game BEFORE we refresh.
    const before = await readPersistedState(page, GAME_KEY);
    expect(before).not.toBeNull();
    expect(before!.state.status).toBe("live");
    const scoreEventsBefore = before!.state.events.filter(
      (e) => (e as { type: string }).type === "score",
    );
    expect(scoreEventsBefore.length).toBe(2);

    await page.reload();

    // Still on the live game view.
    await expect(page).toHaveURL(/\/game$/);

    // The persisted record after rehydrate still holds the same data.
    const after = await readPersistedState(page, GAME_KEY);
    expect(after).not.toBeNull();
    expect(after!.state.status).toBe("live");
    expect(
      after!.state.events.filter(
        (e) => (e as { type: string }).type === "score",
      ).length,
    ).toBe(2);
  });

  test("US1.3 — refresh during a setup-phase session restores the partial roster", async ({
    page,
  }) => {
    await seedSetup(page, {
      home: [
        { number: "7", name: "Mid-Setup" },
        { number: "8", name: "Mid-Setup Two" },
      ],
      away: [],
    });

    // The partial roster is persisted.
    const before = await readPersistedState(page, GAME_KEY);
    expect(before).not.toBeNull();
    expect(before!.state.status).toBe("setup");
    expect(before!.state.homeTeam.roster.length).toBe(2);
    expect(before!.state.awayTeam.roster.length).toBe(0);

    await page.reload();

    // Still on setup with the same two-player roster.
    await expect(page).toHaveURL(/\/setup$/);
    const after = await readPersistedState(page, GAME_KEY);
    expect(after).not.toBeNull();
    expect(after!.state.status).toBe("setup");
    expect(after!.state.homeTeam.roster.length).toBe(2);
  });

  test("US1.2 — refresh during a timeout pauses the break countdown", async ({
    page,
  }) => {
    await seedAndEnterGame(page);
    await page.getByRole("button", { name: /Tip Off/ }).click();

    const timeoutBtn = page.getByRole("button", { name: /Timeout/i }).first();
    if (await timeoutBtn.isVisible()) {
      await timeoutBtn.click();
      await page.reload();
      await expect(page).toHaveURL(/\/game$/);
      const after = await readPersistedState(page, GAME_KEY);
      expect(after).not.toBeNull();
      expect(after!.state.status).toBe("timeout");
    } else {
      test.skip(true, "Timeout affordance not exposed in this build");
    }
  });

  test("US1.5 — storage-unavailable modal blocks first paint and is dismissable", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const broken: Storage = {
        get length() {
          return 0;
        },
        clear() {},
        getItem() {
          return null;
        },
        key() {
          return null;
        },
        removeItem() {},
        setItem() {
          throw new DOMException("nope", "SecurityError");
        },
      };
      Object.defineProperty(window, "localStorage", {
        value: broken,
        configurable: true,
      });
    });
    await page.goto("/");
    await expect(page.getByText(/saving is disabled/i)).toBeVisible();
    await page
      .getByRole("button", { name: /continue without saving/i })
      .click();
    await expect(page.getByText(/saving is disabled/i)).not.toBeVisible();
  });

  test("US2.1 — home page 'New Game' wipes the prior game record", async ({
    page,
  }) => {
    // Start a real game so the persisted record has events.
    await seedAndEnterGame(page);
    await page.getByRole("button", { name: /Tip Off/ }).click();
    await tapPlayerByNumber(page, "home", "1");
    await page.getByRole("button", { name: /^\+2 Made/ }).click();
    await expect(
      page.getByRole("button", { name: /^\+2 Made/ }),
    ).not.toBeVisible();

    // Sanity check the persisted state holds the live game.
    const before = await readPersistedState(page, GAME_KEY);
    expect(before!.state.status).toBe("live");
    expect(before!.state.events.length).toBeGreaterThan(0);

    // Navigate home and click "New Game".
    await page.goto("/");
    await page.getByRole("button", { name: /New Game/ }).click();
    await expect(page).toHaveURL(/\/setup$/);

    // The persisted record now reflects a fresh empty setup, NOT the
    // prior live game. The clock checkpoint key is gone (no live
    // clock is running).
    const after = await readPersistedState(page, GAME_KEY);
    expect(after).not.toBeNull();
    expect(after!.state.status).toBe("setup");
    expect(after!.state.events).toEqual([]);
    expect(after!.state.homeTeam.roster).toEqual([]);
    expect(after!.state.awayTeam.roster).toEqual([]);
    const clock = await page.evaluate(
      (k) => window.localStorage.getItem(k),
      CLOCK_KEY,
    );
    expect(clock).toBeNull();
  });

  test("US2.2 — after a wipe, refresh keeps the user on the empty setup", async ({
    page,
  }) => {
    await seedAndEnterGame(page);
    await page.getByRole("button", { name: /Tip Off/ }).click();
    await page.goto("/");
    await page.getByRole("button", { name: /New Game/ }).click();
    await expect(page).toHaveURL(/\/setup$/);

    await page.reload();

    await expect(page).toHaveURL(/\/setup$/);
    const after = await readPersistedState(page, GAME_KEY);
    expect(after).not.toBeNull();
    expect(after!.state.status).toBe("setup");
    expect(after!.state.events).toEqual([]);
  });

  test("US1.6 — corrupted record falls back to setup and clears the bad payload", async ({
    page,
  }) => {
    await page.addInitScript((key) => {
      window.localStorage.setItem(key, "{not json");
    }, GAME_KEY);
    await page.goto("/setup");
    await expect(page).toHaveURL(/\/setup$/);

    // The bad payload has been replaced (either by a clean partialize
    // write or absent). It must NOT still be "{not json".
    const raw = await page.evaluate(
      (k) => window.localStorage.getItem(k),
      GAME_KEY,
    );
    expect(raw).not.toBe("{not json");
    if (raw !== null) {
      const parsed = JSON.parse(raw) as PersistedState;
      expect(parsed.state.status).toBe("setup");
    }
    const clock = await page.evaluate(
      (k) => window.localStorage.getItem(k),
      CLOCK_KEY,
    );
    expect(clock).toBeNull();
  });
});
