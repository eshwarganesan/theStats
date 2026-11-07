import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { useKeepAwake } from "expo-keep-awake";

import GameScreen from "@/app/game";
import { ActionPad, nextPeriodLabel } from "@/components/game/ActionPad";
import { useGameStore } from "@/lib/store";
import { rosterTeams, startLiveGame } from "@/test/gameFixtures";

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
};
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));
jest.mock("expo-keep-awake", () => ({ useKeepAwake: jest.fn() }));
const keepAwake = jest.mocked(useKeepAwake);

const state = () => useGameStore.getState();
const lastEvent = () => state().events.at(-1);

async function press(name: string | RegExp) {
  await fireEvent.press(screen.getByRole("button", { name }));
}

/** Queries inside the open sheet only (the console stays mounted behind it). */
function sheet() {
  return within(screen.getByTestId("sheet"));
}

async function inSheet(role: "button" | "radio", name: string | RegExp) {
  await fireEvent.press(sheet().getByRole(role, { name }));
}

async function store(action: () => void) {
  await act(async () => action());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.canGoBack.mockReturnValue(true);
  state().resetAll();
});

describe("<GameScreen />", () => {
  it("sends you to setup when no game has been set up", async () => {
    await render(<GameScreen />);
    expect(screen.getByText("No game in progress")).toBeOnTheScreen();
    await press("Set up a game");
    expect(mockRouter.replace).toHaveBeenCalledWith("/setup");
  });

  it("tips off a prepared game, and lets you go back to setup until then", async () => {
    rosterTeams();
    await store(() => state().prepareGame());
    await render(<GameScreen />);
    expect(keepAwake).toHaveBeenCalled();

    await press("Edit setup");
    expect(mockRouter.replace).toHaveBeenCalledWith("/setup");

    await press("Tip off");
    expect(state().status).toBe("live");
    expect(screen.queryByRole("button", { name: "Edit setup" })).toBeNull();
  });

  it("starts and stops the clock", async () => {
    startLiveGame();
    await render(<GameScreen />);
    await press("Start clock");
    expect(state().clockRunning).toBe(true);
    await press("Stop clock");
    expect(state().clockRunning).toBe(false);
  });

  it("records a player's play at the clock time when they were tapped", async () => {
    startLiveGame();
    await store(() => state().adjustClock(300));
    await render(<GameScreen />);

    await press("Jordan, number 10, 0 points, 0 fouls");
    expect(sheet().getByRole("header", { name: "#10 Jordan" })).toBeOnTheScreen();

    // The clock moves on while the scorekeeper picks the action; the
    // time of play stays at the tap.
    await store(() => useGameStore.setState({ clockSeconds: 291.5 }));
    expect(sheet().getByText("04:51")).toBeOnTheScreen();
    expect(sheet().getByText("05:00")).toBeOnTheScreen();
    await inSheet("button", "+3 Made");

    expect(lastEvent()).toMatchObject({
      type: "score",
      side: "home",
      kind: "3pt",
      made: true,
      clockAt: 300,
    });
    expect(screen.queryByTestId("sheet")).toBeNull();
    expect(screen.getByLabelText("Central 3")).toBeOnTheScreen();
    expect(screen.getByText("#10 Jordan scored 3")).toBeOnTheScreen();
  });

  it("records misses, stats and fouls", async () => {
    startLiveGame();
    await render(<GameScreen />);

    await press(/^Bird, number 30/);
    await inSheet("button", "2 Missed");
    expect(lastEvent()).toMatchObject({ type: "score", kind: "2pt", made: false, side: "away" });

    await press(/^Bird, number 30/);
    await inSheet("button", "Assist");
    expect(lastEvent()).toMatchObject({ type: "stat", kind: "assist" });

    await press(/^Bird, number 30/);
    await inSheet("button", "Personal foul");
    expect(lastEvent()).toMatchObject({ type: "foul", kind: "personal" });
    expect(screen.getByRole("button", { name: "Bird, number 30, 0 points, 1 fouls" })).toBeOnTheScreen();
  });

  it("runs the clock from the player sheet without closing it", async () => {
    startLiveGame();
    await render(<GameScreen />);
    await press(/^Jordan, number 10/);

    await inSheet("button", "Take off 1 second");
    expect(state().clockSeconds).toBe(599);
    await inSheet("button", "Start clock");
    expect(state().clockRunning).toBe(true);
    await inSheet("button", "Stop clock");
    expect(state().clockRunning).toBe(false);

    await inSheet("button", "Close");
    expect(screen.queryByTestId("sheet")).toBeNull();
  });

  it("substitutes a bench player in", async () => {
    startLiveGame();
    await render(<GameScreen />);

    await press("Substitution, Central");
    expect(sheet().getByRole("button", { name: "Confirm swap" })).toBeDisabled();
    await inSheet("radio", "Jordan out");
    await inSheet("radio", "Harper in");
    await inSheet("button", "Confirm swap");

    const harper = state().homeTeam.roster.find((p) => p.name === "Harper");
    expect(state().onCourt.home).toContain(harper?.id);
    expect(screen.getByRole("button", { name: /^Harper, number 15/ })).toBeOnTheScreen();
    expect(screen.getByText("Sub: #15 Harper in for #10 Jordan")).toBeOnTheScreen();
  });

  it("records a team turnover and a score award", async () => {
    startLiveGame();
    await render(<GameScreen />);

    await press("Team actions, Eastridge");
    await inSheet("button", "24-Second Violation");
    expect(lastEvent()).toMatchObject({ type: "team-turnover", side: "away", kind: "24-second" });

    await press("Team actions, Eastridge");
    const add = () => sheet().getByRole("button", { name: "Add points" });
    expect(add()).toBeDisabled();
    await fireEvent.changeText(sheet().getByLabelText("Points to add"), "1.5");
    expect(add()).toBeDisabled();
    await fireEvent.changeText(sheet().getByLabelText("Points to add"), "2");
    await fireEvent.changeText(sheet().getByLabelText("Reason (optional)"), " technical ");
    await fireEvent.press(add());

    expect(lastEvent()).toMatchObject({ type: "team-score-adjust", points: 2, reason: "technical" });
    expect(screen.getByLabelText("Eastridge 2")).toBeOnTheScreen();
  });

  it("only takes team turnovers once the game is live", async () => {
    rosterTeams();
    await store(() => state().prepareGame());
    await render(<GameScreen />);

    await press("Team actions, Central");
    expect(sheet().getByText("Turnovers can be recorded once the game is live.")).toBeOnTheScreen();
    expect(sheet().getByRole("button", { name: "8-Second Violation" })).toBeDisabled();
  });

  it("calls a timeout and resumes play", async () => {
    startLiveGame();
    await render(<GameScreen />);

    await press("Timeout, Central, 5 left");
    expect(state().status).toBe("timeout");
    expect(screen.getByText("Timeout")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Timeout, Eastridge, 5 left" })).toBeDisabled();

    await press("End timeout");
    expect(state().status).toBe("live");
    expect(screen.getByRole("button", { name: "Timeout, Central, 4 left" })).toBeEnabled();
  });

  it("undoes the last play", async () => {
    startLiveGame();
    const jordan = state().homeTeam.roster[0];
    await store(() => state().recordScore("home", jordan?.id ?? "", "2pt", true));
    await render(<GameScreen />);
    expect(screen.getByLabelText("Central 2")).toBeOnTheScreen();

    await press("Undo last play");
    expect(screen.getByLabelText("Central 0")).toBeOnTheScreen();
  });

  it("ends a period and starts the next one", async () => {
    startLiveGame();
    await render(<GameScreen />);

    await press("End period");
    expect(state().status).toBe("period-break");
    expect(screen.getByText("Break")).toBeOnTheScreen();
    expect(screen.getByLabelText("Break 02:00")).toBeOnTheScreen();

    await press("Start next quarter");
    expect(state()).toMatchObject({ currentPeriod: 2, status: "live", clockSeconds: 600 });
    expect(screen.getByRole("button", { name: "Start clock" })).toBeOnTheScreen();
  });

  it("offers End period once the clock runs out", async () => {
    startLiveGame();
    await store(() => useGameStore.setState({ clockSeconds: 0 }));
    await render(<GameScreen />);

    const buttons = screen.getAllByRole("button", { name: "End period" });
    expect(buttons).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Start clock" })).toBeNull();
    await fireEvent.press(buttons[0] ?? buttons[1]!);
    expect(state().status).toBe("period-break");
  });

  it("points the possession arrow", async () => {
    startLiveGame();
    await render(<GameScreen />);

    await press("Possession arrow: Central");
    expect(state().possessionArrow).toBe("home");
    expect(screen.getByRole("button", { name: "Possession arrow: Central" })).toBeSelected();

    await press("Possession arrow: Eastridge");
    expect(state().possessionArrow).toBe("away");
  });

  it("corrects the stopped clock by typing or nudging", async () => {
    startLiveGame();
    await render(<GameScreen />);
    expect(screen.getByRole("button", { name: "Add 1 minute" })).toBeDisabled();

    await press("Game clock 10:00");
    const input = screen.getByLabelText("Clock time, minutes and seconds");
    await fireEvent.changeText(input, "4:30");
    await fireEvent(input, "submitEditing");
    expect(state().clockSeconds).toBe(270);

    await press("Game clock 04:30");
    await fireEvent.changeText(screen.getByLabelText("Clock time, minutes and seconds"), "nope");
    await fireEvent(screen.getByLabelText("Clock time, minutes and seconds"), "blur");
    expect(state().clockSeconds).toBe(270);

    await press("Take off 1 minute");
    await press("Add 1 second");
    expect(state().clockSeconds).toBe(211);
  });

  it("shows a finished game read-only", async () => {
    startLiveGame();
    await store(() => state().finishGame());
    await render(<GameScreen />);

    expect(screen.getAllByText("Final")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /^Jordan, number 10/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Substitution, Central" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Undo last play" })).toBeNull();
    expect(keepAwake).not.toHaveBeenCalled();
  });

  it("goes back to the games list", async () => {
    startLiveGame();
    await render(<GameScreen />);
    await press("Back to Games");
    expect(mockRouter.back).toHaveBeenCalled();

    mockRouter.canGoBack.mockReturnValue(false);
    await press("Back to Games");
    expect(mockRouter.replace).toHaveBeenCalledWith("/");
  });

  it("flags a team in the bonus once it reaches the foul limit", async () => {
    startLiveGame();
    const fouls = (n: number) =>
      store(() => {
        for (let i = 0; i < n; i++) {
          state().recordFoul("away", state().awayTeam.roster[i]?.id ?? "", "personal");
        }
      });
    await fouls(4);
    await render(<GameScreen />);
    expect(screen.queryByText("Bonus")).toBeNull();

    await fouls(1);
    // One badge: only the team that committed the fouls.
    expect(screen.getAllByText("Bonus")).toHaveLength(1);
  });

  it("says when there's no one on the bench to bring in", async () => {
    startLiveGame();
    const harper = state().homeTeam.roster.find((p) => p.name === "Harper");
    await store(() => state().removePlayer("home", harper?.id ?? ""));
    await render(<GameScreen />);

    await press("Substitution, Central");
    expect(sheet().getByText("No one on the bench.")).toBeOnTheScreen();
    await inSheet("radio", "Jordan out");
    expect(sheet().getByRole("button", { name: "Confirm swap" })).toBeDisabled();
  });

  it("ignores a tap on the side the arrow already points to", async () => {
    startLiveGame();
    const setArrow = jest.fn(state().setPossessionArrow);
    useGameStore.setState({ setPossessionArrow: setArrow });
    await render(<GameScreen />);

    await press("Possession arrow: Central");
    await press("Possession arrow: Central");
    expect(setArrow).toHaveBeenCalledTimes(1);
  });

  it("opens the sheet for the next player straight after a play", async () => {
    startLiveGame();
    await render(<GameScreen />);

    await press(/^Jordan, number 10/);
    await inSheet("button", "+2 Made");
    await press(/^Pippen, number 11/);

    expect(sheet().getByRole("header", { name: "#11 Pippen" })).toBeOnTheScreen();
    await inSheet("button", "Assist");
    expect(lastEvent()).toMatchObject({ type: "stat", kind: "assist", side: "home" });
  });

  it("starts the substitution and award forms afresh each time they open", async () => {
    startLiveGame();
    await render(<GameScreen />);

    await press("Substitution, Central");
    await inSheet("radio", "Jordan out");
    await inSheet("button", "Cancel");
    await press("Substitution, Central");
    expect(sheet().getByRole("radio", { name: "Jordan out" })).not.toBeChecked();
    expect(sheet().getByRole("button", { name: "Confirm swap" })).toBeDisabled();
    await inSheet("button", "Close");

    await press("Team actions, Central");
    await fireEvent.changeText(sheet().getByLabelText("Points to add"), "3");
    await inSheet("button", "Close");
    await press("Team actions, Central");
    expect(sheet().getByLabelText("Points to add")).toHaveDisplayValue("");
  });

  it("closes a sheet when it's swiped away", async () => {
    startLiveGame();
    await render(<GameScreen />);
    await press(/^Jordan, number 10/);
    await fireEvent(screen.getByTestId("sheet-modal"), "requestClose");
    expect(screen.queryByTestId("sheet")).toBeNull();
  });

  it("counts down a timeout in the clock's place", async () => {
    startLiveGame();
    await store(() => state().recordTimeout("away"));
    await render(<GameScreen />);
    expect(screen.getByLabelText("Timeout 01:00")).toBeOnTheScreen();
  });
});

describe("<ActionPad />", () => {
  it("only hints at setup before the game is set up", async () => {
    await render(<ActionPad />);
    expect(screen.getByText("Finish setup to start.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "End period" })).toBeDisabled();
  });
});

describe("nextPeriodLabel", () => {
  it("names the half, quarter or overtime that comes next", () => {
    expect(nextPeriodLabel(1, 4)).toBe("Start next quarter");
    expect(nextPeriodLabel(2, 4)).toBe("Start second half");
    expect(nextPeriodLabel(3, 4)).toBe("Start next quarter");
    expect(nextPeriodLabel(4, 4)).toBe("Start overtime");
    expect(nextPeriodLabel(1, 3)).toBe("Start next quarter");
  });
});
