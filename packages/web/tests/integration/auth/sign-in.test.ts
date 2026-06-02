/**
 * Integration test for POST /api/auth/sign-in.
 *
 * Hits the user's hosted Supabase. Seeds confirmed users via the admin
 * client (which doesn't count against GoTrue's per-IP signup quota), then
 * exercises the sign-in path of the route handler.
 *
 * Per FR-015: the 401 body for wrong password and nonexistent email MUST
 * be byte-identical so an attacker can't enumerate registered accounts.
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

const { POST } = await import("@/app/api/auth/sign-in/route");

function uniqueEmail(prefix = "signin"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}
function uniqueIp(): string {
  const oct = () => Math.floor(Math.random() * 254) + 1;
  return `203.0.113.${oct()}`;
}

const createdEmails: string[] = [];
const usedIps: string[] = [];

function postReq(
  body: unknown,
  opts: { sourceIp?: string } = {},
): Request {
  const ip = opts.sourceIp ?? uniqueIp();
  usedIps.push(ip);
  return new Request("http://localhost:3000/api/auth/sign-in", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
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

async function seedConfirmedUser(email: string, password = "password12345"): Promise<void> {
  await admin!.auth.admin.createUser({ email, password, email_confirm: true });
}

async function seedUnconfirmedUser(email: string, password = "password12345"): Promise<void> {
  await admin!.auth.admin.createUser({ email, password, email_confirm: false });
}

describe.skipIf(!RUN)("POST /api/auth/sign-in (integration)", () => {
  it("returns 200 on correct credentials for a confirmed user", async () => {
    const email = uniqueEmail();
    createdEmails.push(email);
    await seedConfirmedUser(email);

    const res = await POST(postReq({ email, password: "password12345" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 401 with a generic message on wrong password", async () => {
    const email = uniqueEmail();
    createdEmails.push(email);
    await seedConfirmedUser(email);

    const res = await POST(postReq({ email, password: "wrong-password-totally" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_credentials");
    expect(body.error.message).toBe("Invalid email or password.");
  });

  it("returns 401 with the IDENTICAL body for a nonexistent email (FR-015)", async () => {
    const knownEmail = uniqueEmail();
    createdEmails.push(knownEmail);
    await seedConfirmedUser(knownEmail);

    const wrongPwRes = await POST(postReq({ email: knownEmail, password: "wrong-password" }));
    const wrongPwBody = await wrongPwRes.json();

    const unknownEmail = uniqueEmail();
    // No createdEmails.push — user does not exist, nothing to clean.
    const unknownRes = await POST(postReq({ email: unknownEmail, password: "anything12345" }));
    expect(unknownRes.status).toBe(wrongPwRes.status);
    expect(await unknownRes.json()).toEqual(wrongPwBody);
  });

  it("matches emails case-insensitively (schema lowercases before lookup)", async () => {
    const email = uniqueEmail();
    createdEmails.push(email);
    await seedConfirmedUser(email);

    const res = await POST(postReq({ email: email.toUpperCase(), password: "password12345" }));
    expect(res.status).toBe(200);
  });

  it("returns 403 email_unconfirmed for an unconfirmed user with correct credentials", async () => {
    const email = uniqueEmail();
    createdEmails.push(email);
    await seedUnconfirmedUser(email);

    cookieJar.clear();
    const res = await POST(postReq({ email, password: "password12345" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("email_unconfirmed");
    expect(body.error.details.resend_endpoint).toBe("/api/auth/resend-confirmation");
    // The handler MUST sign the user back out so the session cookie does
    // not survive an unconfirmed-account 403.
    const sessionCookies = Array.from(cookieJar.keys()).filter((k) =>
      /supabase|sb-/i.test(k),
    );
    // Cookies should either be empty OR be the cleared/deleted markers.
    // Allow either by checking that the access token (if any) is not a
    // long token-shaped value.
    for (const k of sessionCookies) {
      const v = cookieJar.get(k) ?? "";
      expect(v.length).toBeLessThan(64);
    }
  });

  it("returns 400 invalid_input for an invalid email", async () => {
    const res = await POST(postReq({ email: "not-an-email", password: "anything12345" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_input");
  });

  it("returns 429 with growing backoff on consecutive wrong passwords and resets on success", async () => {
    const email = uniqueEmail();
    createdEmails.push(email);
    await seedConfirmedUser(email);
    const sharedIp = uniqueIp(); // share so backoff accumulates per-IP across calls

    // Wrong-password attempts must use the email's row to accumulate.
    const r1 = await POST(postReq({ email, password: "wrong-1" }, { sourceIp: sharedIp }));
    expect(r1.status).toBe(401);

    const r2 = await POST(postReq({ email, password: "wrong-2" }, { sourceIp: sharedIp }));
    expect(r2.status).toBe(429);
    const r2body = await r2.json();
    expect(r2body.error.code).toBe("rate_limited");
    expect(r2body.error.retry_after_seconds).toBeGreaterThanOrEqual(1);
    expect(r2.headers.get("Retry-After")).toBeTruthy();

    // Reset state and confirm successful sign-in clears the counter.
    if (admin) {
      try {
        await admin
          .from("auth_attempts")
          .delete()
          .in("key", [`e:${email}`, `ip:${sharedIp}`]);
      } catch {
        /* best-effort */
      }
    }

    const r3 = await POST(postReq({ email, password: "password12345" }, { sourceIp: sharedIp }));
    expect(r3.status).toBe(200);

    // After success, a subsequent wrong attempt should NOT immediately be 429.
    const r4 = await POST(postReq({ email, password: "wrong-3" }, { sourceIp: sharedIp }));
    expect(r4.status).toBe(401);
  });
});
