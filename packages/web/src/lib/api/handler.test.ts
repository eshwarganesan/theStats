/**
 * Tests for the shared authenticated-handler wrapper.
 * Feature 009-account-library, task T005.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// The Supabase client factories read env at startup; stub them out
// per-test rather than shipping real credentials.
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(),
}));
vi.mock("@/lib/supabase/stateless", () => ({
  createStatelessClient: vi.fn(),
}));

import { createServerClient } from "@/lib/supabase/server";
import { createStatelessClient } from "@/lib/supabase/stateless";
import { jsonError, readCredential, withAuthenticatedHandler } from "./handler";

const mockedCreateClient = vi.mocked(createServerClient);
const mockedCreateStateless = vi.mocked(createStatelessClient);

beforeEach(() => {
  mockedCreateClient.mockReset();
  mockedCreateStateless.mockReset();
});

function fakeSupabase(user: { id: string; email: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : { message: "no session" },
      }),
    },
  } as unknown as Awaited<ReturnType<typeof createServerClient>>;
}

describe("withAuthenticatedHandler", () => {
  it("returns 401 with { error: { code: 'unauthenticated' } } when no session", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase(null));

    const handler = withAuthenticatedHandler("games:list", async () => {
      throw new Error("wrapped handler must NOT be invoked when unauthenticated");
    });

    const res = await handler(
      new Request("http://localhost/api/games", { method: "GET" }),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      error: { code: "unauthenticated", message: "Sign in to continue." },
    });
  });

  it("invokes the wrapped handler with the authenticated user id when a session exists", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({ id: "user-1", email: "u@example.com" }),
    );

    const handler = withAuthenticatedHandler("games:list", async (_request, { userId }) => {
      return new Response(JSON.stringify({ ok: true, userId }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const res = await handler(
      new Request("http://localhost/api/games", { method: "GET" }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, userId: "user-1" });
  });

  it("returns 500 with a generic error envelope when the wrapped handler throws", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({ id: "user-1", email: "u@example.com" }),
    );

    const handler = withAuthenticatedHandler("games:list", async () => {
      throw new Error("boom");
    });

    const res = await handler(
      new Request("http://localhost/api/games", { method: "GET" }),
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error?.code).toBe("internal_error");
    // Handler must NOT leak the error message ("boom") to the client per
    // Constitution Principle VI.
    expect(body.error?.message).not.toContain("boom");
  });
});

describe("withAuthenticatedHandler with a bearer token", () => {
  function bearerRequest(authorization: string): Request {
    return new Request("http://localhost/api/games", {
      method: "GET",
      headers: { Authorization: authorization },
    });
  }

  let seen: { userId: string; supabase: unknown } | null = null;
  const echoUser = withAuthenticatedHandler("games:list", async (_request, ctx) => {
    seen = { userId: ctx.userId, supabase: ctx.supabase };
    return new Response(null, { status: 204 });
  });
  beforeEach(() => {
    seen = null;
  });

  it("verifies the token and queries as that user, ignoring cookies", async () => {
    const client = fakeSupabase({ id: "ios-user", email: "i@example.com" });
    mockedCreateStateless.mockReturnValue(
      client as unknown as ReturnType<typeof createStatelessClient>,
    );

    const res = await echoUser(bearerRequest("Bearer header.payload.sig"));

    expect(res.status).toBe(204);
    expect(seen).toEqual({ userId: "ios-user", supabase: client });
    expect(seen!.supabase).toBe(client);
    expect(mockedCreateStateless).toHaveBeenCalledWith("header.payload.sig");
    expect(client.auth.getUser).toHaveBeenCalledWith("header.payload.sig");
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("returns 401 for a rejected token without falling back to the cookie", async () => {
    mockedCreateStateless.mockReturnValue(
      fakeSupabase(null) as unknown as ReturnType<typeof createStatelessClient>,
    );
    mockedCreateClient.mockResolvedValue(fakeSupabase({ id: "cookie-user", email: "c@example.com" }));

    const res = await echoUser(bearerRequest("Bearer expired"));

    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthenticated");
    expect(seen).toBeNull();
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("returns 401 for a malformed Bearer header without verifying anything", async () => {
    const res = await echoUser(bearerRequest("Bearer"));
    expect(res.status).toBe(401);
    expect(mockedCreateStateless).not.toHaveBeenCalled();
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("logs which credential the request used", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    mockedCreateStateless.mockReturnValue(
      fakeSupabase({ id: "ios-user", email: "i@example.com" }) as unknown as ReturnType<
        typeof createStatelessClient
      >,
    );

    await echoUser(bearerRequest("Bearer t"));

    const lines = log.mock.calls.map((call) => JSON.parse(String(call[0])));
    expect(lines.map((l) => [l.auth, l.outcome])).toEqual([
      ["bearer", "entry"],
      ["bearer", "ok"],
    ]);
    log.mockRestore();
  });
});

describe("readCredential", () => {
  function withHeader(value?: string): Request {
    return new Request("http://localhost/api/games", {
      headers: value === undefined ? {} : { Authorization: value },
    });
  }

  it("uses the cookie when there is no Authorization header", () => {
    expect(readCredential(withHeader())).toEqual({ kind: "cookie" });
  });

  it("reads a Bearer token, case-insensitively and ignoring extra spaces", () => {
    expect(readCredential(withHeader("Bearer abc.def"))).toEqual({ kind: "bearer", token: "abc.def" });
    expect(readCredential(withHeader("bearer   abc.def  "))).toEqual({
      kind: "bearer",
      token: "abc.def",
    });
  });

  it("flags a Bearer header without exactly one token as malformed", () => {
    expect(readCredential(withHeader("Bearer"))).toEqual({ kind: "malformed" });
    expect(readCredential(withHeader("Bearer a b"))).toEqual({ kind: "malformed" });
  });

  it("leaves other schemes to the cookie", () => {
    expect(readCredential(withHeader("Basic dXNlcjpwYXNz"))).toEqual({ kind: "cookie" });
    expect(readCredential(withHeader("BearerToken x"))).toEqual({ kind: "cookie" });
  });
});

describe("jsonError", () => {
  it("returns the expected envelope shape and status code", async () => {
    const res = jsonError("invalid_body", "Body did not match the expected schema.", 400);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      error: {
        code: "invalid_body",
        message: "Body did not match the expected schema.",
      },
    });
  });
});
