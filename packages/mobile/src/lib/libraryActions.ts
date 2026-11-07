import type { LibraryEntry } from "@thestats/app";
import { Alert } from "react-native";

import { confirm } from "@/lib/confirm";
import { deleteGame, getGame } from "@/lib/games";
import {
  continueSavedGame,
  deviceGameId,
  flushGameSync,
  hasUnsavedGameChanges,
  startNewGame,
} from "@/lib/gameSync";
import { useGameStore } from "@/lib/store";

/**
 * Deletes a game from the library, after asking. If it's also the game on
 * this device, the device starts a fresh game: the deleted one's changes
 * would have nowhere to go. Resolves true once it's deleted.
 */
export async function deleteSavedGame(entry: LibraryEntry): Promise<boolean> {
  const onDevice = deviceGameId() === entry.id;
  const sure = await confirm(
    entry.status === "finished" ? "Delete this game?" : "Delete this game in progress?",
    `${entry.homeTeamName} vs ${entry.awayTeamName} is removed from your library on every device` +
      `${onDevice ? ", and cleared from this one" : ""}. This can't be undone.`,
    "Delete",
    "destructive",
  );
  if (!sure) return false;

  const result = await deleteGame(entry.id);
  if (!result.ok) {
    Alert.alert("Couldn't delete the game", result.message);
    return false;
  }
  if (onDevice) startNewGame();
  return true;
}

/**
 * Makes a game in progress from the library the game on this device, to
 * carry on scoring it here. Asks before replacing a game being played on
 * the device, saves that game to the account first, and warns before
 * dropping changes that couldn't be saved. Resolves true when the game is
 * ready to score.
 */
export async function continueFromLibrary(entry: LibraryEntry): Promise<boolean> {
  if (deviceGameId() === entry.id) return true;

  const status = useGameStore.getState().status;
  if (
    status !== "setup" &&
    status !== "finished" &&
    !(await confirm(
      "Replace the game on this device?",
      "It stays in your games list. The game you opened takes its place here.",
      "Replace",
      "destructive",
    ))
  ) {
    return false;
  }

  await flushGameSync();
  if (
    hasUnsavedGameChanges() &&
    !(await confirm(
      "Not saved yet",
      "The latest changes to the game on this device haven't reached your account. Open this game anyway and lose them?",
      "Open anyway",
      "destructive",
    ))
  ) {
    return false;
  }

  const result = await getGame(entry.id);
  if (!result.ok) {
    Alert.alert("Couldn't open the game", result.message);
    return false;
  }
  continueSavedGame(entry.id, result.game.state);
  return true;
}
