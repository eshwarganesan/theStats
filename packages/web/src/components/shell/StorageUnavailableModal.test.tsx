/**
 * Failing-first tests for the storage-unavailable modal.
 *
 * Renders nothing when storage is fine. Renders a blocking dialog when
 * not. Per-page-lifetime acknowledgment (no persistence of the dismiss).
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StorageUnavailableModal } from "./StorageUnavailableModal";
import { StorageAvailabilityProvider } from "@/lib/storageAvailability";
import * as persistence from "@/lib/persistence";

const wrap = (ui: React.ReactNode) =>
  render(<StorageAvailabilityProvider>{ui}</StorageAvailabilityProvider>);

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("StorageUnavailableModal", () => {
  it("renders nothing when storage is available", () => {
    wrap(<StorageUnavailableModal />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the dialog with title and CTA when storage is unavailable", () => {
    vi.spyOn(persistence, "isStorageAvailable").mockReturnValue(false);
    wrap(<StorageUnavailableModal />);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByText(/saving is disabled/i)).toBeVisible();
    expect(
      screen.getByRole("button", { name: /continue without saving/i }),
    ).toBeVisible();
  });

  it("hides the dialog when the user clicks the CTA", async () => {
    vi.spyOn(persistence, "isStorageAvailable").mockReturnValue(false);
    const user = userEvent.setup();
    wrap(<StorageUnavailableModal />);
    await user.click(
      screen.getByRole("button", { name: /continue without saving/i }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
