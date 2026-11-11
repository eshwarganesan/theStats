/**
 * Browser binding of the `@thestats/app` persistence layer.
 *
 * Owns every direct `localStorage` call in the web app. The Zustand
 * store reaches storage through `createPersistedGameStore` in `./store`;
 * the clock-checkpoint hook calls `writeClockCheckpoint` / `readClockCheckpoint`;
 * the home-page "New Game" button calls `clearPersistedGame`; the
 * storage-unavailable modal calls `isStorageAvailable`. Nothing else may
 * touch `window.localStorage` directly.
 */

import {
  clearPersistedGame as clearPersistedGameIn,
  readClockCheckpoint as readClockCheckpointFrom,
  writeClockCheckpoint as writeClockCheckpointTo,
  type ClockCheckpoint,
  type KeyValueStorage,
} from "@thestats/app";

export {
  CLOCK_CHECKPOINT_KEY,
  GAME_STORAGE_KEY,
  notifyRecoveryFailed,
  parseGameRecord,
  subscribeRecoveryFailed,
  type ClockCheckpoint,
  type PersistedGameRecord,
} from "@thestats/app";

const PROBE_KEY = "thestats.probe.v1";

// ─── Storage availability ──────────────────────────────────────────────

export function isStorageAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const ls = window.localStorage;
    ls.setItem(PROBE_KEY, "1");
    ls.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * `window.localStorage`, or `null` during SSR or when the accessor
 * itself throws (some sandboxed iframes).
 */
export function getBrowserStorage(): KeyValueStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// ─── Clock checkpoint ──────────────────────────────────────────────────

export function readClockCheckpoint(): ClockCheckpoint | null {
  const storage = getBrowserStorage();
  return storage ? readClockCheckpointFrom(storage) : null;
}

export function writeClockCheckpoint(checkpoint: ClockCheckpoint): void {
  const storage = getBrowserStorage();
  if (storage) writeClockCheckpointTo(storage, checkpoint);
}

// ─── Clear ─────────────────────────────────────────────────────────────

export function clearPersistedGame(): void {
  const storage = getBrowserStorage();
  if (storage) clearPersistedGameIn(storage);
}

// ─── Remembered account (feature 018) ──────────────────────────────────

/**
 * The account this browser was last signed in to, so a browser whose
 * session has expired can still ask whether that account was deleted.
 */
export const ACCOUNT_STORAGE_KEY = "thestats.account.v1";

export function rememberAccount(userId: string): void {
  const storage = getBrowserStorage();
  if (!storage) return;
  try {
    storage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify({ userId }));
  } catch {
    // ignore: without it, only the expired-session check is lost
  }
}

function parseRememberedAccount(raw: string): string | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || !("userId" in value)) return null;
    return typeof value.userId === "string" ? value.userId : null;
  } catch {
    return null;
  }
}

/** The remembered account's id; a malformed value is dropped. */
export function readRememberedAccount(): string | null {
  const storage = getBrowserStorage();
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(ACCOUNT_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const userId = parseRememberedAccount(raw);
  if (userId === null) forgetRememberedAccount();
  return userId;
}

export function forgetRememberedAccount(): void {
  const storage = getBrowserStorage();
  if (!storage) return;
  try {
    storage.removeItem(ACCOUNT_STORAGE_KEY);
  } catch {
    // ignore: storage can refuse writes (e.g. a sandboxed iframe)
  }
}
