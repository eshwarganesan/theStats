/**
 * Integration test for POST /api/auth/token (iOS sign-in).
 *
 * Hits the hosted Supabase like sign-in.test.ts. The shared flow's error
 * branches are unit-tested in src/lib/auth/password-sign-in.test.ts;
 * here we check the token-specific contract: tokens in the body, no
 * cookies, no caching, and that the returned access token is usable.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUN = Boolean(url && anon && serviceRole);

const admin = RUN
  ? createClient<Database>(url!, serviceRole!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

// The route must never touch cookies; fail loudly if it does.
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

const { POST } = await import("@/app/api/auth/token/route");

function uniqueEmail(): string {
  return `token-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}
function uniqueIp(): string {
  return `203.0.113.${Math.floor(Math.random() * 254) + 1}`;
}

const createdEmails: string[] = [];
const usedIps: string[] = [];

function postReq(body: unknown): Request {
  const ip = uniqueIp();
  usedIps.push(ip);
  return new Request("http://localhost:3000/api/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

afterEach(async () => {
  if (!admin) return;
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const email of createdEmails) {
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
  cookieWrites.length = 0;
});

describe.skipIf(!RUN)("POST /api/auth/token (integration)", () => {
  it("returns usable session tokens in the body and sets no cookies", async () => {
    const email = uniqueEmail();
    createdEmails.push(email);
    await admin!.auth.admin.createUser({
      email,
      password: "password12345",
      email_confirm: true,
    });

    const res = await POST(postReq({ email, password: "password12345" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      token_type: "bearer",
      user: { email },
    });
    expect(typeof body.expires_at).toBe("number");
    expect(cookieWrites).toEqual([]);

    // The access token authenticates a fresh client.
    const client = createClient<Database>(url!, anon!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await client.auth.getUser(body.access_token);
    expect(error).toBeNull();
    expect(data.user?.id).toBe(body.user.id);
  });

  it("returns the same generic 401 as the web endpoint on bad credentials", async () => {
    const res = await POST(postReq({ email: uniqueEmail(), password: "nope12345" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "invalid_credentials", message: "Invalid email or password." },
    });
  });

  it("returns 403 email_unconfirmed and no tokens for an unconfirmed user", async () => {
    const email = uniqueEmail();
    createdEmails.push(email);
    await admin!.auth.admin.createUser({
      email,
      password: "password12345",
      email_confirm: false,
    });

    const res = await POST(postReq({ email, password: "password12345" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("email_unconfirmed");
    expect(body).not.toHaveProperty("access_token");
  });
});
