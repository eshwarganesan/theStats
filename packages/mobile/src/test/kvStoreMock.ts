/**
 * In-memory stand-in for `expo-sqlite/kv-store`, whose native SQLite
 * module is unavailable under Jest. Mirrors the synchronous subset the
 * app uses. Wired in via `jest.moduleNameMapper` in package.json.
 */
const data = new Map<string, string>();

const Storage = {
  getItemSync: jest.fn((key: string): string | null => data.get(key) ?? null),
  setItemSync: jest.fn((key: string, value: string): void => {
    data.set(key, value);
  }),
  removeItemSync: jest.fn((key: string): boolean => data.delete(key)),
};

export default Storage;
