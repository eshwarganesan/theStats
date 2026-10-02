/**
 * AuthenticatedShell tests — the client-side wrapper that owns the
 * open/closed state of the navigation drawer for every authenticated
 * page. The shell:
 *   - Renders its children directly (no wrapping `<main>`) — each
 *     page or route-level layout owns its own `<main>`, which keeps
 *     the authenticated routes to a single `<main>` element and
 *     prevents the SSR/hydration-time nested-`<main>` mismatch.
 *   - Provides a `SidebarToggleContext` so `<HamburgerButton />` (mounted
 *     by each page) can flip the drawer without any prop plumbing.
 *   - Renders the `<AppSidebar>` drawer itself.
 *   - Does NOT render a hamburger — pages own that placement.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

// AppSidebar (via SidebarNavItem + the game-leave guard) uses
// next/navigation's usePathname AND useRouter — stub both.
import { vi } from "vitest";
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

import { AuthenticatedShell } from "./AuthenticatedShell";
import { useSidebarToggle } from "./SidebarToggleContext";

/** Consumer that exposes toggle context state via testable DOM. */
function ContextProbe() {
  const { open, toggle, close } = useSidebarToggle();
  return (
    <div>
      <span data-testid="probe-open">{open ? "open" : "closed"}</span>
      <button type="button" onClick={toggle} data-testid="probe-toggle">
        toggle
      </button>
      <button type="button" onClick={close} data-testid="probe-close">
        close
      </button>
    </div>
  );
}

describe("AuthenticatedShell", () => {
  it("renders its children directly — pages own their own <main>", () => {
    render(
      <AuthenticatedShell profileIcon={<span>p</span>}>
        <div data-testid="page-content" />
      </AuthenticatedShell>,
    );
    // Children render, but the shell itself does NOT wrap them in a
    // `<main>` — that is each page/route-layout's responsibility, so
    // the authenticated routes stay at exactly one `<main>` per page.
    const child = screen.getByTestId("page-content");
    expect(child).toBeInTheDocument();
    expect(child.closest("main")).toBeNull();
  });

  it("does NOT render a hamburger button itself — pages own placement", () => {
    render(
      <AuthenticatedShell profileIcon={<span>p</span>}>
        <div />
      </AuthenticatedShell>,
    );
    expect(
      screen.queryByRole("button", { name: /open navigation menu/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /close navigation menu/i }),
    ).toBeNull();
  });

  it("provides SidebarToggleContext to its children (starts closed)", () => {
    render(
      <AuthenticatedShell profileIcon={<span>p</span>}>
        <ContextProbe />
      </AuthenticatedShell>,
    );
    expect(screen.getByTestId("probe-open")).toHaveTextContent("closed");
  });

  it("toggling via context flips the sidebar's data-open attribute", () => {
    render(
      <AuthenticatedShell profileIcon={<span>p</span>}>
        <ContextProbe />
      </AuthenticatedShell>,
    );
    const nav = document.querySelector('nav[aria-label="Primary"]');
    expect(nav).toHaveAttribute("data-open", "false");
    act(() => {
      fireEvent.click(screen.getByTestId("probe-toggle"));
    });
    expect(nav).toHaveAttribute("data-open", "true");
    expect(screen.getByTestId("probe-open")).toHaveTextContent("open");
  });

  it("close() via context closes the drawer", () => {
    render(
      <AuthenticatedShell profileIcon={<span>p</span>}>
        <ContextProbe />
      </AuthenticatedShell>,
    );
    // Open first via toggle.
    act(() => {
      fireEvent.click(screen.getByTestId("probe-toggle"));
    });
    // Then close via close().
    act(() => {
      fireEvent.click(screen.getByTestId("probe-close"));
    });
    const nav = document.querySelector('nav[aria-label="Primary"]');
    expect(nav).toHaveAttribute("data-open", "false");
  });

  it("backdrop click while open closes the drawer", () => {
    render(
      <AuthenticatedShell profileIcon={<span>p</span>}>
        <ContextProbe />
      </AuthenticatedShell>,
    );
    act(() => {
      fireEvent.click(screen.getByTestId("probe-toggle"));
    });
    fireEvent.click(screen.getByTestId("sidebar-backdrop"));
    const nav = document.querySelector('nav[aria-label="Primary"]');
    expect(nav).toHaveAttribute("data-open", "false");
  });
});
