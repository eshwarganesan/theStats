import Storage from "expo-sqlite/kv-store";
import type { KeyValueStorage } from "@thestats/app";

/** The last value this session wrote to each key. */
const written = new Map<string, string>();

/**
 * iOS binding of the `@thestats/app` persistence contract, backed by
 * expo-sqlite's key-value store.
 *
 * The synchronous API is deliberate: the persist `merge` callback and
 * `hydrateFromLibrary` read the clock checkpoint inline, so restore
 * semantics stay identical to web's `localStorage`. expo-sqlite also
 * ships in Expo Go, so the app runs without a custom dev build.
 *
 * Writing the value a key already holds is skipped. The game store saves
 * on every state change, clock ticks included, but the saved record
 * leaves the clock out, so a running clock would otherwise rewrite the
 * same row about 60 times a second.
 */
export const deviceStorage: KeyValueStorage = {
  getItem: (key) => Storage.getItemSync(key),
  setItem: (key, value) => {
    if (written.get(key) === value) return;
    Storage.setItemSync(key, value);
    written.set(key, value);
  },
  removeItem: (key) => {
    written.delete(key);
    Storage.removeItemSync(key);
  },
};
