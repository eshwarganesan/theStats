/**
 * Composition test for the authenticated route-group layout.
 *
 * Feature 011 responsibilities the layout must satisfy:
 *   - Mounts the authenticated shell (sidebar + providers) around every
 *     route under `(authenticated)/`.
 *   - Calls `requireAuth()` at the top so every route under
 *     `(authenticated)/` gets a server-side redirect to `/login` when
 *     unauthenticated — belt-and-suspenders for the middleware guard.
 *   - Passes the current pathname+search (from middleware's `x-pathname`
 *     header) as `from` to `requireAuth`, so the deep-link round-trip
 *     survives even when the layout is the gate that fires.
 *   - Does NOT reserve a `pl-14` sidebar rail on `<main>` (drawer is
 *     fully off-canvas now).
 *   - Does NOT render the hamburger toggle itself — pages own that.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUserMock, redirectMock, headersMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  redirectMock: vi.fn((url: string): never => {
    throw new Error(`__REDIRECT__${url}`);
  }),
  headersMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({
    auth: { getUser: getUserMock },
  }),
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

// AppSidebar (nested inside the shell inside the layout) consumes
// usePathname AND useRouter from next/navigation — stub both. `redirect`
// is used by `requireAuth`; we throw an identifiable error so tests can
// assert on the destination.
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

import AuthenticatedLayout from "./layout";
import { StorageAvailabilityProvider } from "@/lib/storageAvailability";

function stubAuthenticated() {
  getUserMock.mockResolvedValue({
    data: { user: { id: "u1", email: "u@example.com" } },
    error: null,
  });
}

function stubUnauthenticated() {
  getUserMock.mockResolvedValue({
    data: { user: null },
    error: null,
  });
}

function stubXPathname(value: string | null) {
  headersMock.mockResolvedValue({
    get: (name: string) => (name === "x-pathname" ? value : null),
  });
}

const wrap = (ui: React.ReactNode) =>
  render(<StorageAvailabilityProvider>{ui}</StorageAvailabilityProvider>);

async function renderLayout() {
  const jsx = await AuthenticatedLayout({
    children: <div data-testid="child" />,
  });
  wrap(jsx);
}

beforeEach(() => {
  getUserMock.mockReset();
  redirectMock.mockClear();
  headersMock.mockReset();
});

describe("(authenticated)/layout", () => {
  it("redirects to /login?from=<x-pathname> when unauthenticated", async () => {
    stubUnauthenticated();
    stubXPathname("/games");
    await expect(
      AuthenticatedLayout({ children: <div data-testid="child" /> }),
    ).rejects.toThrow("__REDIRECT__/login?from=%2Fgames");
    expect(redirectMock).toHaveBeenCalledWith("/login?from=%2Fgames");
  });

  it("preserves the query string in `from` (x-pathname includes search)", async () => {
    stubUnauthenticated();
    stubXPathname("/games/abc?tab=history");
    await expect(
      AuthenticatedLayout({ children: <div data-testid="child" /> }),
    ).rejects.toThrow("__REDIRECT__/login?from=%2Fgames%2Fabc%3Ftab%3Dhistory");
  });

  it("redirects to /login (no from) when x-pathname is absent", async () => {
    stubUnauthenticated();
    stubXPathname(null);
    await expect(
      AuthenticatedLayout({ children: <div data-testid="child" /> }),
    ).rejects.toThrow("__REDIRECT__/login");
  });

  it("discards a poisoned x-pathname (protocol-relative) rather than open-redirecting", async () => {
    stubUnauthenticated();
    stubXPathname("//evil.example.com/x");
    await expect(
      AuthenticatedLayout({ children: <div data-testid="child" /> }),
    ).rejects.toThrow("__REDIRECT__/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("renders the primary navigation sidebar (starts closed) when authenticated", async () => {
    stubAuthenticated();
    stubXPathname("/games");
    await renderLayout();
    const nav = document.querySelector('nav[aria-label="Primary"]');
    expect(nav).not.toBeNull();
    expect(nav).toHaveAttribute("data-open", "false");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("does NOT render a hamburger button in the layout itself — pages own that placement", async () => {
    stubAuthenticated();
    stubXPathname("/games");
    await renderLayout();
    expect(
      screen.queryByRole("button", { name: /open navigation menu/i }),
    ).toBeNull();
  });

  it("wraps children in a <main> with no pl-14 rail inset (sidebar is fully off-canvas)", async () => {
    stubAuthenticated();
    stubXPathname("/games");
    await renderLayout();
    const child = screen.getByTestId("child");
    const main = child.closest("main");
    expect(main).not.toBeNull();
    expect(main?.className.split(/\s+/)).not.toContain("pl-14");
    expect(main).toHaveClass("min-h-[100dvh]");
  });
});
