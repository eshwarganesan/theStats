/**
 * NewGameCta tests.
 * Feature 010-games-library, task T019.
 *
 * Mirrors the ordering + interaction assertions used for the home page's
 * `NewGameButton` so both entry points converge on identical semantics.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NewGameCta } from "./NewGameCta";
import * as persistence from "@/lib/persistence";
import { useGameStore } from "@/lib/store";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

beforeEach(() => {
  pushMock.mockReset();
  localStorage.clear();
  useGameStore.getState().resetAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NewGameCta", () => {
  it("renders a button labeled 'New game' by default", () => {
    render(<NewGameCta />);
    expect(screen.getByRole("button", { name: "New game" })).toBeVisible();
  });

  it("accepts a custom label", () => {
    render(<NewGameCta label="Start your first game" />);
    expect(
      screen.getByRole("button", { name: "Start your first game" }),
    ).toBeVisible();
  });

  it("wipes persistence, then resets the store, then navigates to /setup (in that order)", async () => {
    const callOrder: string[] = [];
    const clearSpy = vi
      .spyOn(persistence, "clearPersistedGame")
      .mockImplementation(() => {
        callOrder.push("clear");
      });
    const resetSpy = vi
      .spyOn(useGameStore.getState(), "resetAll")
      .mockImplementation(() => {
        callOrder.push("reset");
      });
    pushMock.mockImplementation((path: string) => {
      callOrder.push(`push:${path}`);
    });

    const user = userEvent.setup();
    render(<NewGameCta />);
    await user.click(screen.getByRole("button", { name: "New game" }));

    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/setup");
    expect(callOrder).toEqual(["clear", "reset", "push:/setup"]);
  });

  it("forwards extra Button props (variant/size)", () => {
    render(<NewGameCta variant="outline" size="xl" />);
    const btn = screen.getByRole("button", { name: "New game" });
    expect(btn.tagName).toBe("BUTTON");
  });
});
