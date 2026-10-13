"use client";

import { createPersistedGameStore } from "@thestats/app";
import { getBrowserStorage, isStorageAvailable } from "./persistence";

export { createGameStore, type GameState } from "@thestats/app";

/**
 * The web app's game store: the shared `@thestats/app` reducer persisted
 * to `localStorage`, falling back to in-memory state when storage is
 * unavailable (Safari private mode, SSR).
 */
export const useGameStore = createPersistedGameStore({
  getStorage: () => (isStorageAvailable() ? getBrowserStorage() : null),
});
