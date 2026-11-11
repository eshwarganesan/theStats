/**
 * Integration test for POST /api/account/delete with the browser's session
 * cookie. Feature 018-account-deletion, task T010; contracts/delete-account-api.md
 * integration test 5 (cookie path).
 *
 * The auth client caches its session in a per-file singleton, so this file
 * signs in once, as the other cookie suites do. LOCAL Supabase only.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  PASSWORD,
  RUN,
  createConfirmedUser,
  deleteRequest,
  makeGameState,
  removeUser,
  requireAdmin,
  uniqueIp,
  type TestUser,
} from "./_helpers";

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => Array.from(cookieJar, ([name, value]) => ({ name, value })),
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

const { POST: deleteAccount } = await import("@/app/api/account/delete/route");
const games = await import("@/app/api/games/route");
const { POST: signIn } = await import("@/app/api/auth/sign-in/route");

let user: TestUser | null = null;

function authCookies(): Array<[string, string]> {
  return Array.from(cookieJar).filter(([name]) => name.startsWith("sb-") && name.includes("auth-token"));
}

beforeAll(async () => {
  if (!RUN) return;
  user = await createConfirmedUser("delete-cookie");
  const res = await signIn(
    new Request("http://localhost:3000/api/auth/sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
      body: JSON.stringify({ email: user.email, password: PASSWORD }),
    }),
  );
  expect(res.status).toBe(200);
});

afterAll(async () => {
  if (RUN && user) await removeUser(user.id);
});

describe.skipIf(!RUN)("POST /api/account/delete (session cookie)", () => {
  it("deletes the account and expires the auth cookies", async () => {
    if (!user) throw new Error("no user");
    expect(authCookies().some(([, value]) => value !== "")).toBe(true);

    const seeded = await games.POST(
      new Request("http://localhost/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": globalThis.crypto.randomUUID() },
        body: JSON.stringify({ state: makeGameState() }),
      }),
    );
    expect(seeded.status).toBe(201);

    const res = await deleteAccount(deleteRequest({ password: PASSWORD }));

    expect(res.status).toBe(204);
    expect(authCookies().length).toBeGreaterThan(0);
    expect(authCookies().every(([, value]) => value === "")).toBe(true);

    const { data } = await requireAdmin().auth.admin.getUserById(user.id);
    expect(data.user).toBeNull();
    const { count } = await requireAdmin()
      .from("games")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", user.id);
    expect(count).toBe(0);

    const after = await games.GET(new Request("http://localhost/api/games"));
    expect(after.status).toBe(401);
  });
});
