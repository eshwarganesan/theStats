import Storage from "expo-sqlite/kv-store";
import type { KeyValueStorage } from "@thestats/app";

/**
 * iOS binding of the `@thestats/app` persistence contract, backed by
 * expo-sqlite's key-value store.
 *
 * The synchronous API is deliberate: the persist `merge` callback and
 * `hydrateFromLibrary` read the clock checkpoint inline, so restore
 * semantics stay identical to web's `localStorage`. expo-sqlite also
 * ships in Expo Go, so the app runs without a custom dev build.
 */
export const deviceStorage: KeyValueStorage = {
  getItem: (key) => Storage.getItemSync(key),
  setItem: (key, value) => Storage.setItemSync(key, value),
  removeItem: (key) => {
    Storage.removeItemSync(key);
  },
};
