import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { toPersistedGameRecord, type LibraryEntry } from "@thestats/app";

import ReviewScreen from "@/app/games/[id]";
import { getGame, type GetGameResult } from "@/lib/games";
import { deleteSavedGame } from "@/lib/libraryActions";
import { useGameStore } from "@/lib/store";
import { player, startLiveGame } from "@/test/gameFixtures";

const mockRouter = { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ id: "g1" }),
}));
jest.mock("@/lib/games", () => ({ getGame: jest.fn() }));
jest.mock("@/lib/libraryActions", () => ({ deleteSavedGame: jest.fn() }));

const getGameMock = jest.mocked(getGame);
const deleteMock = jest.mocked(deleteSavedGame);

const entry: LibraryEntry = {
  id: "g1",
  status: "finished",
  homeTeamName: "Central",
  awayTeamName: "Eastridge",
  homeScore: 3,
  awayScore: 0,
  eventCount: 3,
  currentPeriod: 4,
  startedAt: "2026-10-01T18:00:00Z",
  lastActivityAt: "2026-10-01T19:30:00Z",
  finishedAt: "2026-10-01T19:30:00Z",
};

let loaded: GetGameResult;

/** A getGame call the test settles by hand. */
function deferred() {
  let resolve: (result: GetGameResult) => void = () => {};
  getGameMock.mockReturnValueOnce(new Promise((r) => (resolve = r)));
  return { resolve: (result: GetGameResult) => act(async () => resolve(result)) };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.canGoBack.mockReturnValue(true);
  // The saved game: Jordan hits a three, then the game ends.
  startLiveGame();
  useGameStore.getState().recordScore("home", player("home", "10").id, "3pt", true);
  useGameStore.getState().finishGame();
  loaded = { ok: true, game: { entry, state: toPersistedGameRecord(useGameStore.getState()) } };
  // A different game is on this device.
  useGameStore.getState().resetAll();
  useGameStore.getState().setTeam("home", { name: "Device Team" });
});

describe("<ReviewScreen />", () => {
  it("shows the saved game's final score and box scores, leaving the device's game alone", async () => {
    const load = deferred();
    await render(<ReviewScreen />);
    expect(screen.getByLabelText("Loading the game")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Delete game" })).toBeDisabled();

    await load.resolve(loaded);

    expect(getGameMock).toHaveBeenCalledWith("g1");
    expect(screen.getByRole("header", { name: "Central vs Eastridge" })).toBeOnTheScreen();
    expect(screen.getByLabelText("Final: Central 3, Eastridge 0")).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Jordan, number 10: 3 points, 1 of 1 field goals/)).toBeOnTheScreen();
    expect(useGameStore.getState().homeTeam.name).toBe("Device Team");
  });

  it("shows the scoresheet and the plays, read-only", async () => {
    getGameMock.mockResolvedValueOnce(loaded);
    await render(<ReviewScreen />);
    await screen.findByLabelText("Final: Central 3, Eastridge 0");

    await fireEvent.press(screen.getByRole("tab", { name: "Scoresheet" }));
    expect(screen.getByLabelText("Central: 1st 3, 2nd 0, 3rd 0, 4th 0. Final 3")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("tab", { name: "Plays" }));
    expect(screen.getByText("#10 Jordan scored 3")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /Jordan scored 3/ })).toBeNull();
  });

  it("offers to try again when the game can't be loaded", async () => {
    getGameMock
      .mockResolvedValueOnce({ ok: false, message: "Can't reach theStats." })
      .mockResolvedValueOnce(loaded);
    await render(<ReviewScreen />);

    expect(await screen.findByText("Can't reach theStats.")).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Game" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("Final: Central 3, Eastridge 0")).toBeOnTheScreen();
    expect(getGameMock).toHaveBeenCalledTimes(2);
  });

  it("goes back once the game is deleted", async () => {
    getGameMock.mockResolvedValueOnce(loaded);
    deleteMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await render(<ReviewScreen />);
    await screen.findByLabelText("Final: Central 3, Eastridge 0");

    await fireEvent.press(screen.getByRole("button", { name: "Delete game" }));
    expect(deleteMock).toHaveBeenCalledWith(entry);
    expect(mockRouter.back).not.toHaveBeenCalled();

    mockRouter.canGoBack.mockReturnValue(false);
    await fireEvent.press(screen.getByRole("button", { name: "Delete game" }));
    expect(mockRouter.replace).toHaveBeenCalledWith("/");
  });

  it("has the navigation sidebar's menu button, and a link back to the games list", async () => {
    getGameMock.mockResolvedValueOnce(loaded);
    await render(<ReviewScreen />);
    expect(screen.getByRole("button", { name: "Open navigation menu" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Back to Games" })).toBeNull();

    await fireEvent.press(await screen.findByRole("link", { name: "Back to your library" }));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("ignores a game that arrives after leaving the screen", async () => {
    const load = deferred();
    const { unmount } = await render(<ReviewScreen />);
    await unmount();
    await load.resolve(loaded);
    expect(screen.queryByLabelText("Final: Central 3, Eastridge 0")).toBeNull();
  });
});
