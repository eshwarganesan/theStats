import {
  WriteThroughController,
  clearPersistedGame,
  subscribeToGameRecord,
  toPersistedGameRecord,
  type PersistedGameRecord,
  type RetryPolicy,
  type SyncState,
} from "@thestats/app";
import { useEffect } from "react";
import { AppState } from "react-native";

import { apiFetch } from "@/lib/api";
import { deviceStorage } from "@/lib/storage";
import { useGameStore } from "@/lib/store";

/**
 * Saves the game on this device to the signed-in user's library, with
 * the same write-through controller web uses (`@thestats/app`): debounced
 * full-state writes to /api/games, sent with the user's bearer token.
 *
 * Courtside connections drop, so on top of web's behavior:
 *   - failed writes retry with backoff, and right away whenever the app
 *     comes back to the foreground;
 *   - pending changes are written as soon as the app is backgrounded;
 *   - the server game id, the pending create key and whether changes are
 *     unsaved survive the app being killed, so a relaunch PATCHes the same
 *     row (or retries the same POST) and finishes any unsaved write.
 */
export const SYNC_STORAGE_KEY = "thestats.sync.v1";

const RETRY: RetryPolicy = { initialMs: 2_000, maxMs: 60_000 };

interface StoredSync extends SyncState {
  schemaVersion: 1;
  /** The account the game on this device belongs to. */
  userId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function readStoredSync(): StoredSync | null {
  let value: unknown;
  try {
    const raw = deviceStorage.getItem(SYNC_STORAGE_KEY);
    if (raw === null) return null;
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const { schemaVersion, userId, gameId, createKey, unsaved } = value;
  if (
    schemaVersion !== 1 ||
    typeof userId !== "string" ||
    !isNullableString(gameId) ||
    !isNullableString(createKey) ||
    typeof unsaved !== "boolean"
  ) {
    return null;
  }
  return { schemaVersion, userId, gameId, createKey, unsaved };
}

/** True when a record exists, or when storage can't say (unknown owner). */
function hasStoredSync(): boolean {
  try {
    return deviceStorage.getItem(SYNC_STORAGE_KEY) !== null;
  } catch {
    return true;
  }
}

/** Best-effort, like the clock checkpoint: if storage fails, syncing
 *  carries on and only resuming after a restart is lost. */
function writeStoredSync(value: StoredSync): void {
  try {
    deviceStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
}

/**
 * Makes sure the game on this device belongs to `userId` before their
 * screens render. A game left by another account, or one whose owner
 * can't be read, is cleared along with its sync record. The same
 * user's game is kept, unsaved changes included, so it finishes syncing.
 */
export function claimDeviceGame(userId: string): void {
  if (readStoredSync()?.userId === userId) return;
  if (hasStoredSync()) {
    useGameStore.getState().resetAll();
    clearPersistedGame(deviceStorage);
  }
  writeStoredSync({ schemaVersion: 1, userId, gameId: null, createKey: null, unsaved: false });
}

let active: WriteThroughController | null = null;

/**
 * Keeps the device's game saved to `userId`'s library while mounted.
 * Mount it once, inside the signed-in part of the app.
 */
export function useGameSync(userId: string): void {
  useEffect(() => {
    const stored = readStoredSync();
    const resume = stored?.userId === userId ? stored : null;
    const controller = new WriteThroughController({
      signedIn: true,
      fetch: apiFetch,
      retry: RETRY,
      initialState: resume ?? undefined,
      onSyncStateChange: (state) => writeStoredSync({ schemaVersion: 1, userId, ...state }),
    });
    active = controller;

    const unsubscribe = subscribeToGameRecord(useGameStore, (record) => {
      controller.onCommit(record);
    });
    // Changes that hadn't reached the server when the app last closed.
    if (resume?.unsaved) controller.onCommit(toPersistedGameRecord(useGameStore.getState()));

    // Backgrounding: write now, while iOS still lets the app run.
    // Foregrounding: retry anything a dropped connection held back.
    const appState = AppState.addEventListener("change", () => {
      void controller.flush();
    });

    return () => {
      appState.remove();
      unsubscribe();
      controller.dispose();
      if (active === controller) active = null;
    };
  }, [userId]);
}

/**
 * Pushes unsaved changes while the session can still write them; called
 * just before sign-out. Gives up after `timeoutMs` so a dead connection
 * can't hold sign-out hostage. Anything left stays on the device and
 * syncs if the same user signs back in.
 */
export async function flushGameSync(timeoutMs = 5_000): Promise<void> {
  const controller = active;
  if (!controller) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  await Promise.race([controller.flush(), timeout]);
  clearTimeout(timer);
}

/** Whether the game on this device has changes the server hasn't saved. */
export function hasUnsavedGameChanges(): boolean {
  return active?.getSyncState().unsaved ?? readStoredSync()?.unsaved ?? false;
}

/**
 * The account the game on this device belongs to, if a sync record names
 * one. A signed-out app asks whether it still exists (feature 018).
 */
export function deviceGameOwner(): string | null {
  return readStoredSync()?.userId ?? null;
}

/** The library id of the game on this device, once it has been saved. */
export function deviceGameId(): string | null {
  return active ? active.currentGameId() : (readStoredSync()?.gameId ?? null);
}

/**
 * Points sync at another library game (null: a new one) and drops the
 * device's copy of the old game and its clock. Unsaved changes to the old
 * game are dropped too, so callers flush first.
 */
function switchDeviceGame(gameId: string | null): void {
  if (active) {
    active.setGameId(gameId);
  } else {
    const stored = readStoredSync();
    if (stored) writeStoredSync({ ...stored, gameId, createKey: null, unsaved: false });
  }
  clearPersistedGame(deviceStorage);
}

/**
 * Replaces the game on this device with a blank one in setup. Sync lets
 * go of the current game first, so the new game's first save creates its
 * own library entry instead of overwriting the old one, as web's
 * "New game" does. Unsaved changes to the old game are dropped: call
 * `flushGameSync` first and check `hasUnsavedGameChanges`.
 */
export function startNewGame(): void {
  switchDeviceGame(null);
  useGameStore.getState().resetAll();
}

/**
 * Makes the library game `gameId` the game on this device, to carry on
 * scoring it here. Sync switches to it before the store changes, so its
 * saves update that library entry. The clock isn't saved to the library,
 * so it starts at the period length, paused. As with `startNewGame`,
 * flush first: unsaved changes to the old game are dropped.
 */
export function continueSavedGame(gameId: string, state: PersistedGameRecord): void {
  switchDeviceGame(gameId);
  useGameStore.getState().hydrateFromLibrary(state, { force: true });
}

/**
 * Forgets the game on this device once its account is gone (feature 018,
 * FR-008 / FR-009). Unlike signing out, nothing is flushed: unsaved
 * changes are dropped, because there's no account left to save them to.
 * The sync record goes too, so the next sign-in starts on a clean device.
 */
export function forgetDeviceGame(): void {
  active?.dispose();
  active = null;
  useGameStore.getState().resetAll();
  clearPersistedGame(deviceStorage);
  try {
    deviceStorage.removeItem(SYNC_STORAGE_KEY);
  } catch {
    // ignore: claimDeviceGame treats an unreadable record as another owner's
  }
}
