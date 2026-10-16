import * as SecureStore from "expo-secure-store";

import { CHUNK_SIZE, secureSessionStorage } from "./secureSessionStorage";

jest.mock("expo-secure-store", () => {
  const data = new Map<string, string>();
  return {
    __data: data,
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
    getItemAsync: jest.fn(async (k: string) => data.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => {
      data.set(k, v);
    }),
    deleteItemAsync: jest.fn(async (k: string) => {
      data.delete(k);
    }),
  };
});

const data = (SecureStore as unknown as { __data: Map<string, string> }).__data;
const KEY = "sb-ref-auth-token";

beforeEach(() => {
  data.clear();
  jest.clearAllMocks();
});

describe("secureSessionStorage", () => {
  it("returns null when nothing is stored", async () => {
    expect(await secureSessionStorage.getItem(KEY)).toBeNull();
  });

  it("round-trips a value larger than one chunk", async () => {
    const value = "x".repeat(CHUNK_SIZE * 2 + 5);
    await secureSessionStorage.setItem(KEY, value);
    expect(data.get(`${KEY}.n`)).toBe("3");
    expect(data.get(`${KEY}.2`)).toHaveLength(5);
    expect(await secureSessionStorage.getItem(KEY)).toBe(value);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      `${KEY}.0`,
      expect.any(String),
      { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY },
    );
  });

  it("stores an empty string as a single empty chunk", async () => {
    await secureSessionStorage.setItem(KEY, "");
    expect(await secureSessionStorage.getItem(KEY)).toBe("");
  });

  it("deletes leftover chunks when a value shrinks", async () => {
    await secureSessionStorage.setItem(KEY, "y".repeat(CHUNK_SIZE * 3));
    await secureSessionStorage.setItem(KEY, "short");
    expect(data.has(`${KEY}.1`)).toBe(false);
    expect(data.has(`${KEY}.2`)).toBe(false);
    expect(await secureSessionStorage.getItem(KEY)).toBe("short");
  });

  it("treats a missing chunk or a garbage count as no session", async () => {
    await secureSessionStorage.setItem(KEY, "z".repeat(CHUNK_SIZE + 1));
    data.delete(`${KEY}.1`);
    expect(await secureSessionStorage.getItem(KEY)).toBeNull();

    data.set(`${KEY}.n`, "nope");
    expect(await secureSessionStorage.getItem(KEY)).toBeNull();
  });

  it("removes the count and every chunk", async () => {
    await secureSessionStorage.setItem(KEY, "w".repeat(CHUNK_SIZE + 1));
    await secureSessionStorage.removeItem(KEY);
    expect(data.size).toBe(0);
    expect(await secureSessionStorage.getItem(KEY)).toBeNull();
  });
});
