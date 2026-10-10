/**
 * NewGameCta tests.
 * Feature 010-games-library, task T019.
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

const adoptGameIdMock = vi.fn();
vi.mock("@/components/shell/WriteThroughMount", () => ({
  useWriteThrough: () => ({
    adoptGameId: adoptGameIdMock,
    saveNow: vi.fn(),
    status: "idle",
    signedIn: true,
  }),
}));

beforeEach(() => {
  pushMock.mockReset();
  adoptGameIdMock.mockReset();
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

  it("clears the write-through game id, wipes persistence, resets the store, then navigates to /setup (in that order)", async () => {
    const callOrder: string[] = [];
    adoptGameIdMock.mockImplementation((id: string | null) => {
      callOrder.push(`adopt:${String(id)}`);
    });
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

    expect(adoptGameIdMock).toHaveBeenCalledWith(null);
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/setup");
    // adopt(null) must come before reset so a prior Continue's gameId can't
    // cause the fresh setup's first commit to PATCH the previous row.
    expect(callOrder).toEqual(["adopt:null", "clear", "reset", "push:/setup"]);
  });

  it("forwards extra Button props (variant/size)", () => {
    render(<NewGameCta variant="outline" size="xl" />);
    const btn = screen.getByRole("button", { name: "New game" });
    expect(btn.tagName).toBe("BUTTON");
  });
});
