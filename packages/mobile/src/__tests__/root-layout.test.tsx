import { render, screen } from "@testing-library/react-native";

import RootLayout from "@/app/_layout";

let mockSession: unknown = null;

jest.mock("../global.css", () => ({}));
jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(async () => {}),
  hideAsync: jest.fn(async () => {}),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("@/lib/cryptoPolyfill", () => ({ installCryptoPolyfill: jest.fn() }));
jest.mock("@/lib/gameClock", () => ({ useGameClock: jest.fn(), useClockCheckpoint: jest.fn() }));
jest.mock("@/lib/gameSync", () => ({ useGameSync: jest.fn() }));
jest.mock("@/lib/session", () => ({
  SessionProvider: ({ children }: { children: unknown }) => children,
  useSession: () => ({ session: mockSession, isLoading: false }),
}));
// A stand-in Stack that lists the screens it registers, and renders a
// protected group only when its guard passes, like the real one.
jest.mock("expo-router", () => {
  const { Fragment, createElement } = jest.requireActual<typeof import("react")>("react");
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  function Stack({ children }: { children?: import("react").ReactNode }) {
    return createElement(Fragment, null, children);
  }
  Stack.Screen = function Screen({ name }: { name: string }) {
    return createElement(Text, null, `screen:${name}`);
  };
  Stack.Protected = function Protected({
    guard,
    children,
  }: {
    guard: boolean;
    children?: import("react").ReactNode;
  }) {
    return guard ? createElement(Fragment, null, children) : null;
  };
  return { Stack };
});

describe("<RootLayout /> routes", () => {
  it("registers the Account screen for signed-in users only", async () => {
    mockSession = { user: { id: "u1" } };
    const signedIn = await render(<RootLayout />);
    expect(screen.getByText("screen:account")).toBeOnTheScreen();
    expect(screen.queryByText("screen:sign-in")).toBeNull();
    await signedIn.unmount();

    mockSession = null;
    await render(<RootLayout />);
    expect(screen.queryByText("screen:account")).toBeNull();
    expect(screen.getByText("screen:sign-in")).toBeOnTheScreen();
  });
});
