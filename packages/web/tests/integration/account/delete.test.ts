/**
 * Integration tests for POST /api/account/delete over `Authorization: Bearer`
 * (the iOS app's credential). Feature 018-account-deletion, task T009;
 * contracts/delete-account-api.md integration tests 1–8 and 10.
 *
 * Self-skips without Supabase env. Run it against LOCAL Supabase only.
 * Every case uses a fresh user and a fresh client IP, so one case's
 * failed-attempt backoff never leaks into another.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import { deriveSummaryColumns } from "@thestats/app";
import {
  PASSWORD,
  RUN,
  accessTokenFor,
  bearer,
  createConfirmedUser,
  deleteRequest,
  makeGameState,
  removeUser,
  requireAdmin,
  uniqueEmail,
  uniqueIp,
  type TestUser,
} from "./_helpers";

// No session cookie, ever: every request here is authenticated by its token.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [],
    get: () => undefined,
    set: () => {},
    delete: () => {},
  }),
}));

const { POST: deleteAccount } = await import("@/app/api/account/delete/route");
const games = await import("@/app/api/games/route");
const { POST: signIn } = await import("@/app/api/auth/sign-in/route");

const created: TestUser[] = [];

async function newUser(prefix: string): Promise<TestUser & { token: string }> {
  const user = await createConfirmedUser(prefix);
  created.push(user);
  return { ...user, token: await accessTokenFor(user.email) };
}

async function seedGame(token: string): Promise<string> {
  const res = await games.POST(
    new Request("http://localhost/api/games", {
      method: "POST",
      headers: {
        ...bearer(token),
        "Content-Type": "application/json",
        "Idempotency-Key": globalThis.crypto.randomUUID(),
      },
      body: JSON.stringify({ state: makeGameState() }),
    }),
  );
  expect(res.status).toBe(201);
  const body: { game: { id: string } } = await res.json();
  return body.game.id;
}

async function seedProfile(userId: string): Promise<void> {
  const { error } = await requireAdmin().from("profiles").insert({ id: userId, display_name: "Coach" });
  if (error) throw error;
}

async function accountExists(userId: string): Promise<boolean> {
  const { data } = await requireAdmin().auth.admin.getUserById(userId);
  return data.user !== null;
}

async function profileCount(userId: string): Promise<number> {
  const { count, error } = await requireAdmin()
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("id", userId);
  if (error) throw error;
  return count ?? 0;
}

async function gameCount(userId: string): Promise<number> {
  const { count, error } = await requireAdmin()
    .from("games")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", userId);
  if (error) throw error;
  return count ?? 0;
}

function signInRequest(email: string, password: string): Request {
  return new Request("http://localhost:3000/api/auth/sign-in", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
    body: JSON.stringify({ email, password }),
  });
}

afterAll(async () => {
  if (!RUN) return;
  for (const user of created) await removeUser(user.id);
});

describe.skipIf(!RUN)("POST /api/account/delete (bearer)", () => {
  it("1. rejects a request with no credentials or a malformed bearer header", async () => {
    const anonymous = await deleteAccount(deleteRequest({ password: PASSWORD }));
    expect(anonymous.status).toBe(401);
    expect((await anonymous.json()).error.code).toBe("unauthenticated");

    const malformed = await deleteAccount(
      deleteRequest({ password: PASSWORD }, { Authorization: "Bearer" }),
    );
    expect(malformed.status).toBe(401);
  });

  it("2. rejects an invalid body and leaves the account alone", async () => {
    const user = await newUser("delete-invalid");
    for (const body of [{}, { password: "" }, "not json"]) {
      const res = await deleteAccount(deleteRequest(body, bearer(user.token)));
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_body");
    }
    expect(await accountExists(user.id)).toBe(true);
  });

  it("3. refuses a wrong password and deletes nothing", async () => {
    const user = await newUser("delete-wrong");
    await seedProfile(user.id);
    await seedGame(user.token);

    const res = await deleteAccount(deleteRequest({ password: "not-the-password" }, bearer(user.token)));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: { code: "current_password_incorrect", message: "Current password is incorrect." },
    });
    expect(await accountExists(user.id)).toBe(true);
    expect(await profileCount(user.id)).toBe(1);
    expect(await gameCount(user.id)).toBe(1);
  });

  it("4. throttles repeated wrong passwords the way sign-in does", async () => {
    const user = await newUser("delete-throttle");
    const first = await deleteAccount(deleteRequest({ password: "wrong-1" }, bearer(user.token)));
    expect(first.status).toBe(403);

    const second = await deleteAccount(deleteRequest({ password: "wrong-2" }, bearer(user.token)));
    expect(second.status).toBe(429);
    const body = await second.json();
    expect(body.error.code).toBe("rate_limited");
    expect(body.error.retry_after_seconds).toBeGreaterThanOrEqual(1);
    expect(second.headers.get("Retry-After")).toBe(String(body.error.retry_after_seconds));
    expect(await accountExists(user.id)).toBe(true);
  });

  it("5. deletes the account, profile, games and write records, but keeps the failed-attempt record", async () => {
    const user = await newUser("delete-ok");
    await seedProfile(user.id);
    const gameId = await seedGame(user.token);

    const res = await deleteAccount(deleteRequest({ password: PASSWORD }, bearer(user.token)));

    expect(res.status).toBe(204);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await accountExists(user.id)).toBe(false);
    expect(await profileCount(user.id)).toBe(0);
    expect(await gameCount(user.id)).toBe(0);
    const writes = await requireAdmin().from("game_writes").select("game_id").eq("game_id", gameId);
    expect(writes.data).toEqual([]);
    const attempts = await requireAdmin().from("auth_attempts").select("key").eq("key", `e:${user.email}`);
    expect(attempts.data).toEqual([{ key: `e:${user.email}` }]);
  });

  it("6. afterwards, the old login looks like an unknown email, and the email can sign up again empty", async () => {
    const user = await newUser("delete-relogin");
    await seedGame(user.token);
    expect((await deleteAccount(deleteRequest({ password: PASSWORD }, bearer(user.token)))).status).toBe(204);

    const oldLogin = await signIn(signInRequest(user.email, PASSWORD));
    const unknown = await signIn(signInRequest(uniqueEmail("never-existed"), PASSWORD));
    expect(oldLogin.status).toBe(401);
    expect(await oldLogin.json()).toEqual(await unknown.json());

    const { data, error } = await requireAdmin().auth.admin.createUser({
      email: user.email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    created.push({ id: data.user.id, email: user.email });
    expect(await profileCount(data.user.id)).toBe(0);
    expect(await gameCount(data.user.id)).toBe(0);
  });

  it("7. answers a repeat with the old token with account_deleted", async () => {
    const user = await newUser("delete-repeat");
    expect((await deleteAccount(deleteRequest({ password: PASSWORD }, bearer(user.token)))).status).toBe(204);

    const repeat = await deleteAccount(deleteRequest({ password: PASSWORD }, bearer(user.token)));

    expect(repeat.status).toBe(401);
    expect((await repeat.json()).error.code).toBe("account_deleted");
  });

  it("8. resolves two concurrent deletes to one deletion and no errors", async () => {
    const user = await newUser("delete-race");
    const [a, b] = await Promise.all([
      deleteAccount(deleteRequest({ password: PASSWORD }, bearer(user.token))),
      deleteAccount(deleteRequest({ password: PASSWORD }, bearer(user.token))),
    ]);

    for (const res of [a, b]) {
      expect([204, 401]).toContain(res.status);
      if (res.status === 401) expect((await res.json()).error.code).toBe("account_deleted");
    }
    expect(await accountExists(user.id)).toBe(false);
  });

  it("10. deletes an account with 200 games in under 5 seconds", { timeout: 60_000 }, async () => {
    const user = await newUser("delete-timing");
    const state = makeGameState();
    const summary = deriveSummaryColumns(state);
    const rows = Array.from({ length: 200 }, () => ({
      owner_id: user.id,
      state: state as never,
      status: summary.status,
      home_team_name: summary.homeTeamName,
      away_team_name: summary.awayTeamName,
      home_score: summary.homeScore,
      away_score: summary.awayScore,
      event_count: summary.eventCount,
      current_period: summary.currentPeriod,
    }));
    const { error } = await requireAdmin().from("games").insert(rows);
    if (error) throw error;
    expect(await gameCount(user.id)).toBe(200);

    const started = performance.now();
    const res = await deleteAccount(deleteRequest({ password: PASSWORD }, bearer(user.token)));
    const elapsed = performance.now() - started;

    expect(res.status).toBe(204);
    expect(elapsed).toBeLessThan(5_000);
    expect(await gameCount(user.id)).toBe(0);
  });
});
