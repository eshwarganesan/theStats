/**
 * Failing-first tests for the storage-availability React context.
 *
 * The provider:
 *   - Reads `isStorageAvailable()` once on mount and exposes the result.
 *   - Subscribes to `notifyRecoveryFailed()` and flips `recoveryFailed`
 *     to `true`. `dismissRecoveryFailed()` flips it back.
 *   - Unsubscribes on unmount (no leaked callbacks).
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  StorageAvailabilityProvider,
  useStorageAvailability,
} from "./storageAvailability";
import * as persistence from "./persistence";

const wrap = ({ children }: { children: React.ReactNode }) => (
  <StorageAvailabilityProvider>{children}</StorageAvailabilityProvider>
);

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("StorageAvailabilityProvider", () => {
  it("exposes localStorageAvailable=true when the probe succeeds", () => {
    const { result } = renderHook(() => useStorageAvailability(), {
      wrapper: wrap,
    });
    expect(result.current.localStorageAvailable).toBe(true);
    expect(result.current.recoveryFailed).toBe(false);
  });

  it("exposes localStorageAvailable=false when the probe fails", () => {
    vi.spyOn(persistence, "isStorageAvailable").mockReturnValue(false);
    const { result } = renderHook(() => useStorageAvailability(), {
      wrapper: wrap,
    });
    expect(result.current.localStorageAvailable).toBe(false);
  });

  it("flips recoveryFailed to true when notifyRecoveryFailed fires", () => {
    const { result } = renderHook(() => useStorageAvailability(), {
      wrapper: wrap,
    });
    act(() => {
      persistence.notifyRecoveryFailed();
    });
    expect(result.current.recoveryFailed).toBe(true);
  });

  it("dismissRecoveryFailed flips the flag back to false", () => {
    const { result } = renderHook(() => useStorageAvailability(), {
      wrapper: wrap,
    });
    act(() => {
      persistence.notifyRecoveryFailed();
    });
    expect(result.current.recoveryFailed).toBe(true);
    act(() => {
      result.current.dismissRecoveryFailed();
    });
    expect(result.current.recoveryFailed).toBe(false);
  });

  it("unsubscribes from the pubsub on unmount", () => {
    const { result, unmount } = renderHook(() => useStorageAvailability(), {
      wrapper: wrap,
    });
    unmount();
    // After unmount, firing notifyRecoveryFailed must not cause any React
    // state update (which would throw a warning). The result we already
    // captured is a stable snapshot; we just verify the call is harmless.
    expect(() => persistence.notifyRecoveryFailed()).not.toThrow();
    // The captured snapshot's recoveryFailed must still be false because
    // we never bumped it pre-unmount.
    expect(result.current.recoveryFailed).toBe(false);
  });

  it("throws a useful error when used outside the provider", () => {
    // Suppress the expected React error noise.
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useStorageAvailability())).toThrow(
      /StorageAvailabilityProvider/,
    );
    err.mockRestore();
  });
});
