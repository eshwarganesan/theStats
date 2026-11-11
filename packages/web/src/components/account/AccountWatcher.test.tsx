/**
 * Tests for `AccountWatcher`.
 *   - US1 (task T030): following other tabs, so a tab left open can't
 *     write the deleted account's game back to the browser.
 *   - US4 (task T075): remembering the signed-in account, and checking
 *     whether it still exists when this tab is signed out unexpectedly.
 * Feature 018-account-deletion.
 */
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as DeviceAccountModule from "@/lib/account/device-account";
import type * as PersistenceModule from "@/lib/persistence";

type AuthListener = (event: string, session: { user: { id: string } } | null) => void;
const auth = vi.hoisted(() => ({
  listener: null as AuthListener | null,
  session: null as { user: { id: string } } | null,
  unsubscribe: () => {},
}));

vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: auth.session } }),
      onAuthStateChange: (listener: AuthListener) => {
        auth.listener = listener;
        return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
      },
    },
  }),
}));
vi.mock("@/lib/account/account-gone", () => ({ handleAccountGone: vi.fn() }));
vi.mock("@/lib/account/device-account", async (importOriginal) => ({
  ...(await importOriginal<typeof DeviceAccountModule>()),
  fetchAccountExists: vi.fn(),
  isOwnDeletionInProgress: vi.fn(() => false),
}));
vi.mock("@/lib/persistence", async (importOriginal) => ({
  ...(await importOriginal<typeof PersistenceModule>()),
  rememberAccount: vi.fn(),
  readRememberedAccount: vi.fn(() => null),
}));

import { handleAccountGone } from "@/lib/account/account-gone";
import { fetchAccountExists, isOwnDeletionInProgress } from "@/lib/account/device-account";
import { readRememberedAccount, rememberAccount } from "@/lib/persistence";
import { AccountWatcher } from "./AccountWatcher";

const channels: FakeChannel[] = [];
class FakeChannel {
  onmessage: ((event: MessageEvent) => void) | null = null;
  closed = false;
  constructor(readonly name: string) {
    channels.push(this);
  }
  postMessage() {}
  close() {
    this.closed = true;
  }
  deliver(data: unknown) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
}

beforeEach(() => {
  channels.length = 0;
  auth.listener = null;
  auth.session = null;
  auth.unsubscribe = vi.fn();
  vi.mocked(handleAccountGone).mockReset();
  vi.mocked(fetchAccountExists).mockReset();
  vi.mocked(isOwnDeletionInProgress).mockReturnValue(false);
  vi.mocked(rememberAccount).mockReset();
  vi.mocked(readRememberedAccount).mockReturnValue(null);
  vi.stubGlobal("BroadcastChannel", FakeChannel);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AccountWatcher (other tabs)", () => {
  it("runs the cleanup when another tab reports the account gone", () => {
    render(<AccountWatcher />);

    expect(channels.map((c) => c.name)).toEqual(["thestats.account"]);
    channels[0]?.deliver("deleted");

    expect(handleAccountGone).toHaveBeenCalledWith("deleted", { fromBroadcast: true });
  });

  it("ignores any other message", () => {
    render(<AccountWatcher />);

    channels[0]?.deliver("hello");
    channels[0]?.deliver({ kind: "deleted" });

    expect(handleAccountGone).not.toHaveBeenCalled();
  });

  it("closes its channel on unmount", () => {
    const { unmount } = render(<AccountWatcher />);
    unmount();
    expect(channels[0]?.closed).toBe(true);
  });

  it("does nothing where BroadcastChannel doesn't exist", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    expect(() => render(<AccountWatcher />)).not.toThrow();
  });

  it("renders nothing", () => {
    const { container } = render(<AccountWatcher />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("AccountWatcher (this tab's session, US4)", () => {
  async function mount() {
    const view = render(<AccountWatcher />);
    await act(async () => {});
    return view;
  }

  async function signOut() {
    await act(async () => {
      auth.listener?.("SIGNED_OUT", null);
    });
  }

  it("remembers the account of the session it finds, and of later sessions", async () => {
    auth.session = { user: { id: "u-1" } };
    await mount();
    expect(rememberAccount).toHaveBeenCalledWith("u-1");

    await act(async () => auth.listener?.("TOKEN_REFRESHED", { user: { id: "u-1" } }));
    await act(async () => auth.listener?.("SIGNED_IN", { user: { id: "u-2" } }));
    expect(vi.mocked(rememberAccount).mock.calls.map(([id]) => id)).toEqual(["u-1", "u-1", "u-2"]);
  });

  it("finds out the account was deleted when this tab is signed out unexpectedly", async () => {
    vi.mocked(readRememberedAccount).mockReturnValue("u-1");
    vi.mocked(fetchAccountExists).mockResolvedValue(false);
    await mount();

    await signOut();

    expect(fetchAccountExists).toHaveBeenCalledWith("u-1");
    expect(handleAccountGone).toHaveBeenCalledWith("deleted-elsewhere");
  });

  it.each([true, null])("leaves things alone when the check answers %s", async (exists) => {
    vi.mocked(readRememberedAccount).mockReturnValue("u-1");
    vi.mocked(fetchAccountExists).mockResolvedValue(exists);
    await mount();

    await signOut();

    expect(fetchAccountExists).toHaveBeenCalled();
    expect(handleAccountGone).not.toHaveBeenCalled();
  });

  it("doesn't check during this browser's own deletion", async () => {
    vi.mocked(readRememberedAccount).mockReturnValue("u-1");
    vi.mocked(isOwnDeletionInProgress).mockReturnValue(true);
    await mount();

    await signOut();

    expect(fetchAccountExists).not.toHaveBeenCalled();
  });

  it("doesn't check without a remembered account", async () => {
    await mount();
    await signOut();
    expect(fetchAccountExists).not.toHaveBeenCalled();
  });

  it("stops listening on unmount", async () => {
    const { unmount } = await mount();
    unmount();
    expect(auth.unsubscribe).toHaveBeenCalled();
  });
});
