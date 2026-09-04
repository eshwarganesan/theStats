/**
 * SidebarNavItem tests.
 * Feature 010-games-library, task T006.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// usePathname is a client-side hook — return a settable pathname per test.
let currentPath = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
}));

import { SidebarNavItem } from "./SidebarNavItem";

const COLLAPSED_ATTR = "data-sidebar-collapsed";

function setCollapsed(collapsed: boolean) {
  act(() => {
    document.body.setAttribute(COLLAPSED_ATTR, collapsed ? "true" : "false");
  });
}

const testIcon = <svg data-testid="test-icon" />;

beforeEach(() => {
  currentPath = "/";
  document.body.removeAttribute(COLLAPSED_ATTR);
});

afterEach(() => {
  document.body.removeAttribute(COLLAPSED_ATTR);
});

describe("SidebarNavItem", () => {
  it("renders an accessible link to href with an aria-label of the label", () => {
    render(<SidebarNavItem href="/games" label="Games" icon={testIcon} />);
    const link = screen.getByRole("link", { name: "Games" });
    expect(link).toHaveAttribute("href", "/games");
  });

  it("renders icon-only (sr-only label) when the body is data-sidebar-collapsed=true", () => {
    setCollapsed(true);
    render(<SidebarNavItem href="/games" label="Games" icon={testIcon} />);
    const link = screen.getByRole("link", { name: "Games" });
    // Icon is present.
    expect(screen.getByTestId("test-icon")).toBeInTheDocument();
    // The visible label span is not present; only the sr-only companion.
    const srOnly = link.querySelector(".sr-only");
    expect(srOnly).not.toBeNull();
    expect(srOnly?.textContent).toBe("Games");
  });

  it("renders icon + visible label when the body is data-sidebar-collapsed=false", () => {
    setCollapsed(false);
    render(<SidebarNavItem href="/games" label="Games" icon={testIcon} />);
    // Visible label present, sr-only companion absent.
    expect(screen.getByText("Games")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Games" });
    expect(link.querySelector(".sr-only")).toBeNull();
  });

  it("marks itself active when pathname equals href exactly", () => {
    currentPath = "/games";
    render(<SidebarNavItem href="/games" label="Games" icon={testIcon} />);
    const link = screen.getByRole("link", { name: "Games" });
    expect(link).toHaveAttribute("data-active", "true");
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("marks itself active when pathname is a descendant of href", () => {
    currentPath = "/games/abc-123";
    render(<SidebarNavItem href="/games" label="Games" icon={testIcon} />);
    const link = screen.getByRole("link", { name: "Games" });
    expect(link).toHaveAttribute("data-active", "true");
  });

  it("is inactive for unrelated paths", () => {
    currentPath = "/account";
    render(<SidebarNavItem href="/games" label="Games" icon={testIcon} />);
    const link = screen.getByRole("link", { name: "Games" });
    expect(link).toHaveAttribute("data-active", "false");
    expect(link).not.toHaveAttribute("aria-current");
  });

  it("does NOT match a sibling path with the same prefix (e.g. /gameshow)", () => {
    currentPath = "/gameshow";
    render(<SidebarNavItem href="/games" label="Games" icon={testIcon} />);
    const link = screen.getByRole("link", { name: "Games" });
    expect(link).toHaveAttribute("data-active", "false");
  });

  it("re-renders when the body collapsed attribute changes at runtime", async () => {
    setCollapsed(true);
    render(<SidebarNavItem href="/games" label="Games" icon={testIcon} />);
    const link = screen.getByRole("link", { name: "Games" });
    expect(link.querySelector(".sr-only")).not.toBeNull();
    setCollapsed(false);
    // MutationObserver fires on the microtask queue — wait for the
    // subsequent React re-render before asserting.
    await waitFor(() => {
      expect(link.querySelector(".sr-only")).toBeNull();
    });
  });
});
