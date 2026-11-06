import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { claimDeviceGame } from "@/lib/gameSync";

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
jest.mock("@/lib/gameSync", () => ({ claimDeviceGame: jest.fn() }));
const claimMock = jest.mocked(claimDeviceGame);

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
