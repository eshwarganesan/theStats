import { createPersistedGameStore } from "@thestats/app";
import { deviceStorage } from "./storage";

/**
 * The iOS app's game store: the shared `@thestats/app` reducer persisted
 * to the device key-value store, so a game survives the app being killed
 * mid-period.
 */
export const useGameStore = createPersistedGameStore({
  getStorage: () => deviceStorage,
});
