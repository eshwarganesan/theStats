import { fireEvent, render, screen } from "@testing-library/react-native";

import { HamburgerButton } from "@/components/shell/HamburgerButton";
import { SidebarProvider } from "@/components/shell/SidebarProvider";

let mockPathname = "/";
const mockRouter = { dismissTo: jest.fn() };
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPathname,
}));
jest.mock("react-native-safe-area-context", () =>
  jest.requireActual<typeof import("react-native-safe-area-context/jest/mock")>(
    "react-native-safe-area-context/jest/mock",
  ).default,
);

/** A screen with the menu button in its header, inside the app's sidebar. */
function App() {
  return (
    <SidebarProvider>
      <HamburgerButton />
    </SidebarProvider>
  );
}

const games = () => screen.queryByRole("link", { name: "Games" });

async function openSidebar() {
  await fireEvent.press(screen.getByRole("button", { name: "Open navigation menu" }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = "/";
});

describe("navigation sidebar", () => {
  it("stays hidden until the menu button opens it", async () => {
    await render(<App />);
    expect(games()).toBeNull();

    await openSidebar();

    expect(games()).toBeOnTheScreen();
    // Like a modal, it hides the screen behind it from VoiceOver.
    expect(screen.queryByRole("button", { name: "Open navigation menu" })).toBeNull();
  });

  it("has no profile button, which is in Home's header instead", async () => {
    await render(<App />);
    await openSidebar();
    expect(screen.queryByLabelText("Account")).toBeNull();
  });

  it("closes when the backdrop is tapped", async () => {
    await render(<App />);
    await openSidebar();

    await fireEvent.press(screen.getByRole("button", { name: "Close navigation menu" }));

    expect(games()).toBeNull();
    expect(screen.getByRole("button", { name: "Open navigation menu" })).toBeOnTheScreen();
  });

  it("goes back to Home from Games", async () => {
    mockPathname = "/account";
    await render(<App />);
    await openSidebar();

    await fireEvent.press(screen.getByRole("link", { name: "Games" }));

    expect(mockRouter.dismissTo).toHaveBeenCalledWith("/");
    expect(games()).toBeNull();
  });

  it("only closes when Home is already showing", async () => {
    await render(<App />);
    await openSidebar();

    await fireEvent.press(screen.getByRole("link", { name: "Games" }));

    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    expect(games()).toBeNull();
  });

  it("marks Games as the current page on Home and on a saved game", async () => {
    for (const [pathname, current] of [
      ["/", true],
      ["/games/g1", true],
      ["/account", false],
    ] as const) {
      mockPathname = pathname;
      const view = await render(<App />);
      await openSidebar();
      const link = screen.getByRole("link", { name: "Games" });
      if (current) expect(link).toBeSelected();
      else expect(link).not.toBeSelected();
      await view.unmount();
    }
  });

  it("leaves the menu button inert outside the sidebar, e.g. a screen rendered alone", async () => {
    await render(<HamburgerButton />);
    await openSidebar();
    expect(games()).toBeNull();
  });

  it("closes when the app leaves the screen, and stays closed on the way back", async () => {
    const view = await render(<App />);
    await openSidebar();

    // e.g. the session ended and the app went to sign-in.
    mockPathname = "/sign-in";
    await view.rerender(<App />);
    expect(games()).toBeNull();

    mockPathname = "/";
    await view.rerender(<App />);
    expect(games()).toBeNull();
  });
});
