import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { getUserMock, refreshMock, pushMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  refreshMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: pushMock }),
}));

import { AuthPill } from "./auth-pill";

describe("<AuthPill />", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    refreshMock.mockReset();
    pushMock.mockReset();
  });

  it("renders a 'Sign in' link when no user session exists", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
    const ui = await AuthPill();
    render(ui);
    const link = screen.getByRole("link", { name: /sign in/i });
    expect(link).toHaveAttribute("href", "/login");
    // No sign-out button is rendered for anonymous viewers.
    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
  });

  it("renders the email + 'Pending confirmation' badge for a signed-in unconfirmed user", async () => {
    getUserMock.mockResolvedValueOnce({
      data: {
        user: { id: "u_1", email: "alice@example.com", email_confirmed_at: null },
      },
      error: null,
    });
    const ui = await AuthPill();
    render(ui);
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText(/pending confirmation/i)).toBeInTheDocument();
    // The sign-out button is available even when the email is unconfirmed —
    // shared-device safety per spec US3.
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("renders just the email for a confirmed user", async () => {
    getUserMock.mockResolvedValueOnce({
      data: {
        user: { id: "u_1", email: "alice@example.com", email_confirmed_at: "2026-05-31T00:00:00Z" },
      },
      error: null,
    });
    const ui = await AuthPill();
    render(ui);
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.queryByText(/pending confirmation/i)).not.toBeInTheDocument();
  });

  it("falls back to anonymous treatment when getUser returns an error", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: new Error("network down"),
    });
    const ui = await AuthPill();
    render(ui);
    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
  });

  describe("sign-out (US3)", () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    let assignMock: ReturnType<typeof vi.fn>;
    const originalLocation = window.location;

    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      assignMock = vi.fn();
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: { ...originalLocation, assign: assignMock },
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: originalLocation,
      });
    });

    it("clicking sign-out POSTs to /api/auth/sign-out and then redirects to / via a full document navigation", async () => {
      getUserMock.mockResolvedValueOnce({
        data: {
          user: { id: "u_1", email: "alice@example.com", email_confirmed_at: "2026-05-31T00:00:00Z" },
        },
        error: null,
      });
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

      const ui = await AuthPill();
      const user = userEvent.setup();
      render(ui);

      await user.click(screen.getByRole("button", { name: /sign out/i }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const [path, init] = fetchMock.mock.calls[0]!;
      expect(path).toBe("/api/auth/sign-out");
      expect((init as RequestInit).method).toBe("POST");
      await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/"));
    });

    it("disables the sign-out button while the request is in flight", async () => {
      getUserMock.mockResolvedValueOnce({
        data: {
          user: { id: "u_1", email: "alice@example.com", email_confirmed_at: "2026-05-31T00:00:00Z" },
        },
        error: null,
      });
      let resolveFetch: (() => void) | undefined;
      fetchMock.mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = () => resolve(new Response(null, { status: 204 }));
          }),
      );

      const ui = await AuthPill();
      const user = userEvent.setup();
      render(ui);

      const btn = screen.getByRole("button", { name: /sign out/i });
      await user.click(btn);
      await waitFor(() => expect(btn).toBeDisabled());

      resolveFetch?.();
      await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/"));
    });
  });
});
