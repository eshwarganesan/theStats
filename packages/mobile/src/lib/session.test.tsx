import { act, render, screen, waitFor } from "@testing-library/react-native";
import { AppState, Text, type AppStateStatus } from "react-native";

import { checkAccountExists } from "@/lib/account";

import { handleAccountGone, onSignedIn } from "@/lib/accountGone";
import { claimDeviceGame, deviceGameOwner } from "@/lib/gameSync";

import { SessionProvider, useSession } from "./session";

type Settle = { resolve: (v: unknown) => void; reject: (e: unknown) => void };
type Listener = (event: string, session: unknown) => void;

const mockGetSession = jest.fn();
const mockUnsubscribe = jest.fn();
const mockUnbindRefresh = jest.fn();
let mockListener: Listener | undefined;

jest.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: (cb: Listener) => {
        mockListener = cb;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      },
    },
  }),
  bindAutoRefreshToAppState: () => mockUnbindRefresh,
}));
jest.mock("@/lib/gameSync", () => ({ claimDeviceGame: jest.fn(), deviceGameOwner: jest.fn() }));
const claimMock = jest.mocked(claimDeviceGame);
const ownerMock = jest.mocked(deviceGameOwner);
jest.mock("@/lib/accountGone", () => ({ onSignedIn: jest.fn(), handleAccountGone: jest.fn() }));
const onSignedInMock = jest.mocked(onSignedIn);
const goneMock = jest.mocked(handleAccountGone);
jest.mock("@/lib/account", () => ({ checkAccountExists: jest.fn() }));
const checkMock = jest.mocked(checkAccountExists);
let mockReportDeleted: (() => void) | undefined;
jest.mock("@/lib/accountEvents", () => ({
  onAccountDeleted: (listener: () => void) => {
    mockReportDeleted = listener;
    return () => {
      mockReportDeleted = undefined;
    };
  },
}));

function Probe() {
  const { session, isLoading } = useSession();
  const email = (session as { user?: { email?: string } } | null)?.user?.email;
  return <Text>{isLoading ? "loading" : (email ?? "signed out")}</Text>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListener = undefined;
});

describe("<SessionProvider />", () => {
  it("loads the stored session, then follows auth state changes", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "u1", email: "a@b.co" } } },
    });
    const { unmount } = await render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    expect(await screen.findByText("a@b.co")).toBeOnTheScreen();
    expect(claimMock).toHaveBeenCalledWith("u1");

    await act(async () => mockListener?.("SIGNED_OUT", null));
    expect(screen.getByText("signed out")).toBeOnTheScreen();

    await act(async () => mockListener?.("SIGNED_IN", { user: { id: "u2", email: "b@b.co" } }));
    expect(screen.getByText("b@b.co")).toBeOnTheScreen();
    expect(claimMock.mock.calls).toEqual([["u1"], ["u2"]]);

    await unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
    expect(mockUnbindRefresh).toHaveBeenCalled();
    // Late events after unmount are ignored.
    mockListener?.("SIGNED_IN", { user: { id: "late", email: "late@b.co" } });
    expect(claimMock).not.toHaveBeenCalledWith("late");
  });

  it("claims the device before showing the session", async () => {
    const events: string[] = [];
    function OrderProbe() {
      const { session } = useSession();
      const email = (session as { user?: { email?: string } } | null)?.user?.email;
      if (email) events.push(`render:${email}`);
      return null;
    }
    claimMock.mockImplementationOnce((id: string) => {
      events.push(`claim:${id}`);
    });
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "u1", email: "a@b.co" } } },
    });
    await render(
      <SessionProvider>
        <OrderProbe />
      </SessionProvider>,
    );
    await act(async () => {});
    expect(events[0]).toBe("claim:u1");
    expect(events).toContain("render:a@b.co");
  });

  it("stays signed out if the device can't be claimed", async () => {
    claimMock.mockImplementationOnce(() => {
      throw new Error("storage unavailable");
    });
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "u1", email: "a@b.co" } } },
    });
    await render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    expect(await screen.findByText("signed out")).toBeOnTheScreen();
  });

  it("treats a keychain read failure as signed out", async () => {
    mockGetSession.mockRejectedValue(new Error("keychain locked"));
    await render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    expect(await screen.findByText("signed out")).toBeOnTheScreen();
  });

  it.each([
    ["resolves", (settle: Settle) => settle.resolve({ data: { session: null } })],
    ["rejects", (settle: Settle) => settle.reject(new Error("late"))],
  ])("ignores a stored-session read that %s after unmount", async (_label, finish) => {
    const settle = {} as Settle;
    mockGetSession.mockReturnValue(
      new Promise((resolve, reject) => Object.assign(settle, { resolve, reject })),
    );
    const { unmount } = await render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByText("loading")).toBeOnTheScreen();
    await unmount();
    await act(async () => finish(settle));
  });

  it("defaults to loading outside a provider", async () => {
    await render(<Probe />);
    expect(screen.getByText("loading")).toBeOnTheScreen();
  });
});

describe("<SessionProvider /> and account deletion (feature 018)", () => {
  it("tells accountGone about every session it applies", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1", email: "a@b.co" } } } });
    await render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    expect(await screen.findByText("a@b.co")).toBeOnTheScreen();
    expect(onSignedInMock).toHaveBeenCalledTimes(1);

    await act(async () => mockListener?.("SIGNED_OUT", null));
    expect(onSignedInMock).toHaveBeenCalledTimes(1);

    await act(async () => mockListener?.("SIGNED_IN", { user: { id: "u2", email: "b@b.co" } }));
    expect(onSignedInMock).toHaveBeenCalledTimes(2);
  });
});

describe("<SessionProvider /> finding a deleted account (feature 018, US4)", () => {
  const signedIn = { data: { session: { user: { id: "u1", email: "a@b.co" } } } };
  const signedOut = { data: { session: null } };

  beforeEach(() => {
    ownerMock.mockReturnValue(null);
    checkMock.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function mount() {
    return render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
  }

  it("runs the cleanup when the API reports the account deleted", async () => {
    mockGetSession.mockResolvedValue(signedIn);
    await mount();
    expect(await screen.findByText("a@b.co")).toBeOnTheScreen();

    await act(async () => mockReportDeleted?.());

    expect(goneMock).toHaveBeenCalledWith("deleted-elsewhere");
  });

  it("asks, when signed out, whether the device's last account still exists", async () => {
    mockGetSession.mockResolvedValue(signedOut);
    ownerMock.mockReturnValue("u1");
    checkMock.mockResolvedValue(false);

    await mount();

    await waitFor(() => expect(goneMock).toHaveBeenCalledWith("deleted-elsewhere"));
    expect(checkMock).toHaveBeenCalledTimes(1);
    expect(checkMock).toHaveBeenCalledWith("u1");
  });

  it("does nothing while the account exists, and asks only once per launch", async () => {
    mockGetSession.mockResolvedValue(signedOut);
    ownerMock.mockReturnValue("u1");
    checkMock.mockResolvedValue(true);
    await mount();
    await waitFor(() => expect(checkMock).toHaveBeenCalledTimes(1));

    await act(async () => mockListener?.("SIGNED_IN", { user: { id: "u1", email: "a@b.co" } }));
    await act(async () => mockListener?.("SIGNED_OUT", null));

    expect(checkMock).toHaveBeenCalledTimes(1);
    expect(goneMock).not.toHaveBeenCalled();
  });

  it("asks again on the next foreground when the check couldn't be answered", async () => {
    let foreground: ((state: AppStateStatus) => void) | undefined;
    jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
      foreground = listener;
      return { remove: jest.fn() };
    });
    mockGetSession.mockResolvedValue(signedOut);
    ownerMock.mockReturnValue("u1");
    checkMock.mockResolvedValueOnce(null).mockResolvedValueOnce(false);
    await mount();
    await waitFor(() => expect(checkMock).toHaveBeenCalledTimes(1));
    expect(goneMock).not.toHaveBeenCalled();

    await act(async () => foreground?.("active"));

    await waitFor(() => expect(goneMock).toHaveBeenCalledWith("deleted-elsewhere"));
    expect(checkMock).toHaveBeenCalledTimes(2);
  });

  it("never asks while signed in", async () => {
    mockGetSession.mockResolvedValue(signedIn);
    ownerMock.mockReturnValue("u1");
    await mount();
    expect(await screen.findByText("a@b.co")).toBeOnTheScreen();
    expect(checkMock).not.toHaveBeenCalled();
  });
});
