import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";

import type { LibraryEntry } from "@thestats/app";

import { listGames } from "@/lib/games";
import { flushGameSync, hasUnsavedGameChanges, startNewGame } from "@/lib/gameSync";
import { continueFromLibrary, deleteSavedGame } from "@/lib/libraryActions";
import { useGameStore } from "@/lib/store";
import { startLiveGame } from "@/test/gameFixtures";

import HomeScreen from "@/app/index";

const mockRouter = { push: jest.fn() };
/** Every focus effect Home registered, to simulate it coming back into view. */
const mockFocusEffects: (() => void)[] = [];
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useFocusEffect: (effect: () => void) => {
    mockFocusEffects.push(effect);
    jest.requireActual<typeof import("react")>("react").useEffect(effect, [effect]);
  },
}));
jest.mock("@/lib/gameSync", () => ({
  flushGameSync: jest.fn(async () => {}),
  hasUnsavedGameChanges: jest.fn(() => false),
  startNewGame: jest.fn(),
}));
jest.mock("@/lib/games", () => ({ listGames: jest.fn() }));
jest.mock("@/lib/libraryActions", () => ({
  continueFromLibrary: jest.fn(),
  deleteSavedGame: jest.fn(),
}));
const unsaved = jest.mocked(hasUnsavedGameChanges);
const listGamesMock = jest.mocked(listGames);

const saved: LibraryEntry = {
  id: "g1",
  status: "finished",
  homeTeamName: "Saved Home",
  awayTeamName: "Saved Away",
  homeScore: 51,
  awayScore: 47,
  eventCount: 90,
  currentPeriod: 4,
  startedAt: "2026-10-01T18:00:00Z",
  lastActivityAt: "2026-10-01T19:30:00Z",
  finishedAt: "2026-10-01T19:30:00Z",
};

function library(...entries: LibraryEntry[]) {
  return { ok: true as const, page: { entries, nextCursor: null } };
}

/** Answers the next native alerts by pressing these buttons, in order. */
function answerAlerts(...answers: string[]) {
  return jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
    const answer = answers.shift();
    buttons?.find((b) => b.text === answer)?.onPress?.();
  });
}

beforeEach(() => {
  useGameStore.getState().resetAll();
  jest.clearAllMocks();
  mockFocusEffects.length = 0;
  unsaved.mockReturnValue(false);
  listGamesMock.mockResolvedValue(library(saved));
});

afterEach(() => jest.restoreAllMocks());

describe("<HomeScreen />", () => {
  it("shows the matchup and status from the shared store", async () => {
    useGameStore.getState().setTeam("home", { name: "Central High" });
    useGameStore.getState().setTeam("away", { name: "Eastridge" });
    await render(<HomeScreen />);

    expect(screen.getByText("Central High")).toBeOnTheScreen();
    expect(screen.getByText("Eastridge")).toBeOnTheScreen();
    expect(screen.getByText("Not started")).toBeOnTheScreen();
    expect(screen.getAllByText("0")).toHaveLength(2);
  });

  it("derives the score from recorded events via @thestats/core", async () => {
    useGameStore
      .getState()
      .addPlayer("home", { number: "23", name: "Jordan", isStarter: true, isCaptain: false });
    const shooter = useGameStore.getState().homeTeam.roster[0];
    if (!shooter) throw new Error("expected a rostered player");
    useGameStore.getState().recordScore("home", shooter.id, "3pt", true);
    await render(<HomeScreen />);

    expect(screen.getByText("3")).toBeOnTheScreen();
  });

  it("lists the account's saved games under the device's game", async () => {
    await render(<HomeScreen />);
    expect(screen.getByText("Not started")).toBeOnTheScreen();
    expect(await screen.findByText("Saved Home")).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Games" })).toBeOnTheScreen();
  });

  it("has only the menu and profile buttons in its header", async () => {
    await render(<HomeScreen />);
    expect(screen.getByRole("button", { name: "Open navigation menu" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Account" })).toBeOnTheScreen();
    // Sign out moved to the Account screen, as on web.
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("opens setup for a game that hasn't started", async () => {
    await render(<HomeScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Set up a game" }));
    expect(mockRouter.push).toHaveBeenCalledWith("/setup");
  });

  it("continues a game in progress", async () => {
    startLiveGame();
    await render(<HomeScreen />);
    expect(screen.getByText("Live")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Continue game" }));
    expect(mockRouter.push).toHaveBeenCalledWith("/game");
  });

  it("asks before replacing a game in progress, saves it, then starts a new one", async () => {
    startLiveGame();
    const alert = answerAlerts("New game");
    await render(<HomeScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "New game" }));

    expect(alert).toHaveBeenCalledWith(
      "Start a new game?",
      expect.any(String),
      expect.any(Array),
      expect.any(Object),
    );
    expect(flushGameSync).toHaveBeenCalled();
    expect(startNewGame).toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledWith("/setup");
  });

  it("keeps the game in progress when you cancel", async () => {
    startLiveGame();
    answerAlerts("Cancel");
    await render(<HomeScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "New game" }));

    expect(flushGameSync).not.toHaveBeenCalled();
    expect(startNewGame).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("warns before dropping changes that haven't reached the account", async () => {
    startLiveGame();
    unsaved.mockReturnValue(true);
    const alert = answerAlerts("New game", "Cancel");
    await render(<HomeScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "New game" }));
    expect(alert).toHaveBeenLastCalledWith(
      "Not saved yet",
      expect.any(String),
      expect.any(Array),
      expect.any(Object),
    );
    expect(startNewGame).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "New game" })).toBeEnabled();

    answerAlerts("New game", "Start anyway");
    await fireEvent.press(screen.getByRole("button", { name: "New game" }));
    expect(startNewGame).toHaveBeenCalled();
  });

  it("starts a new game after a finished one without asking", async () => {
    startLiveGame();
    await act(async () => useGameStore.getState().finishGame());
    const alert = answerAlerts();
    await render(<HomeScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "View game" }));
    expect(mockRouter.push).toHaveBeenCalledWith("/game");

    await fireEvent.press(screen.getByRole("button", { name: "New game" }));
    expect(alert).not.toHaveBeenCalled();
    expect(startNewGame).toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenLastCalledWith("/setup");
  });

  it("opens a finished game from the library for review", async () => {
    await render(<HomeScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: /^Saved Home 51, Saved Away 47\. Final\./ }));
    expect(mockRouter.push).toHaveBeenCalledWith("/games/g1");
    expect(continueFromLibrary).not.toHaveBeenCalled();
  });

  it("carries on a game in progress from the library", async () => {
    const live = { ...saved, id: "g2", status: "in-progress" as const, homeTeamName: "Live Home" };
    listGamesMock.mockResolvedValue(library(live));
    jest.mocked(continueFromLibrary).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await render(<HomeScreen />);
    const row = await screen.findByRole("button", { name: /^Live Home/ });

    await fireEvent.press(row);
    expect(continueFromLibrary).toHaveBeenCalledWith(live);
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(row).toBeEnabled();

    await fireEvent.press(row);
    expect(mockRouter.push).toHaveBeenCalledWith("/game");
  });

  it("reloads the library when Home comes back into view", async () => {
    await render(<HomeScreen />);
    await screen.findByText("Saved Home");
    expect(listGamesMock).toHaveBeenCalledTimes(1);

    listGamesMock.mockResolvedValueOnce(library({ ...saved, homeScore: 60 }));
    await act(async () => mockFocusEffects.at(-1)?.());
    expect(await screen.findByText("60")).toBeOnTheScreen();
    expect(listGamesMock).toHaveBeenCalledTimes(2);
  });

  it("deletes a saved game on long press", async () => {
    jest.mocked(deleteSavedGame).mockResolvedValueOnce(true);
    await render(<HomeScreen />);
    await fireEvent(await screen.findByRole("button", { name: /^Saved Home/ }), "longPress");
    expect(deleteSavedGame).toHaveBeenCalledWith(saved);
    expect(screen.queryByText("Saved Home")).toBeNull();
  });

});

describe("<HomeScreen /> account (feature 018)", () => {
  it("opens the Account screen in one press from the profile button", async () => {
    await render(<HomeScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Account" }));

    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith("/account");
  });
});
