/**
 * Unit tests for the shared sign-in flow, driven through a fake Supabase
 * client so every branch (validation, backoff, provider errors,
 * unconfirmed users) runs without the hosted project. The end-to-end
 * paths are covered by tests/integration/auth/sign-in.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type * as Throttle from "./attempt-throttle";
import { checkAuthAttempt, recordAuthAttempt } from "./attempt-throttle";
import { passwordSignIn, requestId } from "./password-sign-in";

vi.mock("./attempt-throttle", async (importOriginal) => ({
  ...(await importOriginal<typeof Throttle>()),
  checkAuthAttempt: vi.fn(),
  recordAuthAttempt: vi.fn(),
}));
const checkMock = vi.mocked(checkAuthAttempt);
const recordMock = vi.mocked(recordAuthAttempt);

interface FakeOptions {
  signIn?: { data?: unknown; error?: unknown };
  signOutThrows?: boolean;
}

function fakeClient(opts: FakeOptions = {}) {
  const signInWithPassword = vi.fn(
    async () =>
      opts.signIn ?? {
        data: {
          user: { id: "u1", email_confirmed_at: "2026-01-01T00:00:00Z" },
          session: { access_token: "a", refresh_token: "r" },
        },
        error: null,
      },
  );
  const signOut = vi.fn(async () => {
    if (opts.signOutThrows) throw new Error("boom");
    return { error: null };
  });
  const client = { auth: { signInWithPassword, signOut } };
  return {
    client: client as unknown as SupabaseClient<Database>,
    signInWithPassword,
    signOut,
  };
}

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const creds = { email: "Coach@Example.com ", password: "pw" };

async function errorOf(result: Awaited<ReturnType<typeof passwordSignIn>>) {
  if (result.ok) throw new Error("expected failure");
  return {
    status: result.response.status,
    body: (await result.response.json()) as { error: Record<string, unknown> },
  };
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  checkMock.mockReset().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  recordMock.mockReset().mockResolvedValue();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("passwordSignIn", () => {
  it("returns the user and session on success and records the attempt", async () => {
    const fake = fakeClient();
    const result = await passwordSignIn(
      req(creds, { "x-forwarded-for": "203.0.113.9, 10.0.0.1" }),
      () => fake.client,
      "token",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user?.id).toBe("u1");
    expect(result.session?.access_token).toBe("a");
    expect(fake.signInWithPassword).toHaveBeenCalledWith({
      email: "coach@example.com",
      password: "pw",
    });
    expect(checkMock).toHaveBeenCalledWith(["e:coach@example.com", "ip:203.0.113.9"]);
    expect(recordMock).toHaveBeenCalledWith(["e:coach@example.com", "ip:203.0.113.9"], true);
  });

  it("accepts an async client factory", async () => {
    const fake = fakeClient();
    const result = await passwordSignIn(req(creds), async () => fake.client, "sign-in");
    expect(result.ok).toBe(true);
  });

  it("rejects a non-JSON body without touching Supabase", async () => {
    const getClient = vi.fn();
    const { status, body } = await errorOf(
      await passwordSignIn(req("{nope"), getClient, "token"),
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe("invalid_input");
    expect(getClient).not.toHaveBeenCalled();
  });

  it("names the offending field on a schema failure", async () => {
    const { status, body } = await errorOf(
      await passwordSignIn(req({ email: "x", password: "pw" }), vi.fn(), "token"),
    );
    expect(status).toBe(400);
    expect(body.error.details).toMatchObject({ field: "email" });
  });

  it("reports (root) when the body isn't an object", async () => {
    const { body } = await errorOf(await passwordSignIn(req(42), vi.fn(), "token"));
    expect(body.error.details).toMatchObject({ field: "(root)" });
  });

  it("returns 500 when the throttle lookup fails", async () => {
    const fake = fakeClient();
    checkMock.mockResolvedValue(null);
    const { status } = await errorOf(await passwordSignIn(req(creds), () => fake.client, "t"));
    expect(status).toBe(500);
    expect(fake.signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After while backed off", async () => {
    const fake = fakeClient();
    checkMock.mockResolvedValue({ allowed: false, retryAfterSeconds: 8 });
    const result = await passwordSignIn(req(creds), () => fake.client, "t");
    if (result.ok) throw new Error("expected failure");
    expect(result.response.status).toBe(429);
    expect(result.response.headers.get("Retry-After")).toBe("8");
    expect(fake.signInWithPassword).not.toHaveBeenCalled();
  });

  it("maps provider rate limits to 429 / 60s", async () => {
    for (const error of [
      { message: "Rate limit exceeded", code: "" },
      { message: "", code: "over_request_rate_limit" },
      { message: "", code: "over_email_send_rate_limit" },
    ]) {
      const fake = fakeClient({ signIn: { data: { user: null, session: null }, error } });
      const { status, body } = await errorOf(
        await passwordSignIn(req(creds), () => fake.client, "t"),
      );
      expect(status).toBe(429);
      expect(body.error.retry_after_seconds).toBe(60);
      expect(recordMock).toHaveBeenLastCalledWith(expect.any(Array), false);
    }
  });

  it("returns 403 and signs out when the provider says unconfirmed", async () => {
    for (const [error, signOutThrows] of [
      [{ message: "Email not confirmed" }, false],
      [{ message: "", code: "email_not_confirmed" }, true],
    ] as const) {
      const fake = fakeClient({
        signIn: { data: { user: null, session: null }, error },
        signOutThrows,
      });
      const { status, body } = await errorOf(
        await passwordSignIn(req(creds), () => fake.client, "t"),
      );
      expect(status).toBe(403);
      expect(body.error.code).toBe("email_unconfirmed");
      expect(fake.signOut).toHaveBeenCalled();
    }
  });

  it("returns the identical generic 401 for any other provider error", async () => {
    const bodies: string[] = [];
    for (const error of [{ message: "Invalid login credentials" }, {}]) {
      const fake = fakeClient({ signIn: { data: { user: null, session: null }, error } });
      const result = await passwordSignIn(req(creds), () => fake.client, "t");
      if (result.ok) throw new Error("expected failure");
      expect(result.response.status).toBe(401);
      bodies.push(await result.response.text());
    }
    expect(bodies[0]).toBe(bodies[1]);
  });

  it("returns 403 when sign-in succeeds for an unconfirmed user", async () => {
    for (const signOutThrows of [false, true]) {
      const fake = fakeClient({
        signIn: {
          data: { user: { id: "u2", email_confirmed_at: null }, session: {} },
          error: null,
        },
        signOutThrows,
      });
      const { status } = await errorOf(
        await passwordSignIn(req(creds), () => fake.client, "t"),
      );
      expect(status).toBe(403);
      expect(fake.signOut).toHaveBeenCalled();
    }
  });

  it("tolerates a success response without a user", async () => {
    const fake = fakeClient({ signIn: { data: { user: null, session: null }, error: null } });
    const result = await passwordSignIn(req(creds), () => fake.client, "t");
    expect(result).toEqual({ ok: true, user: null, session: null });
  });
});

describe("requestId", () => {
  it("falls back when crypto.randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", {});
    expect(requestId()).toMatch(/^req_/);
    vi.unstubAllGlobals();
  });
});
