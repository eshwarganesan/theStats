import { act, fireEvent, render, screen } from "@testing-library/react-native";

import SetupScreen from "@/app/setup";
import { useGameStore } from "@/lib/store";
import { rosterTeams, startLiveGame } from "@/test/gameFixtures";

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
};
jest.mock("expo-router", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    useRouter: () => mockRouter,
    Redirect: ({ href }: { href: string }) => React.createElement(Text, null, `Redirect to ${href}`),
  };
});

const state = () => useGameStore.getState();
const settings = () => state().settings;
const home = () => state().homeTeam;

async function press(name: string | RegExp, index = 0) {
  const matches = screen.getAllByRole("button", { name });
  await fireEvent.press(matches[index] ?? matches[0]!);
}

async function choose(name: string, index = 0) {
  const matches = screen.getAllByRole("radio", { name });
  await fireEvent.press(matches[index] ?? matches[0]!);
}

async function type(label: string, text: string, index = 0) {
  const matches = screen.getAllByLabelText(label);
  await fireEvent.changeText(matches[index] ?? matches[0]!, text);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.canGoBack.mockReturnValue(true);
  state().resetAll();
});

describe("<SetupScreen /> game settings", () => {
  it("switches format and steps the numbers within their limits", async () => {
    await render(<SetupScreen />);

    await choose("Format: 3v3");
    expect(settings()).toMatchObject({ format: "3v3", periods: 1, timeoutsPerGame: 1 });
    expect(screen.getAllByText("Starters 0/3")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Decrease Periods" })).toBeDisabled();

    await press("Increase Periods");
    expect(settings().periods).toBe(2);
    await press("Increase Period length");
    expect(settings().periodSeconds).toBe(11 * 60);
    expect(screen.getByText("11 min")).toBeOnTheScreen();
    await press("Increase Timeout length");
    expect(settings().timeoutSeconds).toBe(40);
    expect(screen.getByText("0:40")).toBeOnTheScreen();
    await press("Decrease Quarter break");
    expect(settings().quarterBreakSeconds).toBe(30);
    await press("Increase Halftime");
    expect(settings().halftimeBreakSeconds).toBe(30);
    await press("Increase Overtime length");
    expect(settings().overtimeSeconds).toBe(6 * 60);
    await press("Decrease Bonus fouls");
    expect(settings().bonusFoulThreshold).toBe(6);
  });

  it("supports VoiceOver's adjust gestures", async () => {
    await render(<SetupScreen />);
    const timeouts = screen.getByLabelText("Timeouts per game");
    expect(timeouts).toHaveAccessibilityValue({ text: "5" });

    await fireEvent(timeouts, "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    expect(settings().timeoutsPerGame).toBe(6);
    await fireEvent(timeouts, "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
    expect(settings().timeoutsPerGame).toBe(5);
  });

  it("toggles overtime and the possession arrow, and keeps the competition and venue", async () => {
    await render(<SetupScreen />);

    await choose("Overtime: Off");
    expect(settings().overtimeEnabled).toBe(false);
    await choose("Possession arrow: Off");
    expect(settings().possessionArrowEnabled).toBe(false);
    await choose("Possession arrow: On");
    expect(settings().possessionArrowEnabled).toBe(true);
    // Choosing the option that's already on changes nothing.
    await choose("Possession arrow: On");
    expect(settings().possessionArrowEnabled).toBe(true);

    await type("Competition", "Spring League");
    await type("Venue", "Community Arena");
    expect(settings()).toMatchObject({ competition: "Spring League", venue: "Community Arena" });
  });
});

describe("<SetupScreen /> teams", () => {
  it("edits a team's name, tag, coach and colour", async () => {
    await render(<SetupScreen />);

    await type("Team name", "Central");
    await type("Tag (3 letters)", "cent");
    await type("Head coach", "Phil");
    await choose("Team colour #10B981");
    expect(home()).toMatchObject({ name: "Central", tag: "CEN", coach: "Phil", color: "#10B981" });
    expect(screen.getByRole("header", { name: "Central" })).toBeOnTheScreen();
  });

  it("shows a colour from web that isn't in the palette as the selected swatch", async () => {
    state().setTeam("home", { color: "#123456" });
    await render(<SetupScreen />);
    expect(screen.getByRole("radio", { name: "Team colour #123456" })).toBeChecked();
  });

  it("adds players, starting them until the line-up is full", async () => {
    await render(<SetupScreen />);
    expect(screen.getByRole("button", { name: "Add home player" })).toBeDisabled();
    expect(screen.getAllByText("No players yet. Add at least 5 to start.")).toHaveLength(2);

    await type("New home player number", "2345");
    await type("New home player name", "Jordan");
    await press("Add home player");
    expect(home().roster).toEqual([
      expect.objectContaining({ number: "234", name: "Jordan", isStarter: true, isCaptain: false }),
    ]);
    expect(screen.getByLabelText("New home player name")).toHaveDisplayValue("");

    await type("New home player number", "234");
    await type("New home player name", "Copy");
    await fireEvent(screen.getByLabelText("New home player name"), "submitEditing");
    expect(screen.getByRole("alert")).toHaveTextContent("#234 is already on the roster.");
    expect(home().roster).toHaveLength(1);
    await type("New home player number", "9");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("edits, captains, benches and removes rostered players", async () => {
    rosterTeams();
    await render(<SetupScreen />);

    // The line-up is full, so the bench player can't start yet.
    expect(screen.getByRole("checkbox", { name: "Harper starts" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Jordan starts" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Harper starts" }));
    expect(home().roster.find((p) => p.name === "Harper")?.isStarter).toBe(true);
    expect(home().roster.find((p) => p.name === "Jordan")?.isStarter).toBe(false);

    await fireEvent.press(screen.getByRole("checkbox", { name: "Pippen is captain" }));
    expect(home().roster.find((p) => p.name === "Pippen")?.isCaptain).toBe(true);

    await type("Kerr jersey number", "2500");
    await type("Kerr name", "Steve Kerr");
    expect(home().roster.find((p) => p.name === "Steve Kerr")?.number).toBe("250");

    await press("Remove Harper");
    expect(home().roster.map((p) => p.name)).not.toContain("Harper");
  });

  it("doesn't add a player without a number and a name", async () => {
    await render(<SetupScreen />);
    await type("New home player name", "Jordan");
    await fireEvent(screen.getByLabelText("New home player name"), "submitEditing");
    expect(home().roster).toEqual([]);
  });

  it("calls a team with no name Unnamed team", async () => {
    await render(<SetupScreen />);
    await type("Team name", "");
    expect(screen.getByRole("header", { name: "Unnamed team" })).toBeOnTheScreen();
  });

  it("names a player with no name by their number", async () => {
    state().addPlayer("home", { number: "7", name: "", isStarter: true, isCaptain: false });
    await render(<SetupScreen />);
    expect(screen.getByRole("button", { name: "Remove #7" })).toBeOnTheScreen();
  });
});

describe("<SetupScreen /> navigation", () => {
  it("explains what's missing, then opens the game once both teams are ready", async () => {
    await render(<SetupScreen />);
    await press("Continue to game");
    expect(screen.getByRole("alert")).toHaveTextContent("Home Team needs at least 5 players.");
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await act(async () => rosterTeams());
    await press("Continue to game", 1);
    expect(state().status).toBe("ready");
    expect(mockRouter.replace).toHaveBeenCalledWith("/game");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("resets the setup", async () => {
    rosterTeams();
    await render(<SetupScreen />);
    await press("Reset");
    expect(home().roster).toEqual([]);
  });

  it("sends a game that has tipped off to the console", async () => {
    startLiveGame();
    await render(<SetupScreen />);
    expect(screen.getByText("Redirect to /game")).toBeOnTheScreen();
  });

  it("goes back to the games list", async () => {
    await render(<SetupScreen />);
    await press("Back to Games");
    expect(mockRouter.back).toHaveBeenCalled();

    mockRouter.canGoBack.mockReturnValue(false);
    await press("Back to Games");
    expect(mockRouter.replace).toHaveBeenCalledWith("/");
  });
});
