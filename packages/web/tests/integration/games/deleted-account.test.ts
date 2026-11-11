/**
 * Integration test: the games API tells a device its account is gone.
 * Feature 018-account-deletion, task T012; contracts/account-gone-signals.md §1.
 *
 * Pins the Supabase behavior research R5 relies on: a still-valid token
 * whose user was deleted gets `user_not_found`, which the handler turns
 * into `401 account_deleted`. LOCAL Supabase only.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  PASSWORD,
  RUN,
  accessTokenFor,
  bearer,
  createConfirmedUser,
  removeUser,
  requireAdmin,
  uniqueIp,
  type TestUser,
} from "../account/_helpers";

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

const games = await import("@/app/api/games/route");
const { POST: signIn } = await import("@/app/api/auth/sign-in/route");

const created: TestUser[] = [];

function authCookies(): Array<[string, string]> {
  return Array.from(cookieJar).filter(([name]) => name.startsWith("sb-") && name.includes("auth-token"));
}

afterAll(async () => {
  if (!RUN) return;
  for (const user of created) await removeUser(user.id);
});

describe.skipIf(!RUN)("games API for an account that no longer exists", () => {
  it("answers account_deleted to a still-valid bearer token", async () => {
    const user = await createConfirmedUser("gone-bearer");
    created.push(user);
    const token = await accessTokenFor(user.email);
    await requireAdmin().auth.admin.deleteUser(user.id);

    const res = await games.GET(new Request("http://localhost/api/games", { headers: bearer(token) }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "account_deleted", message: "This account no longer exists." },
    });
  });

  it("answers account_deleted to a still-valid session cookie, and expires the cookie", async () => {
    const user = await createConfirmedUser("gone-cookie");
    created.push(user);
    const login = await signIn(
      new Request("http://localhost:3000/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ email: user.email, password: PASSWORD }),
      }),
    );
    expect(login.status).toBe(200);
    await requireAdmin().auth.admin.deleteUser(user.id);

    const res = await games.GET(new Request("http://localhost/api/games"));

    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("account_deleted");
    expect(authCookies().length).toBeGreaterThan(0);
    expect(authCookies().every(([, value]) => value === "")).toBe(true);
  });
});
