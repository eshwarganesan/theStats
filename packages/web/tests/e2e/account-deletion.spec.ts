/**
 * Playwright E2E spec for feature 018-account-deletion.
 *
 * US1 (task T032): delete from the account page, then the landing page
 * notice, a clean browser, a failing old login, and a second tab that
 * follows along.
 *
 * Runs against `next dev` and the Supabase named by the env, which MUST
 * be a local Supabase: this spec creates and deletes accounts. Skipped
 * without the env vars.
 */
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomForwardedFor, signInViaAPI } from "./_auth-helpers";
import { seedAndEnterGame, tapPlayerByNumber } from "./_helpers";

test.use({ storageState: { cookies: [], origins: [] } });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.skip(!url || !serviceRole, "Supabase env vars missing — skipping account deletion E2E");

const PASSWORD = "password12345";

let _admin: SupabaseClient | undefined;
function admin(): SupabaseClient {
  if (!url || !serviceRole) throw new Error("Supabase env missing");
  _admin ??= createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _admin;
}

function uniqueEmail(prefix = "e2e-delete"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function createConfirmedUser(email: string): Promise<string> {
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

async function cleanup(userId: string): Promise<void> {
  try {
    await admin().from("games").delete().eq("owner_id", userId);
    await admin().auth.admin.deleteUser(userId);
  } catch {
    /* already deleted by the test */
  }
}

/** Starts a game and records one play, so the browser holds a game. */
async function scoreOnePlay(page: Page): Promise<void> {
  await seedAndEnterGame(page);
  await page.getByRole("button", { name: /Tip Off/ }).click();
  await tapPlayerByNumber(page, "home", "1");
  await page.getByRole("button", { name: /^\+2 Made/ }).click();
  await expect(page.getByRole("button", { name: /^\+2 Made/ })).not.toBeVisible();
}

async function savedGameId(userId: string): Promise<string> {
  let id: string | null = null;
  await expect
    .poll(async () => {
      const { data } = await admin().from("games").select("id").eq("owner_id", userId).limit(1);
      id = data?.[0]?.id ?? null;
      return id;
    })
    .not.toBeNull();
  if (!id) throw new Error("no saved game");
  return id;
}

async function thestatsKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("thestats.")));
}

async function authCookies(context: BrowserContext): Promise<string[]> {
  const cookies = await context.cookies();
  return cookies.filter((c) => c.name.startsWith("sb-") && c.value !== "").map((c) => c.name);
}

async function deleteViaAccountPage(page: Page, password: string): Promise<void> {
  await page.goto("/account");
  await page.getByRole("button", { name: "Delete account", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Password", { exact: true }).fill(password);
  await dialog.getByRole("button", { name: "Delete account permanently" }).click();
}

test.describe("Account deletion — US1 (web)", () => {
  test("deletes the account from the account page and leaves a clean browser", async ({
    page,
    context,
  }) => {
    await context.setExtraHTTPHeaders({ "X-Forwarded-For": randomForwardedFor() });
    const email = uniqueEmail();
    const userId = await createConfirmedUser(email);
    try {
      await signInViaAPI(page, email, PASSWORD);
      await scoreOnePlay(page);
      const gameId = await savedGameId(userId);

      await deleteViaAccountPage(page, PASSWORD);

      await expect(page).toHaveURL(/\/\?account=deleted$/);
      await expect(page.getByRole("status")).toHaveText(/Your account has been deleted\./);
      expect(await thestatsKeys(page)).toEqual([]);
      expect(await authCookies(context)).toEqual([]);

      // The old login now looks like an unknown email.
      await page.goto("/login");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: /^sign in$/i }).click();
      await expect(page.getByText("Invalid email or password.")).toBeVisible();

      // The saved game's link only leads to sign-in.
      await page.goto(`/games/${gameId}`);
      await expect(page).toHaveURL(/\/login/);

      // The same email can start over, with nothing from before.
      const newId = await createConfirmedUser(email);
      try {
        await signInViaAPI(page, email, PASSWORD);
        const { count } = await admin()
          .from("games")
          .select("*", { count: "exact", head: true })
          .eq("owner_id", newId);
        expect(count).toBe(0);
      } finally {
        await cleanup(newId);
      }
    } finally {
      await cleanup(userId);
    }
  });

  test("a second tab on the live game follows to the landing page and writes nothing back", async ({
    page,
    context,
  }) => {
    await context.setExtraHTTPHeaders({ "X-Forwarded-For": randomForwardedFor() });
    const email = uniqueEmail("e2e-delete-tabs");
    const userId = await createConfirmedUser(email);
    try {
      await signInViaAPI(page, email, PASSWORD);
      await scoreOnePlay(page);
      await savedGameId(userId);

      const secondTab = await context.newPage();
      await secondTab.goto("/game");
      await expect(secondTab.locator("section").filter({ hasText: "Home" }).first()).toBeVisible();

      await deleteViaAccountPage(page, PASSWORD);

      await expect(page).toHaveURL(/\/\?account=deleted$/);
      await expect(secondTab).toHaveURL(/\/\?account=deleted$/);
      await page.waitForTimeout(3_000);
      expect(await thestatsKeys(page)).toEqual([]);
    } finally {
      await cleanup(userId);
    }
  });
});

async function accountExists(userId: string): Promise<boolean> {
  const { data } = await admin().auth.admin.getUserById(userId);
  return data.user !== null;
}

async function gameExists(gameId: string): Promise<boolean> {
  const { data } = await admin().from("games").select("id").eq("id", gameId);
  return (data ?? []).length === 1;
}

test.describe("Account deletion — US3 (protections)", () => {
  test("cancelling, a wrong password and the rate limit delete nothing; a correct retry does", async ({
    page,
    context,
  }) => {
    await context.setExtraHTTPHeaders({ "X-Forwarded-For": randomForwardedFor() });
    const email = uniqueEmail("e2e-delete-guard");
    const userId = await createConfirmedUser(email);
    try {
      await signInViaAPI(page, email, PASSWORD);
      await scoreOnePlay(page);
      const gameId = await savedGameId(userId);
      await page.goto("/account");
      const dialog = page.getByRole("dialog");
      const open = () => page.getByRole("button", { name: "Delete account", exact: true }).click();
      const confirm = () => dialog.getByRole("button", { name: "Delete account permanently" }).click();

      await open();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();

      await open();
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();

      await open();
      await dialog.getByLabel("Password", { exact: true }).fill("not-the-password");
      await confirm();
      await expect(dialog.getByRole("alert")).toHaveText("Current password is incorrect.");

      // Wrong passwords back off like sign-in (1 s, then 2 s, 4 s…). Retry
      // as soon as each answer arrives until the limit is the answer.
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const reply = page.waitForResponse((r) => r.url().endsWith("/api/account/delete"));
        await confirm();
        if ((await reply).status() === 429) break;
      }
      const limit = dialog.getByRole("alert");
      await expect(limit).toHaveText(/^Too many attempts\. Try again in \d+ seconds?\.$/);
      const waitSeconds = Number(/in (\d+) second/.exec((await limit.textContent()) ?? "")?.[1] ?? "30");

      await page.reload();
      await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
      expect(await accountExists(userId)).toBe(true);
      expect(await gameExists(gameId)).toBe(true);

      // Once the wait is over, the right password works.
      await page.waitForTimeout((waitSeconds + 1) * 1000);
      await deleteViaAccountPage(page, PASSWORD);
      await expect(page).toHaveURL(/\/\?account=deleted$/);
      expect(await accountExists(userId)).toBe(false);
    } finally {
      await cleanup(userId);
    }
  });

  test("the whole flow works with the keyboard alone", async ({ page, context }) => {
    await context.setExtraHTTPHeaders({ "X-Forwarded-For": randomForwardedFor() });
    const email = uniqueEmail("e2e-delete-keys");
    const userId = await createConfirmedUser(email);
    try {
      await signInViaAPI(page, email, PASSWORD);
      await page.goto("/account");

      await page.getByRole("button", { name: "Delete account", exact: true }).focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByLabel("Password", { exact: true })).toBeFocused();
      await page.keyboard.type(PASSWORD);
      await page.keyboard.press("Tab");
      await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(dialog.getByRole("button", { name: "Delete account permanently" })).toBeFocused();
      await page.keyboard.press("Enter");

      await expect(page).toHaveURL(/\/\?account=deleted$/);
    } finally {
      await cleanup(userId);
    }
  });

  test("the dialog fits a 360-pixel-wide screen", async ({ page, context }) => {
    await context.setExtraHTTPHeaders({ "X-Forwarded-For": randomForwardedFor() });
    await page.setViewportSize({ width: 360, height: 640 });
    const email = uniqueEmail("e2e-delete-narrow");
    const userId = await createConfirmedUser(email);
    try {
      await signInViaAPI(page, email, PASSWORD);
      await page.goto("/account");
      await page.getByRole("button", { name: "Delete account", exact: true }).click();
      const dialog = page.getByRole("dialog");

      await expect(dialog.getByLabel("Password", { exact: true })).toBeInViewport();
      await expect(dialog.getByRole("button", { name: "Cancel" })).toBeInViewport();
      await expect(dialog.getByRole("button", { name: "Delete account permanently" })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    } finally {
      await cleanup(userId);
    }
  });
});

async function newSignedInPage(
  browser: Browser,
  email: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: { "X-Forwarded-For": randomForwardedFor() },
  });
  const page = await context.newPage();
  await signInViaAPI(page, email, PASSWORD);
  return { context, page };
}

test.describe("Account deletion — US4 (other devices)", () => {
  test("a browser with a live session lands on the notice at its next page load", async ({ browser }) => {
    const email = uniqueEmail("e2e-delete-elsewhere");
    const userId = await createConfirmedUser(email);
    const a = await newSignedInPage(browser, email);
    const b = await newSignedInPage(browser, email);
    try {
      await b.page.goto("/games");
      await deleteViaAccountPage(a.page, PASSWORD);
      await expect(a.page).toHaveURL(/\/\?account=deleted$/);

      await b.page.goto("/games");

      await expect(b.page).toHaveURL(/\/\?account=deleted-elsewhere$/);
      await expect(b.page.getByRole("status")).toHaveText(
        /You were signed out because this account was deleted\./,
      );
      expect(await thestatsKeys(b.page)).toEqual([]);
      expect(await authCookies(b.context)).toEqual([]);
    } finally {
      await a.context.close();
      await b.context.close();
      await cleanup(userId);
    }
  });

  test("a browser that is scoring is sent to the notice when its next save is refused", async ({ browser }) => {
    const email = uniqueEmail("e2e-delete-scoring");
    const userId = await createConfirmedUser(email);
    const a = await newSignedInPage(browser, email);
    const b = await newSignedInPage(browser, email);
    try {
      await scoreOnePlay(b.page);
      await savedGameId(userId);
      await deleteViaAccountPage(a.page, PASSWORD);
      await expect(a.page).toHaveURL(/\/\?account=deleted$/);

      await tapPlayerByNumber(b.page, "away", "11");
      await b.page.getByRole("button", { name: /^\+3 Made/ }).click();

      await expect(b.page).toHaveURL(/\/\?account=deleted-elsewhere$/);
      expect(await thestatsKeys(b.page)).toEqual([]);
    } finally {
      await a.context.close();
      await b.context.close();
      await cleanup(userId);
    }
  });

  test("a browser whose session already expired finds out on its next visit", async ({ browser }) => {
    const email = uniqueEmail("e2e-delete-expired");
    const userId = await createConfirmedUser(email);
    const a = await newSignedInPage(browser, email);
    const b = await newSignedInPage(browser, email);
    try {
      await b.page.goto("/games");
      await expect
        .poll(() => b.page.evaluate(() => localStorage.getItem("thestats.account.v1")))
        .not.toBeNull();
      // An expired session: the browser keeps its storage, but no longer has a session.
      await b.context.clearCookies();
      await deleteViaAccountPage(a.page, PASSWORD);
      await expect(a.page).toHaveURL(/\/\?account=deleted$/);

      await b.page.goto("/");

      await expect(b.page).toHaveURL(/\/\?account=deleted-elsewhere$/);
      await expect(b.page.getByRole("status")).toHaveText(
        /You were signed out because this account was deleted\./,
      );
      expect(await thestatsKeys(b.page)).toEqual([]);
    } finally {
      await a.context.close();
      await b.context.close();
      await cleanup(userId);
    }
  });
});
