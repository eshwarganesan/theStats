/**
 * AppSidebar tests — rewritten for the hamburger-toggle redesign.
 *
 * Under the new design (see feature 011 redesign push):
 *   - AppSidebar is a fully controlled component. It receives `open` and
 *     `onClose` from its parent and holds no internal state.
 *   - There is NO 56 px collapsed rail. The sidebar slides completely
 *     off-canvas when closed, and slides on-canvas (w-64) when open.
 *   - The parent `AuthenticatedShell` owns the toggle state and the
 *     hamburger button.
 *   - No localStorage persistence, no matchMedia lookup, no
 *     `document.body[data-sidebar-collapsed]` mirror.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// SidebarNavItem uses next/navigation's usePathname — stub it so the
// AppSidebar tree renders under jsdom.
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

import { AppSidebar } from "./AppSidebar";

describe("AppSidebar (controlled hamburger drawer)", () => {
  it("renders the profile slot at the bottom", () => {
    render(
      <AppSidebar
        open
        onClose={() => {}}
        profileIcon={<div data-testid="profile-icon">profile</div>}
      />,
    );
    expect(screen.getByTestId("profile-icon")).toBeInTheDocument();
  });

  it("marks itself open when open={true} (data-open + aria-hidden reflect state)", () => {
    render(
      <AppSidebar open onClose={() => {}} profileIcon={<span>profile</span>} />,
    );
    const nav = screen.getByRole("navigation", { name: /primary/i });
    expect(nav).toHaveAttribute("data-open", "true");
    expect(nav).toHaveAttribute("aria-hidden", "false");
  });

  it("marks itself closed when open={false} (off-canvas + aria-hidden for AT)", () => {
    const { container } = render(
      <AppSidebar
        open={false}
        onClose={() => {}}
        profileIcon={<span>profile</span>}
      />,
    );
    // Closed nav is aria-hidden — ARIA queries by name won't find it
    // because aria-hidden nulls out the accessible name. Query by the
    // structural aria-label attribute instead.
    const nav = container.querySelector('nav[aria-label="Primary"]');
    expect(nav).not.toBeNull();
    expect(nav).toHaveAttribute("data-open", "false");
    expect(nav).toHaveAttribute("aria-hidden", "true");
  });

  it("mounts the Games nav item pointing to /games", () => {
    render(
      <AppSidebar open onClose={() => {}} profileIcon={<span>profile</span>} />,
    );
    const gamesLink = screen.getByRole("link", { name: "Games" });
    expect(gamesLink).toHaveAttribute("href", "/games");
  });

  it("invokes onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <AppSidebar open onClose={onClose} profileIcon={<span>profile</span>} />,
    );
    const backdrop = screen.getByTestId("sidebar-backdrop");
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("invokes onClose when Escape is pressed while open", () => {
    const onClose = vi.fn();
    render(
      <AppSidebar open onClose={onClose} profileIcon={<span>profile</span>} />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT invoke onClose on Escape when closed (listener detached)", () => {
    const onClose = vi.fn();
    render(
      <AppSidebar
        open={false}
        onClose={onClose}
        profileIcon={<span>profile</span>}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("invokes onClose when a nav item is clicked (drawer dismisses after navigation)", () => {
    const onClose = vi.fn();
    render(
      <AppSidebar open onClose={onClose} profileIcon={<span>profile</span>} />,
    );
    fireEvent.click(screen.getByRole("link", { name: "Games" }));
    expect(onClose).toHaveBeenCalled();
  });
});
