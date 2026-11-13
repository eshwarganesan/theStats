import { fireEvent, render, screen } from "@testing-library/react-native";

import { DELETE_ACCOUNT_COPY } from "@thestats/app";

import AccountScreen from "@/app/account";
import { signOut } from "@/lib/auth";

jest.mock("@/lib/auth", () => ({ signOut: jest.fn() }));
jest.mock("@/lib/session", () => ({
  useSession: () => ({ session: { user: { email: "coach@example.com" } }, isLoading: false }),
}));
jest.mock("@/components/account/DeleteAccountSheet", () => {
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  return {
    DeleteAccountSheet: ({ visible }: { visible: boolean }) =>
      visible ? createElement(Text, null, "delete sheet open") : null,
  };
});

const signOutMock = jest.mocked(signOut);

beforeEach(() => {
  jest.clearAllMocks();
});

describe("<AccountScreen />", () => {
  it("shows the signed-in account and the delete section", async () => {
    await render(<AccountScreen />);

    expect(screen.getByText("coach@example.com")).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: DELETE_ACCOUNT_COPY.sectionHeading })).toBeOnTheScreen();
    expect(screen.getByText(DELETE_ACCOUNT_COPY.sectionText)).toBeOnTheScreen();
  });

  it("opens the confirmation sheet from Delete account", async () => {
    await render(<AccountScreen />);
    expect(screen.queryByText("delete sheet open")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: DELETE_ACCOUNT_COPY.actionLabel }));

    expect(screen.getByText("delete sheet open")).toBeOnTheScreen();
  });

  it("signs out, as on web's account page", async () => {
    signOutMock.mockResolvedValue();
    await render(<AccountScreen />);

    const button = screen.getByRole("button", { name: "Sign out" });
    await fireEvent.press(button);

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(button).toBeEnabled();
  });

  it("has the navigation sidebar's menu button in place of a back button", async () => {
    await render(<AccountScreen />);
    expect(screen.getByRole("button", { name: "Open navigation menu" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Back to Games" })).toBeNull();
  });
});
