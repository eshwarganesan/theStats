/**
 * Integration test for POST /api/account/delete when the delete itself fails.
 * Feature 018-account-deletion, task T011; contracts/delete-account-api.md
 * integration test 9 (FR-006, FR-013). LOCAL Supabase only.
 *
 * The admin client is the real one, except that `deleteUser` reports a
 * server error, so throttling and the password check still run for real.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import type * as AdminModule from "@/lib/supabase/admin";
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
  type TestUser,
} from "./_helpers";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [],
    get: () => undefined,
    set: () => {},
    delete: () => {},
  }),
}));

vi.mock("@/lib/supabase/admin", async () => {
  const actual = await vi.importActual<typeof AdminModule>("@/lib/supabase/admin");
  const { AuthApiError } = await import("@supabase/supabase-js");
  return {
    createAdminClient: () => {
      const client = actual.createAdminClient();
      client.auth.admin.deleteUser = async () => ({
        data: { user: null },
        error: new AuthApiError("boom", 500, "unexpected_failure"),
      });
      return client;
    },
  };
});

const { POST: deleteAccount } = await import("@/app/api/account/delete/route");
const games = await import("@/app/api/games/route");

const created: TestUser[] = [];

afterAll(async () => {
  if (!RUN) return;
  for (const user of created) await removeUser(user.id);
});

describe.skipIf(!RUN)("POST /api/account/delete when the delete fails", () => {
  it("answers 500 and leaves the account, profile and games in place", async () => {
    const user = await createConfirmedUser("delete-fail");
    created.push(user);
    const token = await accessTokenFor(user.email);
    const { error } = await requireAdmin().from("profiles").insert({ id: user.id, display_name: "Coach" });
    if (error) throw error;
    const seeded = await games.POST(
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
    expect(seeded.status).toBe(201);

    const res = await deleteAccount(deleteRequest({ password: PASSWORD }, bearer(token)));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: { code: "internal_error", message: "Something went wrong." },
    });
    const { data } = await requireAdmin().auth.admin.getUserById(user.id);
    expect(data.user?.id).toBe(user.id);
    const profiles = await requireAdmin().from("profiles").select("id").eq("id", user.id);
    expect(profiles.data).toHaveLength(1);
    const owned = await requireAdmin().from("games").select("id").eq("owner_id", user.id);
    expect(owned.data).toHaveLength(1);
  });
});
