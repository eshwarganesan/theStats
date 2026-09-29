/**
 * HamburgerButton tests — the inline toggle that each authenticated
 * page renders in its own header. State comes from
 * `SidebarToggleContext`; the button owns no props and no layout
 * positioning of its own.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HamburgerButton } from "./HamburgerButton";
import {
  SidebarToggleContext,
  type SidebarToggleContextValue,
} from "./SidebarToggleContext";

function withCtx(value: SidebarToggleContextValue, ui: React.ReactNode) {
  return render(
    <SidebarToggleContext.Provider value={value}>
      {ui}
    </SidebarToggleContext.Provider>,
  );
}

const noopValue = (open: boolean): SidebarToggleContextValue => ({
  open,
  toggle: () => {},
  close: () => {},
});

describe("HamburgerButton", () => {
  it('exposes aria-label "Open navigation menu" when the drawer is closed', () => {
    withCtx(noopValue(false), <HamburgerButton />);
    expect(
      screen.getByRole("button", { name: /open navigation menu/i }),
    ).toBeInTheDocument();
  });

  it('exposes aria-label "Close navigation menu" when the drawer is open', () => {
    withCtx(noopValue(true), <HamburgerButton />);
    expect(
      screen.getByRole("button", { name: /close navigation menu/i }),
    ).toBeInTheDocument();
  });

  it("reflects the open state via aria-expanded", () => {
    const { rerender } = withCtx(noopValue(false), <HamburgerButton />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
    rerender(
      <SidebarToggleContext.Provider value={noopValue(true)}>
        <HamburgerButton />
      </SidebarToggleContext.Provider>,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  });

  it("invokes context.toggle when clicked", () => {
    const toggle = vi.fn();
    withCtx(
      { open: false, toggle, close: () => {} },
      <HamburgerButton />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("does NOT apply fixed positioning — layout is the caller's job", () => {
    withCtx(noopValue(false), <HamburgerButton />);
    const classes = screen.getByRole("button").className.split(/\s+/);
    expect(classes).not.toContain("fixed");
    expect(classes.some((c) => /^top-/.test(c))).toBe(false);
    expect(classes.some((c) => /^left-/.test(c))).toBe(false);
  });

  it("throws when rendered without a SidebarToggleContext provider", () => {
    // Silence React's noisy error log for the intentional throw.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<HamburgerButton />)).toThrow(
      /SidebarToggleContext|AuthenticatedShell/,
    );
    spy.mockRestore();
  });
});
