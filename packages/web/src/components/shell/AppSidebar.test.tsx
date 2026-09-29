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
import { beforeEach, describe, expect, it, vi } from "vitest";

// SidebarNavItem uses next/navigation's usePathname — stub it so the
// AppSidebar tree renders under jsdom. Pathname is mutable per test so
// the game-leave-guard block can flip to /game/*.
let mockPathname = "/";
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: pushMock, refresh: vi.fn(), replace: vi.fn() }),
}));

import { AppSidebar } from "./AppSidebar";

beforeEach(() => {
  mockPathname = "/";
  pushMock.mockReset();
});

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

describe("AppSidebar — game-leave confirmation guard", () => {
  it("does NOT show the confirm dialog when clicking a nav link from outside /game", () => {
    mockPathname = "/games";
    render(
      <AppSidebar open onClose={() => {}} profileIcon={<span>profile</span>} />,
    );
    fireEvent.click(screen.getByRole("link", { name: "Games" }));
    expect(
      screen.queryByRole("heading", { name: /leave the current game/i }),
    ).toBeNull();
  });

  it("shows the confirm dialog when clicking a nav link while on /game", () => {
    mockPathname = "/game";
    render(
      <AppSidebar open onClose={() => {}} profileIcon={<span>profile</span>} />,
    );
    fireEvent.click(screen.getByRole("link", { name: "Games" }));
    expect(
      screen.getByRole("heading", { name: /leave the current game/i }),
    ).toBeInTheDocument();
    // Navigation MUST NOT have happened yet.
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows the confirm dialog when on a /game/* subroute (e.g. /game/stats)", () => {
    mockPathname = "/game/stats";
    render(
      <AppSidebar open onClose={() => {}} profileIcon={<span>profile</span>} />,
    );
    fireEvent.click(screen.getByRole("link", { name: "Games" }));
    expect(
      screen.getByRole("heading", { name: /leave the current game/i }),
    ).toBeInTheDocument();
  });

  it("dismisses the dialog and does NOT navigate when Cancel is pressed", () => {
    mockPathname = "/game";
    render(
      <AppSidebar open onClose={() => {}} profileIcon={<span>profile</span>} />,
    );
    fireEvent.click(screen.getByRole("link", { name: "Games" }));
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(
      screen.queryByRole("heading", { name: /leave the current game/i }),
    ).toBeNull();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("navigates to the pending href and dismisses the dialog when OK is pressed", () => {
    mockPathname = "/game";
    render(
      <AppSidebar open onClose={() => {}} profileIcon={<span>profile</span>} />,
    );
    fireEvent.click(screen.getByRole("link", { name: "Games" }));
    fireEvent.click(screen.getByRole("button", { name: /^ok$/i }));
    expect(pushMock).toHaveBeenCalledWith("/games");
    expect(
      screen.queryByRole("heading", { name: /leave the current game/i }),
    ).toBeNull();
  });

  it("intercepts arbitrary anchor clicks in the profile-icon slot too (e.g. /account link)", () => {
    mockPathname = "/game";
    render(
      <AppSidebar
        open
        onClose={() => {}}
        profileIcon={<a href="/account">Account</a>}
      />,
    );
    fireEvent.click(screen.getByRole("link", { name: "Account" }));
    expect(
      screen.getByRole("heading", { name: /leave the current game/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^ok$/i }));
    expect(pushMock).toHaveBeenCalledWith("/account");
  });
});
