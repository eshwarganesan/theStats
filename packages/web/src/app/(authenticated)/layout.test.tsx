/**
 * Composition test for the authenticated route-group layout.
 *
 * After the hamburger-toggle redesign, the layout:
 *   - Still mounts the authenticated shell (sidebar + providers) around
 *     every route under `(authenticated)/`.
 *   - No longer reserves a `pl-14` sidebar rail on `<main>` — the
 *     sidebar is a fully off-canvas drawer now, so content is flush.
 *   - Renders the hamburger toggle in the top-left, visible on every
 *     authenticated page.
 *   - Starts with the drawer closed (nav has `data-open="false"`).
 *
 * We mock `createServerClient` because `<SidebarProfileIcon>` — nested
 * inside the sidebar's profile-icon slot as an async Server Component —
 * hits it on mount.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: { message: "no session" },
      }),
    },
  }),
}));

import AuthenticatedLayout from "./layout";
import { StorageAvailabilityProvider } from "@/lib/storageAvailability";

const wrap = (ui: React.ReactNode) =>
  render(<StorageAvailabilityProvider>{ui}</StorageAvailabilityProvider>);

describe("(authenticated)/layout", () => {
  it("renders the primary navigation sidebar (starts closed)", () => {
    wrap(
      <AuthenticatedLayout>
        <div data-testid="child" />
      </AuthenticatedLayout>,
    );
    // Closed nav is aria-hidden — aria-hidden nulls out the accessible
    // name, so ARIA `getByRole` with `name:` won't find it even with
    // `hidden: true`. Match on the underlying aria-label attribute.
    const nav = document.querySelector('nav[aria-label="Primary"]');
    expect(nav).not.toBeNull();
    expect(nav).toHaveAttribute("data-open", "false");
  });

  it("does NOT render a hamburger button in the layout itself — pages own that placement", () => {
    wrap(
      <AuthenticatedLayout>
        <div data-testid="child" />
      </AuthenticatedLayout>,
    );
    expect(
      screen.queryByRole("button", { name: /open navigation menu/i }),
    ).toBeNull();
  });

  it("wraps children in a <main> with no pl-14 rail inset (sidebar is fully off-canvas)", () => {
    wrap(
      <AuthenticatedLayout>
        <div data-testid="child" />
      </AuthenticatedLayout>,
    );
    const child = screen.getByTestId("child");
    const main = child.closest("main");
    expect(main).not.toBeNull();
    expect(main?.className.split(/\s+/)).not.toContain("pl-14");
    expect(main).toHaveClass("min-h-[100dvh]");
  });
});
