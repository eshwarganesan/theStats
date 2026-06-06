import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted above all top-level statements, so any factory closures
// must reach for variables via vi.hoisted to avoid TDZ errors.
const { getUserMock, redirectMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  redirectMock: vi.fn((url: string): never => {
    throw new Error(`__REDIRECT__${url}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({
    auth: { getUser: getUserMock },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import { requireAuth } from "./require-auth";

describe("requireAuth", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    redirectMock.mockClear();
  });

  it("returns the user + session when authenticated", async () => {
    const user = { id: "u1", email: "alice@example.com" };
    getUserMock.mockResolvedValueOnce({ data: { user }, error: null });

    const result = await requireAuth();
    expect(result.user).toBe(user);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to /login?from=<encoded path> when unauthenticated", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });

    await expect(requireAuth({ from: "/account" })).rejects.toThrow(
      "__REDIRECT__/login?from=%2Faccount",
    );
    expect(redirectMock).toHaveBeenCalledWith("/login?from=%2Faccount");
  });

  it("redirects without `from` when no path is supplied", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(requireAuth()).rejects.toThrow("__REDIRECT__/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login when getUser returns an error", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: new Error("session error"),
    });
    await expect(requireAuth({ from: "/x" })).rejects.toThrow("__REDIRECT__/login?from=%2Fx");
  });
});
