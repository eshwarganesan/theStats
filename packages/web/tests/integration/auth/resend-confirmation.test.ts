/**
 * Integration test for POST /api/auth/resend-confirmation.
 *
 * Per FR-015 the response body MUST be identical regardless of whether
 * the email is registered + unconfirmed, registered + confirmed, or
 * unknown — otherwise the endpoint becomes an account-enumeration oracle.
 *
 * Hits the hosted Supabase. We don't try to inspect the outbox (no
 * Mailpit on Supabase Cloud); we only verify the contract surface.
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

const { POST } = await import("@/app/api/auth/resend-confirmation/route");

function uniqueEmail(prefix = "resend"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}
function uniqueIp(): string {
  const oct = () => Math.floor(Math.random() * 254) + 1;
  return `203.0.113.${oct()}`;
}

const createdEmails: string[] = [];
const usedIps: string[] = [];

function postReq(body: unknown, opts: { sourceIp?: string } = {}): Request {
  const ip = opts.sourceIp ?? uniqueIp();
  usedIps.push(ip);
  return new Request("http://localhost:3000/api/auth/resend-confirmation", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
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

describe.skipIf(!RUN)("POST /api/auth/resend-confirmation (integration)", () => {
  it("returns 200 { ok: true } for an unconfirmed registered email", async () => {
    const email = uniqueEmail();
    createdEmails.push(email);
    await admin!.auth.admin.createUser({
      email,
      password: "password12345",
      email_confirm: false,
    });

    const res = await POST(postReq({ email }));
    // Provider rate limits may map to 429 — soft-skip if so.
    if (res.status === 429) {
      const body = await res.json();
      if (body?.error?.retry_after_seconds > 30) return;
    }
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns the SAME 200 body for an already-confirmed email (no leakage)", async () => {
    const email = uniqueEmail();
    createdEmails.push(email);
    await admin!.auth.admin.createUser({
      email,
      password: "password12345",
      email_confirm: true,
    });

    const res = await POST(postReq({ email }));
    if (res.status === 429) {
      const body = await res.json();
      if (body?.error?.retry_after_seconds > 30) return;
    }
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns the SAME 200 body for an unknown email (no leakage)", async () => {
    const email = uniqueEmail();
    // Not pushed — user does not exist.

    const res = await POST(postReq({ email }));
    if (res.status === 429) {
      const body = await res.json();
      if (body?.error?.retry_after_seconds > 30) return;
    }
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 400 invalid_input for a malformed email", async () => {
    const res = await POST(postReq({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_input");
  });
});
