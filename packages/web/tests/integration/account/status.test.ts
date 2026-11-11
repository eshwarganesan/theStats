/**
 * Integration tests for GET /api/account/status.
 * Feature 018-account-deletion, task T071; contracts/account-status-api.md
 * integration tests 1–5. LOCAL Supabase only.
 */
import { afterAll, describe, expect, it } from "vitest";
import { RUN, createConfirmedUser, removeUser, requireAdmin, type TestUser } from "./_helpers";

const { GET } = await import("@/app/api/account/status/route");

const created: TestUser[] = [];

function status(query: string): Promise<Response> {
  return GET(new Request(`http://localhost:3000/api/account/status${query}`));
}

afterAll(async () => {
  if (!RUN) return;
  for (const user of created) await removeUser(user.id);
});

describe.skipIf(!RUN)("GET /api/account/status", () => {
  it("1. answers exists: true for an existing account", async () => {
    const user = await createConfirmedUser("status-live");
    created.push(user);

    const res = await status(`?userId=${user.id}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ exists: true });
  });

  it("2. answers exists: false once the account is deleted", async () => {
    const user = await createConfirmedUser("status-gone");
    created.push(user);
    await requireAdmin().auth.admin.deleteUser(user.id);

    const res = await status(`?userId=${user.id}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ exists: false });
  });

  it("3. answers exists: false for an id that never existed", async () => {
    const res = await status(`?userId=${globalThis.crypto.randomUUID()}`);
    expect(await res.json()).toEqual({ exists: false });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it.each(["?userId=abc", ""])("4. rejects a missing or malformed id (%s)", async (query) => {
    const res = await status(query);

    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      error: { code: "invalid_query_params", message: "userId must be a UUID." },
    });
  });
});
