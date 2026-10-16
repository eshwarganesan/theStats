import * as SecureStore from "expo-secure-store";

/**
 * Supabase auth storage backed by the iOS keychain (expo-secure-store).
 *
 * SecureStore warns above ~2 KB per value and a Supabase session (two
 * JWTs plus user metadata) can exceed that, so each value is split into
 * chunks: `<key>.n` holds the chunk count and `<key>.0`, `<key>.1`, ...
 * hold the pieces. A missing piece reads as "no session" rather than a
 * corrupt token.
 *
 * AFTER_FIRST_UNLOCK keeps the session readable while the app refreshes
 * tokens in the background, without syncing it to other devices.
 */
export const CHUNK_SIZE = 1800;

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const countKey = (key: string) => `${key}.n`;
const chunkKey = (key: string, i: number) => `${key}.${i}`;

async function readCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(countKey(key), OPTIONS);
  const n = raw === null ? 0 : Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

async function deleteChunks(key: string, from: number, to: number): Promise<void> {
  for (let i = from; i < to; i++) {
    await SecureStore.deleteItemAsync(chunkKey(key, i), OPTIONS);
  }
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await readCount(key);
    if (count === 0) return null;
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i), OPTIONS);
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join("");
  },

  async setItem(key: string, value: string): Promise<void> {
    const previous = await readCount(key);
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    if (chunks.length === 0) chunks.push("");
    for (const [i, chunk] of chunks.entries()) {
      await SecureStore.setItemAsync(chunkKey(key, i), chunk, OPTIONS);
    }
    await SecureStore.setItemAsync(countKey(key), String(chunks.length), OPTIONS);
    await deleteChunks(key, chunks.length, previous);
  },

  async removeItem(key: string): Promise<void> {
    const count = await readCount(key);
    await SecureStore.deleteItemAsync(countKey(key), OPTIONS);
    await deleteChunks(key, 0, count);
  },
};
