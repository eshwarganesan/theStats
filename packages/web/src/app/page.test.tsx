/**
 * Landing page tests (feature 011-auth-gated-landing, US1; feature
 * 018-account-deletion, the account notice).
 *
 * After 011, the landing hero at `/` is a signed-out-only surface. Both
 * CTAs ("New Game" and "Continue Game") must route to the login page —
 * they MUST NOT start / resume a game, and they MUST NOT clear any
 * persisted local state on click (spec FR-004 / FR-005 / SC-005).
 *
 * After 018, `?account=deleted` or `?account=deleted-elsewhere` adds a
 * notice that the account is gone. Only that notice clears the browser's
 * leftover game (it belongs to the deleted account); a plain render
 * still clears nothing.
 *
 * Signed-in users never see this page — they're redirected to /games by
 * middleware (spec FR-006 / FR-007). We do not exercise that here; it is
 * covered by the middleware test suite.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/account/AccountNotice", () => ({
  AccountNotice: ({ kind }: { kind: string }) => <div data-testid="account-notice">{kind}</div>,
}));
vi.mock("@/components/account/AccountCheck", () => ({
  AccountCheck: () => <div data-testid="account-check" />,
}));

import HomePage from "./page";
import * as persistence from "@/lib/persistence";

async function renderLanding(params: Record<string, string | string[] | undefined> = {}) {
  render(await HomePage({ searchParams: Promise.resolve(params) }));
}

describe("app/page (landing)", () => {
  it('routes the "New Game" CTA to /login', async () => {
    await renderLanding();
    const newGame = screen.getByRole("link", { name: /new game/i });
    expect(newGame).toHaveAttribute("href", "/login");
  });

  it('routes the "Continue Game" CTA to /login', async () => {
    await renderLanding();
    const continueGame = screen.getByRole("link", { name: /continue game/i });
    expect(continueGame).toHaveAttribute("href", "/login");
  });

  it("does not invoke clearPersistedGame on landing render", async () => {
    const spy = vi.spyOn(persistence, "clearPersistedGame");
    await renderLanding();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("app/page account notice (feature 018)", () => {
  it.each(["deleted", "deleted-elsewhere"])("shows the %s notice", async (account) => {
    await renderLanding({ account });
    expect(screen.getByTestId("account-notice")).toHaveTextContent(account);
  });

  it.each([
    ["an unknown value", { account: "nope" }],
    ["a repeated parameter", { account: ["deleted", "deleted"] }],
    ["no parameter", {}],
  ])("shows no notice for %s", async (_label, params) => {
    await renderLanding(params);
    expect(screen.queryByTestId("account-notice")).toBeNull();
  });
});

describe("app/page remembered-account check (feature 018, US4)", () => {
  it("runs the check for a browser whose session may have expired", async () => {
    await renderLanding();
    expect(screen.getByTestId("account-check")).toBeInTheDocument();
  });
});
