/**
 * Tests for the shared authenticated-handler wrapper.
 * Feature 009-account-library, task T005.
 */
import { describe, expect, it, vi } from "vitest";

// The Supabase server client factory reads env at startup; stub it out
// per-test rather than shipping real credentials.
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(),
}));

import { createServerClient } from "@/lib/supabase/server";
import { jsonError, withAuthenticatedHandler } from "./handler";

const mockedCreateClient = vi.mocked(createServerClient);

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
