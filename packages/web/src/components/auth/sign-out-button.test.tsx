/**
 * SignOutButton tests (feature 011-auth-gated-landing, FR-013).
 *
 * A user who signs out MUST be returned to the public landing page (`/`),
 * not the login page or an authenticated route. This is the choke point
 * for that guarantee — the button posts to /api/auth/sign-out and then
 * navigates the browser to `/`, at which point middleware serves the
 * signed-out landing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SignOutButton } from "./sign-out-button";

describe("<SignOutButton />", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let assignMock: ReturnType<typeof vi.fn>;
  const originalLocation = window.location;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    assignMock = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...originalLocation, assign: assignMock },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it("navigates to `/` (public landing) after a successful sign-out", async () => {
    const user = userEvent.setup();
    render(<SignOutButton />);

    await user.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/"));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/sign-out", { method: "POST" });
  });
});
