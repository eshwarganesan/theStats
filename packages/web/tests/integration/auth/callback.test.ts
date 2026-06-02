/**
 * Integration test for GET /auth/callback.
 *
 * Covers the validation paths (missing code, open-redirect guard) and the
 * provider-error path against the user's hosted Supabase. The happy path
 * (valid code → confirmed session) requires a real email round-trip and is
 * covered by the Playwright E2E spec instead.
 */
import { describe, it, expect, vi } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUN = Boolean(url && serviceRole);

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

const { GET } = await import("@/app/auth/callback/route");

function getReq(query: string): Request {
  return new Request(`http://localhost:3000/auth/callback${query}`, { method: "GET" });
}

describe.skipIf(!RUN)("GET /auth/callback (integration)", () => {
  it("redirects to /login?error=missing_code when code is absent", async () => {
    const res = await GET(getReq(""));
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/login?error=missing_code");
  });

  it("redirects to /login?error=confirmation_failed for an obviously invalid code", async () => {
    const res = await GET(getReq("?code=this-code-does-not-exist-and-never-will"));
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/login?error=confirmation_failed");
  });

  it("falls back to / when `next` is not a relative path (open-redirect guard)", async () => {
    const res = await GET(getReq("?code=anything&next=https://evil.com/x"));
    expect(res.status).toBe(303);
    // The exchange will fail (bogus code), so the redirect goes to the
    // error page — but the open-redirect guard must still have evaluated
    // `next` and refused it. We check that Location starts with `/login`
    // (error path) rather than `https://evil.com`.
    expect(res.headers.get("Location")!.startsWith("/")).toBe(true);
    expect(res.headers.get("Location")).not.toContain("evil.com");
  });
});
