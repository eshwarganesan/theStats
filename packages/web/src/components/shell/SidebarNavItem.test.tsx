/**
 * SidebarNavItem tests.
 *
 * The item now always renders icon + visible label — the previous
 * icon-only rail state is gone under the hamburger-toggle redesign.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// usePathname is a client-side hook — return a settable pathname per test.
let currentPath = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
}));

import { SidebarNavItem } from "./SidebarNavItem";

const testIcon = <svg data-testid="test-icon" />;

beforeEach(() => {
  currentPath = "/";
});

describe("SidebarNavItem", () => {
  it("renders an accessible link to href with an aria-label of the label", () => {
    render(<SidebarNavItem href="/games" label="Games" icon={testIcon} />);
    const link = screen.getByRole("link", { name: "Games" });
    expect(link).toHaveAttribute("href", "/games");
  });

  it("renders the icon and the visible label side-by-side", () => {
    render(<SidebarNavItem href="/games" label="Games" icon={testIcon} />);
    expect(screen.getByTestId("test-icon")).toBeInTheDocument();
    expect(screen.getByText("Games")).toBeInTheDocument();
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
});
