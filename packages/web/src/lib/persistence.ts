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
