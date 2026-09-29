/**
 * Composition test for the authenticated route-group layout.
 *
 * Feature 011 responsibilities the layout must satisfy:
 *   - Mounts the authenticated shell (sidebar + providers) around every
 *     route under `(authenticated)/`.
 *   - Calls `requireAuth()` at the top so every route under
 *     `(authenticated)/` gets a server-side redirect to `/login` when
 *     unauthenticated — belt-and-suspenders for the middleware guard.
 *   - Does NOT reserve a `pl-14` sidebar rail on `<main>` (drawer is
 *     fully off-canvas now).
 *   - Does NOT render the hamburger toggle itself — pages own that.
 *
 * `createServerClient` is mocked with a mutable helper so individual
 * tests can dial in either an authenticated or unauthenticated session.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

/** Convenience — dial in an authenticated response from `getUser`. */
function stubAuthenticated() {
  getUserMock.mockResolvedValue({
    data: { user: { id: "u1", email: "u@example.com" } },
    error: null,
  });
}

/** Convenience — dial in an unauthenticated response from `getUser`. */
function stubUnauthenticated() {
  getUserMock.mockResolvedValue({
    data: { user: null },
    error: null,
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
});

describe("(authenticated)/layout", () => {
  it("redirects to /login when the caller is not signed in (belt-and-suspenders for middleware)", async () => {
    stubUnauthenticated();
    await expect(
      AuthenticatedLayout({ children: <div data-testid="child" /> }),
    ).rejects.toThrow("__REDIRECT__/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("renders the primary navigation sidebar (starts closed) when authenticated", async () => {
    stubAuthenticated();
    await renderLayout();
    // Closed nav is aria-hidden — aria-hidden nulls out the accessible
    // name, so ARIA `getByRole` with `name:` won't find it even with
    // `hidden: true`. Match on the underlying aria-label attribute.
    const nav = document.querySelector('nav[aria-label="Primary"]');
    expect(nav).not.toBeNull();
    expect(nav).toHaveAttribute("data-open", "false");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("does NOT render a hamburger button in the layout itself — pages own that placement", async () => {
    stubAuthenticated();
    await renderLayout();
    expect(
      screen.queryByRole("button", { name: /open navigation menu/i }),
    ).toBeNull();
  });

  it("wraps children in a <main> with no pl-14 rail inset (sidebar is fully off-canvas)", async () => {
    stubAuthenticated();
    await renderLayout();
    const child = screen.getByTestId("child");
    const main = child.closest("main");
    expect(main).not.toBeNull();
    expect(main?.className.split(/\s+/)).not.toContain("pl-14");
    expect(main).toHaveClass("min-h-[100dvh]");
  });
});
