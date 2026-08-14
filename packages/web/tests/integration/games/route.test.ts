/**
 * Integration test for GET / POST /api/games.
 * Feature 009-account-library, task T030.
 *
 * Hits the user's hosted Supabase. Self-skips when
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are missing.
 *
 * Note on test structure: `@supabase/gotrue-js` caches the current session
 * in a module-level singleton that persists across tests inside a single
 * vitest file. To keep those cache effects out of test semantics we sign
 * in ONCE per test file (the same user is reused across every
 * authenticated test) and only reset the `games` rows between tests. The
 * cross-user RLS check gets its own sign-in near the end.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUN = Boolean(url && serviceRole);

const admin: SupabaseClient<Database> | null = RUN
  ? createClient<Database>(url!, serviceRole!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => Array.from(cookieJar, ([name, value]) => ({ name, value })),
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

const { GET, POST } = await import("@/app/api/games/route");
const { POST: signIn } = await import("@/app/api/auth/sign-in/route");

function uniqueEmail(prefix = "games"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}
function uniqueIp(): string {
  const oct = () => Math.floor(Math.random() * 254) + 1;
  return `203.0.113.${oct()}`;
}
function signInReq(email: string, password: string): Request {
  return new Request(`http://localhost:3000/api/auth/sign-in`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": uniqueIp(),
    },
    body: JSON.stringify({ email, password }),
  });
}

function makeState() {
  return {
    schemaVersion: 1 as const,
    homeTeam: {
      id: "home",
      name: "Central High",
      tag: "CEN",
      color: "#ff0000",
      coach: "Coach A",
      roster: [],
    },
    awayTeam: {
      id: "away",
      name: "Eastridge",
      tag: "EAS",
      color: "#0000ff",
      coach: "Coach B",
      roster: [],
    },
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
      venue: "Home Court",
      competition: "League",
    },
    status: "live" as const,
    currentPeriod: 1,
    events: [],
    possession: "home" as const,
    onCourt: { home: [], away: [] },
  };
}

const testEmailA = uniqueEmail("a");
const testEmailB = uniqueEmail("b");
let uidA: string;
let uidB: string;

// Top-level schema-readiness check. Skipped when RUN=false (env missing);
// otherwise probes for the `public.games` table before the describe block
// evaluates. This lets the file skip gracefully on a hosted Supabase that
// has feature 005's migration but not this feature's migration yet.
const SCHEMA_READY = await (async (): Promise<boolean> => {
  if (!admin) return false;
  // Full `select` (no head:true) — an unmigrated hosted Supabase actually
  // returns a PGRST205 error here; the count-only variant doesn't.
  const { error } = await admin.from("games").select("id").limit(1);
  if (error) {
    if (error.code === "PGRST205" || /schema cache/i.test(error.message ?? "")) {
      console.warn(
        "[games integration] Skipping — migration 0002_account_library.sql has not been applied to the hosted Supabase. Push it and rerun.",
      );
      return false;
    }
    return false;
  }
  return true;
})();

beforeAll(async () => {
  if (!admin || !SCHEMA_READY) return;

  const createA = await admin.auth.admin.createUser({
    email: testEmailA,
    password: "password12345",
    email_confirm: true,
  });
  if (createA.error) throw createA.error;
  uidA = createA.data.user.id;

  const createB = await admin.auth.admin.createUser({
    email: testEmailB,
    password: "password12345",
    email_confirm: true,
  });
  if (createB.error) throw createB.error;
  uidB = createB.data.user.id;
});

afterEach(async () => {
  if (!admin) return;
  // Wipe games created during the test for BOTH users so the next test
  // starts with an empty library.
  try {
    if (uidA) await admin.from("games").delete().eq("owner_id", uidA);
    if (uidB) await admin.from("games").delete().eq("owner_id", uidB);
  } catch {
    /* best-effort */
  }
});

afterAll(async () => {
  if (!admin) return;
  try {
    if (uidA) await admin.auth.admin.deleteUser(uidA);
    if (uidB) await admin.auth.admin.deleteUser(uidB);
  } catch {
    /* best-effort */
  }
  try {
    await admin.from("auth_attempts").delete().like("key", "ip:%");
  } catch {
    /* best-effort */
  }
  cookieJar.clear();
});

describe.skipIf(!RUN || !SCHEMA_READY)("GET/POST /api/games (integration)", () => {
  const NEW_UUID = () => globalThis.crypto.randomUUID();

  it("GET → 401 with the shared error envelope when unauthenticated", async () => {
    cookieJar.clear();
    const res = await GET(new Request("http://localhost/api/games"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error?.code).toBe("unauthenticated");
  });

  describe("authenticated as user A", () => {
    beforeAll(async () => {
      cookieJar.clear();
      const res = await signIn(signInReq(testEmailA, "password12345"));
      if (res.status !== 200) throw new Error(`sign-in failed: ${res.status}`);
    });

    it("POST → 400 idempotency_key_required when the header is missing", async () => {
      const res = await POST(
        new Request("http://localhost/api/games", {
          method: "POST",
          body: JSON.stringify({ state: makeState() }),
          headers: { "Content-Type": "application/json" },
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error?.code).toBe("idempotency_key_required");
    });

    it("POST → 400 invalid_body when state.homeTeam.name is empty", async () => {
      const bad = makeState();
      bad.homeTeam = { ...bad.homeTeam, name: "" };
      const res = await POST(
        new Request("http://localhost/api/games", {
          method: "POST",
          body: JSON.stringify({ state: bad }),
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": NEW_UUID(),
          },
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error?.code).toBe("invalid_body");
    });

    it("POST twice with the same Idempotency-Key returns the same row", async () => {
      const key = NEW_UUID();
      const body = { state: makeState() };
      const headers = {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      };
      const first = await POST(
        new Request("http://localhost/api/games", {
          method: "POST",
          body: JSON.stringify(body),
          headers,
        }),
      );
      expect(first.status).toBe(201);
      const firstBody = await first.json();

      const second = await POST(
        new Request("http://localhost/api/games", {
          method: "POST",
          body: JSON.stringify(body),
          headers,
        }),
      );
      expect(second.status).toBe(200);
      const secondBody = await second.json();
      expect(secondBody.game.id).toBe(firstBody.game.id);
    });

    it("GET respects the limit query param", async () => {
      for (let i = 0; i < 3; i++) {
        const post = await POST(
          new Request("http://localhost/api/games", {
            method: "POST",
            body: JSON.stringify({ state: makeState() }),
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": NEW_UUID(),
            },
          }),
        );
        expect(post.status).toBe(201);
      }

      const res = await GET(new Request("http://localhost/api/games?limit=2"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.entries.length).toBe(2);
    });
  });

  it("GET returns only rows owned by the authenticated user (RLS)", async () => {
    // Seed a game owned by user A directly via admin (skips the auth cookie
    // dance and doesn't disturb GoTrue's cached session).
    const seed = await admin!
      .from("games")
      .insert({
        owner_id: uidA,
        state: makeState() as never,
        status: "in-progress",
        home_team_name: "Central High",
        away_team_name: "Eastridge",
        home_score: 0,
        away_score: 0,
        event_count: 0,
        current_period: 1,
      })
      .select("id")
      .single();
    if (seed.error || !seed.data) throw seed.error ?? new Error("seed failed");
    const gameAId = seed.data.id;

    // Sign in as user B and confirm they cannot see gameA in their list.
    cookieJar.clear();
    const res = await signIn(signInReq(testEmailB, "password12345"));
    if (res.status !== 200) throw new Error(`sign-in failed: ${res.status}`);

    const listRes = await GET(new Request("http://localhost/api/games"));
    expect(listRes.status).toBe(200);
    const listed = await listRes.json();
    const ids = (listed.entries as { id: string }[]).map((e) => e.id);
    expect(ids).not.toContain(gameAId);
  });
});
