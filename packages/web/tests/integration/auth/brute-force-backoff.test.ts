/**
 * Integration test for the SQL brute-force backoff math.
 *
 * Runs against a local Supabase instance — requires `supabase start` to be
 * running and a .env.local with NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY set. When those are missing, this test is
 * skipped (a passing skip rather than a failure) so `npm test` stays green
 * for contributors who haven't booted Supabase yet.
 *
 * Constitution Principle VI ("Backend PR gate") requires this test to run
 * green in CI before the auth feature is merged.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUN = Boolean(url && serviceRole);

const TEST_EMAIL_KEY = `e:bf-backoff-${Date.now()}@example.com`;
const TEST_IP_KEY = `ip:198.51.100.99`;
const KEYS = [TEST_EMAIL_KEY, TEST_IP_KEY];

const admin = RUN
  ? createClient<Database>(url!, serviceRole!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

describe.skipIf(!RUN)("brute-force-backoff (integration)", () => {
  beforeEach(async () => {
    // Reset state for this test's keys.
    if (!admin) return;
    await admin
      .from("auth_attempts")
      .delete()
      .in("key", KEYS);
  });

  it("returns allowed=true when no row exists for the keys", async () => {
    const { data, error } = await admin!.rpc("is_auth_attempt_allowed", { p_keys: KEYS });
    expect(error).toBeNull();
    expect(data).toEqual({ allowed: true, retry_after_seconds: 0 });
  });

  it("grows the backoff monotonically and caps at 30 seconds", async () => {
    const seen: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      await admin!.rpc("record_auth_attempt", { p_keys: KEYS, p_success: false });
      const { data } = await admin!.rpc("is_auth_attempt_allowed", { p_keys: KEYS });
      const row = data as { allowed: boolean; retry_after_seconds: number };
      seen.push(row.retry_after_seconds);
    }
    // Monotonic non-decreasing.
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]!);
    }
    // Cap at 30.
    for (const s of seen) expect(s).toBeLessThanOrEqual(30);
    // The cap MUST be reached within the doubling sequence (1,2,4,8,16,30,30).
    expect(Math.max(...seen)).toBeGreaterThanOrEqual(30);
  });

  it("resets the counter on a successful attempt", async () => {
    await admin!.rpc("record_auth_attempt", { p_keys: KEYS, p_success: false });
    await admin!.rpc("record_auth_attempt", { p_keys: KEYS, p_success: false });
    await admin!.rpc("record_auth_attempt", { p_keys: KEYS, p_success: true });

    const { data } = await admin!.rpc("is_auth_attempt_allowed", { p_keys: KEYS });
    expect(data).toEqual({ allowed: true, retry_after_seconds: 0 });
  });
});
