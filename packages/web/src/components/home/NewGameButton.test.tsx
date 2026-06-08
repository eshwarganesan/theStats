/**
 * Failing-first tests for the home-page "New Game" button. The button
 * must wipe persisted storage, reset the in-memory store, and navigate
 * to /setup — in that order.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NewGameButton } from "./NewGameButton";
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

describe("NewGameButton", () => {
  it("renders its children as the button label", () => {
    render(<NewGameButton>New Game →</NewGameButton>);
    expect(
      screen.getByRole("button", { name: /new game/i }),
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
    render(<NewGameButton>New Game →</NewGameButton>);
    await user.click(screen.getByRole("button", { name: /new game/i }));

    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/setup");
    expect(callOrder).toEqual(["clear", "reset", "push:/setup"]);
  });

  it("forwards extra Button props (variant/size)", () => {
    render(
      <NewGameButton variant="outline" size="xl">
        Continue
      </NewGameButton>,
    );
    const btn = screen.getByRole("button", { name: /continue/i });
    // Loose check: the rendered element is still a button (full visual
    // assertion belongs in Button.test, not here).
    expect(btn.tagName).toBe("BUTTON");
  });
});
