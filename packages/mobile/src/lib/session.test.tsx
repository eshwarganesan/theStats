import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

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
    mockGetSession.mockResolvedValue({ data: { session: { user: { email: "a@b.co" } } } });
    const { unmount } = await render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    expect(await screen.findByText("a@b.co")).toBeOnTheScreen();

    await act(async () => mockListener?.("SIGNED_OUT", null));
    expect(screen.getByText("signed out")).toBeOnTheScreen();

    await unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
    expect(mockUnbindRefresh).toHaveBeenCalled();
    // Late events after unmount are ignored.
    mockListener?.("SIGNED_IN", { user: { email: "late@b.co" } });
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
