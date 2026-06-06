/**
 * Integration test for POST /api/auth/sign-out.
 *
 * Per contracts/post_sign_out.md: signed-in caller → 204 + cookies
 * cleared; unauthenticated caller → 204 (no-op). Signing out on one
 * cookie set does NOT invalidate sessions on other devices — that
 * separation is the responsibility of @supabase/ssr's per-cookie
 * refresh-token storage; we only verify our handler returns 204 for both
 * cases.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUN = Boolean(url && serviceRole);

const admin = RUN
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

const { POST: signOut } = await import("@/app/api/auth/sign-out/route");
const { POST: signIn } = await import("@/app/api/auth/sign-in/route");

function uniqueEmail(prefix = "signout"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}
function uniqueIp(): string {
  const oct = () => Math.floor(Math.random() * 254) + 1;
  return `203.0.113.${oct()}`;
}

const createdEmails: string[] = [];
const usedIps: string[] = [];

function req(path: string, body: unknown | null, opts: { sourceIp?: string } = {}): Request {
  const ip = opts.sourceIp ?? uniqueIp();
  usedIps.push(ip);
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: body === null ? undefined : JSON.stringify(body),
  });
}

afterEach(async () => {
  if (!admin) return;
  for (const email of createdEmails) {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const u = data.users.find((x) => x.email === email);
    if (u) {
      try {
        await admin.auth.admin.deleteUser(u.id);
      } catch {
        /* best-effort */
      }
    }
  }
  const keys = [
    ...createdEmails.map((e) => `e:${e}`),
    ...usedIps.map((ip) => `ip:${ip}`),
  ];
  if (keys.length > 0) {
    try {
      await admin.from("auth_attempts").delete().in("key", keys);
    } catch {
      /* best-effort */
    }
  }
  createdEmails.length = 0;
  usedIps.length = 0;
  cookieJar.clear();
});

describe.skipIf(!RUN)("POST /api/auth/sign-out (integration)", () => {
  it("returns 204 for an unauthenticated caller (no-op)", async () => {
    cookieJar.clear();
    const res = await signOut(req("/api/auth/sign-out", null));
    expect(res.status).toBe(204);
    // 204 responses have no body — verify with text() rather than json().
    expect(await res.text()).toBe("");
  });

  it("returns 204 for a signed-in caller and removes Supabase session cookies", async () => {
    const email = uniqueEmail();
    createdEmails.push(email);
    await admin!.auth.admin.createUser({
      email,
      password: "password12345",
      email_confirm: true,
    });

    // First establish a session by signing in. This populates cookieJar
    // with the access + refresh cookies via @supabase/ssr's setAll bridge.
    const signInRes = await signIn(req("/api/auth/sign-in", { email, password: "password12345" }));
    expect(signInRes.status).toBe(200);

    const sessionKeys = Array.from(cookieJar.keys()).filter((k) => /sb-|supabase/i.test(k));
    expect(sessionKeys.length).toBeGreaterThan(0);

    const res = await signOut(req("/api/auth/sign-out", null));
    expect(res.status).toBe(204);

    // After sign-out, supabase session cookies should either be deleted
    // or replaced with the "logged-out" sentinel value @supabase/ssr uses
    // (an empty string).
    for (const k of sessionKeys) {
      const v = cookieJar.get(k) ?? "";
      expect(v.length).toBeLessThan(64);
    }
  });
});
