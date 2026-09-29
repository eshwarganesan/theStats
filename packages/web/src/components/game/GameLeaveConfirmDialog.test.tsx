/**
 * GameLeaveConfirmDialog tests.
 *
 * A blocking confirmation prompt shown when a user on `/game/*` clicks
 * a nav affordance that would leave the live-scorekeeping session.
 * Fully controlled — the caller supplies `open`, `onCancel`, `onConfirm`.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GameLeaveConfirmDialog } from "./GameLeaveConfirmDialog";

describe("GameLeaveConfirmDialog", () => {
  it("does not render its title when closed", () => {
    render(
      <GameLeaveConfirmDialog
        open={false}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(
      screen.queryByRole("heading", { name: /leave the current game/i }),
    ).toBeNull();
  });

  it("renders a title, warning about unsaved progress, and OK / Cancel buttons when open", () => {
    render(
      <GameLeaveConfirmDialog
        open
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(
      screen.getByRole("heading", { name: /leave the current game/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/unsaved progress will be lost/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^ok$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
  });

  it("invokes onCancel when the Cancel button is clicked", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <GameLeaveConfirmDialog
        open
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("invokes onConfirm when the OK button is clicked", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <GameLeaveConfirmDialog
        open
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^ok$/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
