import type { LibraryEntry, PersistedGameRecord } from "@thestats/app";
import { toPersistedGameRecord } from "@thestats/app";
import { Alert } from "react-native";

import { deleteGame, getGame } from "@/lib/games";
import {
  continueSavedGame,
  deviceGameId,
  flushGameSync,
  hasUnsavedGameChanges,
  startNewGame,
} from "@/lib/gameSync";
import { useGameStore } from "@/lib/store";
import { startLiveGame } from "@/test/gameFixtures";

import { continueFromLibrary, deleteSavedGame } from "./libraryActions";

jest.mock("@/lib/games", () => ({ getGame: jest.fn(), deleteGame: jest.fn() }));
jest.mock("@/lib/gameSync", () => ({
  continueSavedGame: jest.fn(),
  deviceGameId: jest.fn(() => null),
  flushGameSync: jest.fn(async () => {}),
  hasUnsavedGameChanges: jest.fn(() => false),
  startNewGame: jest.fn(),
}));

const getGameMock = jest.mocked(getGame);
const deleteGameMock = jest.mocked(deleteGame);
const deviceGameIdMock = jest.mocked(deviceGameId);
const unsavedMock = jest.mocked(hasUnsavedGameChanges);

const entry: LibraryEntry = {
  id: "g1",
  status: "in-progress",
  homeTeamName: "Central",
  awayTeamName: "Eastridge",
  homeScore: 10,
  awayScore: 8,
  eventCount: 12,
  currentPeriod: 2,
  startedAt: "2026-10-01T18:00:00Z",
  lastActivityAt: "2026-10-01T18:40:00Z",
  finishedAt: null,
};

let state: PersistedGameRecord;

/** Answers the next alerts by pressing these buttons; returns the spy. */
function answerAlerts(...answers: string[]) {
  return jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
    const answer = answers.shift();
    buttons?.find((b) => b.text === answer)?.onPress?.();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  deviceGameIdMock.mockReturnValue(null);
  unsavedMock.mockReturnValue(false);
  startLiveGame();
  state = toPersistedGameRecord(useGameStore.getState());
  useGameStore.getState().resetAll();
});

afterEach(() => jest.restoreAllMocks());

describe("deleteSavedGame", () => {
  it("deletes the game once confirmed", async () => {
    deleteGameMock.mockResolvedValueOnce({ ok: true });
    const alert = answerAlerts("Delete");

    await expect(deleteSavedGame(entry)).resolves.toBe(true);
    expect(alert).toHaveBeenCalledWith(
      "Delete this game in progress?",
      "Central vs Eastridge is removed from your library on every device. This can't be undone.",
      expect.any(Array),
      expect.any(Object),
    );
    expect(deleteGameMock).toHaveBeenCalledWith("g1");
    expect(startNewGame).not.toHaveBeenCalled();
  });

  it("does nothing when cancelled", async () => {
    answerAlerts("Cancel");
    await expect(deleteSavedGame({ ...entry, status: "finished" })).resolves.toBe(false);
    expect(deleteGameMock).not.toHaveBeenCalled();
  });

  it("clears the device too when the game is the one on it", async () => {
    deviceGameIdMock.mockReturnValue("g1");
    deleteGameMock.mockResolvedValueOnce({ ok: true });
    const alert = answerAlerts("Delete");

    await expect(deleteSavedGame({ ...entry, status: "finished" })).resolves.toBe(true);
    expect(alert).toHaveBeenCalledWith(
      "Delete this game?",
      expect.stringContaining("on every device, and cleared from this one."),
      expect.any(Array),
      expect.any(Object),
    );
    expect(startNewGame).toHaveBeenCalled();
  });

  it("says why when the deletion fails", async () => {
    deleteGameMock.mockResolvedValueOnce({ ok: false, message: "Couldn't delete the game." });
    const alert = answerAlerts("Delete");

    await expect(deleteSavedGame(entry)).resolves.toBe(false);
    expect(alert).toHaveBeenLastCalledWith("Couldn't delete the game", "Couldn't delete the game.");
  });
});

describe("continueFromLibrary", () => {
  it("is ready straight away when it's already the game on this device", async () => {
    deviceGameIdMock.mockReturnValue("g1");
    await expect(continueFromLibrary(entry)).resolves.toBe(true);
    expect(getGameMock).not.toHaveBeenCalled();
  });

  it("loads the game when nothing is being played on the device", async () => {
    getGameMock.mockResolvedValueOnce({ ok: true, game: { entry, state } });
    const alert = answerAlerts();

    await expect(continueFromLibrary(entry)).resolves.toBe(true);
    expect(alert).not.toHaveBeenCalled();
    expect(flushGameSync).toHaveBeenCalled();
    expect(continueSavedGame).toHaveBeenCalledWith("g1", state);
  });

  it("asks before replacing a game being played on the device", async () => {
    startLiveGame();
    answerAlerts("Cancel");
    await expect(continueFromLibrary(entry)).resolves.toBe(false);
    expect(flushGameSync).not.toHaveBeenCalled();

    getGameMock.mockResolvedValueOnce({ ok: true, game: { entry, state } });
    answerAlerts("Replace");
    await expect(continueFromLibrary(entry)).resolves.toBe(true);
    expect(continueSavedGame).toHaveBeenCalled();
  });

  it("warns before dropping changes that didn't reach the account", async () => {
    unsavedMock.mockReturnValue(true);
    answerAlerts("Cancel");
    await expect(continueFromLibrary(entry)).resolves.toBe(false);
    expect(getGameMock).not.toHaveBeenCalled();

    getGameMock.mockResolvedValueOnce({ ok: true, game: { entry, state } });
    answerAlerts("Open anyway");
    await expect(continueFromLibrary(entry)).resolves.toBe(true);
  });

  it("says why when the game can't be loaded", async () => {
    getGameMock.mockResolvedValueOnce({ ok: false, message: "That game isn't in your library any more." });
    const alert = answerAlerts();

    await expect(continueFromLibrary(entry)).resolves.toBe(false);
    expect(alert).toHaveBeenCalledWith(
      "Couldn't open the game",
      "That game isn't in your library any more.",
    );
    expect(continueSavedGame).not.toHaveBeenCalled();
  });
});
