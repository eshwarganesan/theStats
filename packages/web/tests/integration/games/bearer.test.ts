/**
 * Integration test for the games API with `Authorization: Bearer` (the
 * iOS app's credential).
 *
 * Self-skips without Supabase env, like the other integration suites.
 * Tokens come straight from Supabase Auth (the token route has its own
 * suite) and the cookie store is empty, so every request here is
 * authenticated by its bearer token alone. Unlike the cookie suites, a
 * bearer request shares no client state, so two users can run in one
 * file and the RLS checks live here.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUN = Boolean(url && anon && serviceRole);

const admin: SupabaseClient<Database> | null = RUN
  ? createClient<Database>(url!, serviceRole!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

// No session cookie, ever. Fail loudly if a handler tries to set one.
const cookieWrites: string[] = [];
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [],
    get: () => undefined,
    set: (name: string) => {
      cookieWrites.push(name);
    },
    delete: (name: string) => {
      cookieWrites.push(name);
    },
  }),
}));

const games = await import("@/app/api/games/route");
const game = await import("@/app/api/games/[id]/route");

const PASSWORD = "password12345";

interface TestUser {
  id: string;
  email: string;
  token: string;
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function signInForToken(email: string): Promise<string> {
  const client = createClient<Database>(url!, anon!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw error ?? new Error("no session");
  return data.session.access_token;
}

async function createUser(prefix: string): Promise<TestUser> {
  const email = uniqueEmail(prefix);
  const { data, error } = await admin!.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  return { id: data.user.id, email, token: await signInForToken(email) };
}

function makeState(currentPeriod = 1) {
  return {
    schemaVersion: 1 as const,
    homeTeam: { id: "home", name: "Central High", tag: "CEN", color: "#ff0000", coach: "", roster: [] },
    awayTeam: { id: "away", name: "Eastridge", tag: "EAS", color: "#0000ff", coach: "", roster: [] },
    settings: {
      format: "5v5" as const,
      periods: 4,
      periodSeconds: 600,
      overtimeSeconds: 300,
      overtimeEnabled: true,
      possessionArrowEnabled: true,
      bonusFoulThreshold: 5,
      timeoutsPerGame: 4,
      timeoutSeconds: 60,
      quarterBreakSeconds: 60,
      halftimeBreakSeconds: 900,
      venue: "",
      competition: "",
    },
    status: "live" as const,
    currentPeriod,
    events: [],
    possession: "home" as const,
    onCourt: { home: [], away: [] },
  };
}

function req(
  token: string | null,
  path: string,
  init: { method?: string; body?: unknown; key?: string } = {},
): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  if (init.key) headers["Idempotency-Key"] = init.key;
  return new Request(`http://localhost${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const newKey = () => globalThis.crypto.randomUUID();

const users: TestUser[] = [];
let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  if (!admin) return;
  alice = await createUser("bearer-a");
  bob = await createUser("bearer-b");
  users.push(alice, bob);
});

afterAll(async () => {
  if (!admin) return;
  for (const user of users) {
    try {
      await admin.from("games").delete().eq("owner_id", user.id);
      await admin.auth.admin.deleteUser(user.id);
    } catch {
      /* best-effort */
    }
  }
});

describe.skipIf(!RUN)("games API with a bearer token (integration)", () => {
  it("creates, lists, reads, updates and deletes the caller's game", async () => {
    const created = await games.POST(
      req(alice.token, "/api/games", { method: "POST", body: { state: makeState() }, key: newKey() }),
    );
    expect(created.status).toBe(201);
    const { game: record } = await created.json();
    expect(record.ownerId).toBe(alice.id);

    const list = await games.GET(req(alice.token, "/api/games"));
    expect(list.status).toBe(200);
    const page = await list.json();
    expect(page.entries.map((e: { id: string }) => e.id)).toContain(record.id);

    const read = await game.GET(req(alice.token, `/api/games/${record.id}`), params(record.id));
    expect(read.status).toBe(200);

    const patched = await game.PATCH(
      req(alice.token, `/api/games/${record.id}`, {
        method: "PATCH",
        body: { state: makeState(3) },
        key: newKey(),
      }),
      params(record.id),
    );
    expect(patched.status).toBe(200);
    expect((await patched.json()).game.currentPeriod).toBe(3);

    const deleted = await game.DELETE(
      req(alice.token, `/api/games/${record.id}`, { method: "DELETE" }),
      params(record.id),
    );
    expect(deleted.status).toBe(204);
    const gone = await game.GET(req(alice.token, `/api/games/${record.id}`), params(record.id));
    expect(gone.status).toBe(404);
    expect(cookieWrites).toEqual([]);
  });

  it("replays a retried POST instead of creating a second game", async () => {
    const key = newKey();
    const post = () =>
      games.POST(req(alice.token, "/api/games", { method: "POST", body: { state: makeState() }, key }));

    const first = await post();
    const retry = await post();

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    const firstId = (await first.json()).game.id;
    expect((await retry.json()).game.id).toBe(firstId);
    const { count } = await admin!
      .from("games")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", alice.id);
    expect(count).toBe(1);
    await admin!.from("games").delete().eq("id", firstId);
  });

  it("keeps one user's games invisible to another user's token (RLS)", async () => {
    const created = await games.POST(
      req(alice.token, "/api/games", { method: "POST", body: { state: makeState() }, key: newKey() }),
    );
    const { id } = (await created.json()).game;

    const list = await games.GET(req(bob.token, "/api/games"));
    expect((await list.json()).entries).toEqual([]);
    expect((await game.GET(req(bob.token, `/api/games/${id}`), params(id))).status).toBe(404);
    const patch = await game.PATCH(
      req(bob.token, `/api/games/${id}`, { method: "PATCH", body: { state: makeState(4) }, key: newKey() }),
      params(id),
    );
    expect(patch.status).toBe(404);
    const del = await game.DELETE(req(bob.token, `/api/games/${id}`, { method: "DELETE" }), params(id));
    expect(del.status).toBe(404);

    const { data } = await admin!.from("games").select("current_period").eq("id", id).single();
    expect(data?.current_period).toBe(1);
  });

  it("rejects requests without a valid, live token", async () => {
    const statuses = async (token: string | null) => (await games.GET(req(token, "/api/games"))).status;

    expect(await statuses(null)).toBe(401);
    expect(await statuses("not-a-jwt")).toBe(401);

    // A token stops working as soon as its session is signed out, even
    // though it hasn't expired yet.
    const token = await signInForToken(alice.email);
    expect(await statuses(token)).toBe(200);
    const { error } = await admin!.auth.admin.signOut(token, "local");
    expect(error).toBeNull();
    expect(await statuses(token)).toBe(401);
    // Only that session ended; Alice's other token still works.
    expect(await statuses(alice.token)).toBe(200);
  });
});
