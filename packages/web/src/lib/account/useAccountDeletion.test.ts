/**
 * Tests for `useAccountDeletion`, which owns the delete request, its
 * pending state, the double-submit guard and the outcome handling.
 * Feature 018-account-deletion, task T026.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeleteAccountOutcome } from "@thestats/app";

vi.mock("@/lib/account/delete-account-request", () => ({ requestAccountDeletion: vi.fn() }));
vi.mock("@/lib/account/account-gone", () => ({ handleAccountGone: vi.fn() }));

import { handleAccountGone } from "@/lib/account/account-gone";
import { requestAccountDeletion } from "@/lib/account/delete-account-request";
import { endOwnDeletion, isOwnDeletionInProgress } from "./device-account";
import { useAccountDeletion } from "./useAccountDeletion";

const request = vi.mocked(requestAccountDeletion);
const originalLocation = window.location;
let assign: ReturnType<typeof vi.fn>;

function deferred() {
  let resolve: (outcome: DeleteAccountOutcome) => void = () => {};
  const promise = new Promise<DeleteAccountOutcome>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  request.mockReset();
  vi.mocked(handleAccountGone).mockReset();
  endOwnDeletion();
  assign = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { ...originalLocation, assign },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: originalLocation,
  });
});

describe("useAccountDeletion", () => {
  it("sends the password while the own-deletion flag is set", async () => {
    const reply = deferred();
    request.mockReturnValue(reply.promise);
    const { result } = renderHook(() => useAccountDeletion());

    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = result.current.submit("hunter22");
    });
    expect(request).toHaveBeenCalledWith("hunter22");
    expect(isOwnDeletionInProgress()).toBe(true);

    await act(async () => {
      reply.resolve({ kind: "wrong-password" });
      await done;
    });
    expect(isOwnDeletionInProgress()).toBe(false);
  });

  it("is pending while the request is in flight, and ignores a second submit (FR-014)", async () => {
    const reply = deferred();
    request.mockReturnValue(reply.promise);
    const { result } = renderHook(() => useAccountDeletion());

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.submit("pw");
    });
    await act(async () => {
      await result.current.submit("pw");
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(true);

    await act(async () => {
      reply.resolve({ kind: "failed" });
      await first;
    });
    expect(result.current.pending).toBe(false);
  });

  it("hands a successful deletion to handleAccountGone", async () => {
    request.mockResolvedValue({ kind: "deleted" });
    const { result } = renderHook(() => useAccountDeletion());

    await act(async () => {
      await result.current.submit("pw");
    });

    expect(handleAccountGone).toHaveBeenCalledWith("deleted");
    expect(result.current.failure).toBeNull();
  });

  it("sends a signed-out user to sign in, then back to the account page", async () => {
    request.mockResolvedValue({ kind: "signed-out" });
    const { result } = renderHook(() => useAccountDeletion());

    await act(async () => {
      await result.current.submit("pw");
    });

    expect(assign).toHaveBeenCalledWith("/login?from=/account");
    expect(isOwnDeletionInProgress()).toBe(false);
  });

  it("exposes a failure and clears the own-deletion flag", async () => {
    request.mockResolvedValue({ kind: "rate-limited", retryAfterSeconds: 4 });
    const { result } = renderHook(() => useAccountDeletion());

    await act(async () => {
      await result.current.submit("pw");
    });

    expect(result.current.failure).toEqual({ kind: "rate-limited", retryAfterSeconds: 4 });
    expect(result.current.pending).toBe(false);
    expect(isOwnDeletionInProgress()).toBe(false);
    expect(handleAccountGone).not.toHaveBeenCalled();
  });

  it("clears the failure on reset", async () => {
    request.mockResolvedValue({ kind: "wrong-password" });
    const { result } = renderHook(() => useAccountDeletion());
    await act(async () => {
      await result.current.submit("pw");
    });

    act(() => result.current.reset());

    expect(result.current.failure).toBeNull();
  });
});
