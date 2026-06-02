import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { getUserMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

import { AuthPill } from "./auth-pill";

describe("<AuthPill /> (US1 scope)", () => {
  beforeEach(() => {
    getUserMock.mockReset();
  });

  it("renders a 'Sign in' link when no user session exists", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
    const ui = await AuthPill();
    render(ui);
    const link = screen.getByRole("link", { name: /sign in/i });
    expect(link).toHaveAttribute("href", "/login");
  });

  it("renders the email + 'Pending confirmation' badge when session exists but email is unconfirmed", async () => {
    getUserMock.mockResolvedValueOnce({
      data: {
        user: {
          id: "u_1",
          email: "alice@example.com",
          email_confirmed_at: null,
        },
      },
      error: null,
    });
    const ui = await AuthPill();
    render(ui);
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText(/pending confirmation/i)).toBeInTheDocument();
  });

  it("renders just the email when the user is confirmed", async () => {
    getUserMock.mockResolvedValueOnce({
      data: {
        user: {
          id: "u_1",
          email: "alice@example.com",
          email_confirmed_at: "2026-05-31T00:00:00Z",
        },
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
});
