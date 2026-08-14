/**
 * WriteThroughProvider tests (feature 009-account-library, T074 coverage top-up).
 *
 * The mount reads the current Supabase session on first render and forwards
 * `signedIn` into `useLibraryWriteThrough`. It also subscribes to
 * `onAuthStateChange` so a sign-in / sign-out flips the flag without a
 * page reload. Renders null (side-effect only).
 */
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Track calls into the write-through hook per-render so we can assert the
// mount forwarded the correct `signedIn` value at each auth state.
const useHook = vi.fn();
vi.mock("@/lib/games/writeThrough", () => ({
  useLibraryWriteThrough: (arg: { signedIn: boolean }) => useHook(arg),
}));

const getSession = vi.fn();
let authChangeCallback: ((event: string, session: unknown) => void) | null = null;
const unsubscribe = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({
    auth: {
      getSession,
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        authChangeCallback = cb;
        return { data: { subscription: { unsubscribe } } };
      },
    },
  }),
}));

import { WriteThroughProvider } from "./WriteThroughMount";

afterEach(() => {
  useHook.mockReset();
  getSession.mockReset();
  unsubscribe.mockReset();
  authChangeCallback = null;
});

describe("WriteThroughProvider", () => {
  it("renders nothing and starts with signedIn=false before the session resolves", () => {
    getSession.mockResolvedValueOnce({ data: { session: null } });
    const { container } = render(<WriteThroughProvider />);
    expect(container.firstChild).toBeNull();
    // First hook call, on mount, is with the initial state.
    expect(useHook).toHaveBeenCalledWith({ signedIn: false });
  });

  it("flips signedIn=true after getSession resolves with a session", async () => {
    getSession.mockResolvedValueOnce({ data: { session: { user: { id: "u" } } } });
    render(<WriteThroughProvider />);
    await waitFor(() =>
      expect(useHook).toHaveBeenLastCalledWith({ signedIn: true }),
    );
  });

  it("re-renders with the new signedIn value when auth state changes", async () => {
    // Resolve getSession first so its trailing setSignedIn(false) doesn't
    // race with the auth-change callback below.
    getSession.mockResolvedValueOnce({ data: { session: null } });
    render(<WriteThroughProvider />);
    await waitFor(() =>
      expect(useHook).toHaveBeenLastCalledWith({ signedIn: false }),
    );
    // Simulate the SIGNED_IN event on the Supabase auth-change stream.
    authChangeCallback?.("SIGNED_IN", { user: { id: "u" } });
    await waitFor(() =>
      expect(useHook).toHaveBeenLastCalledWith({ signedIn: true }),
    );
    // And a subsequent sign-out flips it back.
    authChangeCallback?.("SIGNED_OUT", null);
    await waitFor(() =>
      expect(useHook).toHaveBeenLastCalledWith({ signedIn: false }),
    );
  });

  it("unsubscribes from onAuthStateChange on unmount", () => {
    getSession.mockResolvedValueOnce({ data: { session: null } });
    const { unmount } = render(<WriteThroughProvider />);
    unmount();
    // Assert `>= 1` because React StrictMode dev-mode mounts twice, which
    // means the effect's cleanup fires an extra time. The invariant we
    // care about — cleanup runs at least once on unmount — is what
    // matters here.
    expect(unsubscribe.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
