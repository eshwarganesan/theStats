/**
 * Integration test for GET / PATCH /api/games/[id].
 * Feature 009-account-library, task T047.
 *
 * Self-skips when Supabase env is missing OR when the games schema
 * has not been applied yet (mirrors tests/integration/games/route.test.ts).
 * Same shared-user, module-level pattern to keep the GoTrue singleton
 * from bleeding state across tests.
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

const { GET, PATCH } = await import("@/app/api/games/[id]/route");
const { POST: signIn } = await import("@/app/api/auth/sign-in/route");

function uniqueEmail(prefix = "games-id"): string {
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
      coach: "",
      roster: [],
    },
    awayTeam: {
      id: "away",
      name: "Eastridge",
      tag: "EAS",
      color: "#0000ff",
      coach: "",
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
      venue: "",
      competition: "",
    },
    status: "live" as const,
    currentPeriod: 1,
    events: [],
    possession: "home" as const,
    onCourt: { home: [], away: [] },
  };
}

const NEW_UUID = () => globalThis.crypto.randomUUID();

const emailA = uniqueEmail("a");
const emailB = uniqueEmail("b");
let uidA: string;
let uidB: string;

const SCHEMA_READY = await (async (): Promise<boolean> => {
  if (!admin) return false;
  const { error } = await admin.from("games").select("id").limit(1);
  if (error) {
    if (error.code === "PGRST205" || /schema cache/i.test(error.message ?? "")) {
      console.warn(
        "[games-id integration] Skipping — migration 0002_account_library.sql not applied.",
      );
      return false;
    }
    return false;
  }
  return true;
})();

beforeAll(async () => {
  if (!admin || !SCHEMA_READY) return;
  const a = await admin.auth.admin.createUser({
    email: emailA,
    password: "password12345",
    email_confirm: true,
  });
  if (a.error) throw a.error;
  uidA = a.data.user.id;
  const b = await admin.auth.admin.createUser({
    email: emailB,
    password: "password12345",
    email_confirm: true,
  });
  if (b.error) throw b.error;
  uidB = b.data.user.id;
});

afterEach(async () => {
  if (!admin) return;
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

async function seedGameFor(owner: string): Promise<string> {
  const insert = await admin!
    .from("games")
    .insert({
      owner_id: owner,
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
  if (insert.error || !insert.data) throw insert.error ?? new Error("seed failed");
  return insert.data.id;
}

function idCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe.skipIf(!RUN || !SCHEMA_READY)("GET/PATCH /api/games/[id] (integration)", () => {
  it("GET → 401 when unauthenticated", async () => {
    cookieJar.clear();
    const seededId = await seedGameFor(uidA);
    const res = await GET(new Request(`http://localhost/api/games/${seededId}`), idCtx(seededId));
    expect(res.status).toBe(401);
  });

  describe("authenticated as user A", () => {
    beforeAll(async () => {
      cookieJar.clear();
      const r = await signIn(signInReq(emailA, "password12345"));
      if (r.status !== 200) throw new Error(`sign-in failed: ${r.status}`);
    });

    it("GET → 200 with full state for the owner", async () => {
      const gameId = await seedGameFor(uidA);
      const res = await GET(new Request(`http://localhost/api/games/${gameId}`), idCtx(gameId));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.game.id).toBe(gameId);
      expect(body.game.state.homeTeam.name).toBe("Central High");
    });

    it("GET → 404 for a game owned by someone else (RLS-filtered)", async () => {
      const otherId = await seedGameFor(uidB);
      const res = await GET(new Request(`http://localhost/api/games/${otherId}`), idCtx(otherId));
      expect(res.status).toBe(404);
    });

    it("PATCH → 400 idempotency_key_required when the header is missing", async () => {
      const gameId = await seedGameFor(uidA);
      const res = await PATCH(
        new Request(`http://localhost/api/games/${gameId}`, {
          method: "PATCH",
          body: JSON.stringify({ state: makeState() }),
          headers: { "Content-Type": "application/json" },
        }),
        idCtx(gameId),
      );
      expect(res.status).toBe(400);
    });

    it("PATCH twice with the same Idempotency-Key returns the row unchanged", async () => {
      const gameId = await seedGameFor(uidA);
      const key = NEW_UUID();
      const patched = { ...makeState(), currentPeriod: 3 };
      const headers = {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      };

      const first = await PATCH(
        new Request(`http://localhost/api/games/${gameId}`, {
          method: "PATCH",
          body: JSON.stringify({ state: patched }),
          headers,
        }),
        idCtx(gameId),
      );
      expect(first.status).toBe(200);
      const firstBody = await first.json();
      expect(firstBody.game.currentPeriod).toBe(3);

      // A second, LATER-shape PATCH with the SAME key must be a no-op.
      const later = { ...makeState(), currentPeriod: 4 };
      const second = await PATCH(
        new Request(`http://localhost/api/games/${gameId}`, {
          method: "PATCH",
          body: JSON.stringify({ state: later }),
          headers,
        }),
        idCtx(gameId),
      );
      expect(second.status).toBe(200);
      const secondBody = await second.json();
      // Idempotency: server returned the row untouched by the second call.
      expect(secondBody.game.currentPeriod).toBe(3);
    });

    it("PATCH transitioning to finished sets finished_at and returns 'finished' status", async () => {
      const gameId = await seedGameFor(uidA);
      const finished = { ...makeState(), status: "finished" as const };
      const res = await PATCH(
        new Request(`http://localhost/api/games/${gameId}`, {
          method: "PATCH",
          body: JSON.stringify({ state: finished }),
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": NEW_UUID(),
          },
        }),
        idCtx(gameId),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.game.status).toBe("finished");
      expect(body.game.finishedAt).not.toBeNull();
    });

    it("PATCH on an already-finished game returns 409 finished_game_locked", async () => {
      const gameId = await seedGameFor(uidA);
      // Flip the row to finished directly via admin.
      await admin!
        .from("games")
        .update({ status: "finished", finished_at: new Date().toISOString() })
        .eq("id", gameId);

      const res = await PATCH(
        new Request(`http://localhost/api/games/${gameId}`, {
          method: "PATCH",
          body: JSON.stringify({ state: makeState() }),
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": NEW_UUID(),
          },
        }),
        idCtx(gameId),
      );
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error?.code).toBe("finished_game_locked");
    });
  });
});
