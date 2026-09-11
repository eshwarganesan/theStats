/**
 * Landing page tests (feature 011-auth-gated-landing, US1).
 *
 * After 011, the landing hero at `/` is a signed-out-only surface. Both
 * CTAs ("New Game" and "Continue Game") must route to the login page —
 * they MUST NOT start / resume a game, and they MUST NOT clear any
 * persisted local state on click (spec FR-004 / FR-005 / SC-005).
 *
 * Signed-in users never see this page — they're redirected to /games by
 * middleware (spec FR-006 / FR-007). We do not exercise that here; it is
 * covered by the middleware test suite.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import HomePage from "./page";
import * as persistence from "@/lib/persistence";

describe("app/page (landing)", () => {
  it('routes the "New Game" CTA to /login', () => {
    render(<HomePage />);
    const newGame = screen.getByRole("link", { name: /new game/i });
    expect(newGame).toHaveAttribute("href", "/login");
  });

  it('routes the "Continue Game" CTA to /login', () => {
    render(<HomePage />);
    const continueGame = screen.getByRole("link", { name: /continue game/i });
    expect(continueGame).toHaveAttribute("href", "/login");
  });

  it("does not invoke clearPersistedGame on landing render", () => {
    const spy = vi.spyOn(persistence, "clearPersistedGame");
    render(<HomePage />);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
