/**
 * Failing-first tests for the recovery-failed banner.
 */

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { RecoveryFailedBanner } from "./RecoveryFailedBanner";
import { StorageAvailabilityProvider } from "@/lib/storageAvailability";
import { notifyRecoveryFailed } from "@/lib/persistence";

const wrap = (ui: React.ReactNode) =>
  render(<StorageAvailabilityProvider>{ui}</StorageAvailabilityProvider>);

beforeEach(() => {
  localStorage.clear();
});

describe("RecoveryFailedBanner", () => {
  it("renders nothing by default", () => {
    wrap(<RecoveryFailedBanner />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders a banner with the recovery message after notifyRecoveryFailed", () => {
    wrap(<RecoveryFailedBanner />);
    act(() => {
      notifyRecoveryFailed();
    });
    expect(screen.getByRole("status")).toBeVisible();
    expect(
      screen.getByText(/previous game could not be recovered/i),
    ).toBeVisible();
  });

  it("clears when the user clicks the dismiss control", async () => {
    const user = userEvent.setup();
    wrap(<RecoveryFailedBanner />);
    act(() => {
      notifyRecoveryFailed();
    });
    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
