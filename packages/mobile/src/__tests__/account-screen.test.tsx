import { fireEvent, render, screen } from "@testing-library/react-native";

import { DELETE_ACCOUNT_COPY } from "@thestats/app";

import AccountScreen from "@/app/account";

const mockRouter = { back: jest.fn(), push: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));
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

  it("goes back to Home from the header", async () => {
    await render(<AccountScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Back to Games" }));
    expect(mockRouter.back).toHaveBeenCalled();
  });
});
