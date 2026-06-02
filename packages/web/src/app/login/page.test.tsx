import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { getUserMock, redirectMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  redirectMock: vi.fn((url: string): never => {
    throw new Error(`__REDIRECT__${url}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import LoginPage from "./page";

describe("<LoginPage />", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    redirectMock.mockClear();
  });

  it("renders the LoginPanel when no session exists", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
    const ui = await LoginPage({ searchParams: Promise.resolve({}) });
    render(ui);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("redirects to / when an authenticated user visits the login page (FR-014)", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "u_1", email: "alice@example.com", email_confirmed_at: null } },
      error: null,
    });
    await expect(
      LoginPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("__REDIRECT__/");
  });

  it("redirects to ?from when an authenticated user lands with a deep-link from param", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "u_1", email: "alice@example.com", email_confirmed_at: null } },
      error: null,
    });
    await expect(
      LoginPage({ searchParams: Promise.resolve({ from: "/account" }) }),
    ).rejects.toThrow("__REDIRECT__/account");
  });

  it("ignores absolute-URL `from` to defeat open-redirect attacks", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "u_1", email: "alice@example.com", email_confirmed_at: null } },
      error: null,
    });
    await expect(
      LoginPage({ searchParams: Promise.resolve({ from: "https://evil.com" }) }),
    ).rejects.toThrow("__REDIRECT__/");
  });

  it("renders an inline error if ?error=confirmation_failed is present", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
    const ui = await LoginPage({
      searchParams: Promise.resolve({ error: "confirmation_failed" }),
    });
    render(ui);
    expect(screen.getByRole("alert")).toHaveTextContent(/confirmation/i);
  });
});
