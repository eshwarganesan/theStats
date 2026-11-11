/**
 * Shared helpers for the account integration suites (feature 018).
 *
 * Like the other integration suites, everything here is inert unless the
 * three Supabase env vars are set, and those must point at a LOCAL
 * Supabase (`supabase start`): these suites create and delete accounts.
 *
 * No `vi.mock` in this file. Each suite mocks `next/headers` itself,
 * before importing the routes it exercises.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { uniqueIp } from "../_helpers";

export { uniqueIp };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const RUN = Boolean(url && anon && serviceRole);

export const PASSWORD = "password12345";

export const admin: SupabaseClient<Database> | null =
  url && serviceRole
    ? createClient<Database>(url, serviceRole, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

export function requireAdmin(): SupabaseClient<Database> {
  if (!admin) throw new Error("Supabase env missing: the suite should have been skipped");
  return admin;
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export interface TestUser {
  id: string;
  email: string;
}

export async function createConfirmedUser(prefix: string, password = PASSWORD): Promise<TestUser> {
  const email = uniqueEmail(prefix);
  const { data, error } = await requireAdmin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return { id: data.user.id, email };
}

/** Signs in on a throwaway anon client and returns the access token. */
export async function accessTokenFor(email: string, password = PASSWORD): Promise<string> {
  if (!url || !anon) throw new Error("Supabase env missing");
  const client = createClient<Database>(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error("no session");
  return data.session.access_token;
}

/** Best-effort cleanup; a user the test already deleted is fine. */
export async function removeUser(id: string): Promise<void> {
  const client = requireAdmin();
  try {
    await client.from("games").delete().eq("owner_id", id);
    await client.auth.admin.deleteUser(id);
  } catch {
    // already gone
  }
}

/** A minimal valid game record, the same shape the games suites use. */
export function makeGameState(currentPeriod = 1) {
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

/**
 * A request to the delete route. `body` is sent as JSON unless it is
 * already a string (for the not-JSON cases).
 */
export function deleteRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/account/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": uniqueIp(),
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
