import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

// Load .env.local into process.env so integration tests under
// tests/integration/auth/ can reach Supabase without callers exporting
// vars manually. We do NOT use @next/env's loadEnvConfig here because it
// intentionally skips .env.local when NODE_ENV === "test" (vitest's
// default), which is the exact case we want to support.
//
// Doesn't overwrite already-set vars, so CI / explicit exports still win.
(() => {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
})();

afterEach(() => {
  cleanup();
});

// jsdom does not implement HTMLDialogElement.showModal/close. The Modal
// component leans on these to manage open state, so we patch them with
// simple stand-ins that flip the `open` attribute and dispatch the
// expected events. Restored to no-op if jsdom adds support later.
if (typeof HTMLDialogElement !== "undefined") {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal !== "function") {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
  if (typeof proto.close !== "function") {
    proto.close = function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
}

// Node 22+ ships an experimental built-in `localStorage` that shadows
// jsdom's Storage instance inside vitest's jsdom env. The Node placeholder
// has no working `setItem`/`getItem`/`clear` without the
// `--localstorage-file` flag, which breaks every test that uses
// browser storage. Replace both globals with an in-memory polyfill that
// satisfies the `Storage` interface (including being a `Storage`
// instance so `Storage.prototype` spies still target it).
if (typeof window !== "undefined" && typeof Storage !== "undefined") {
  // We cannot subclass jsdom's Storage (its constructor is marked
  // illegal to call directly). Use a plain object that satisfies the
  // Storage interface instead. Tests that want to simulate quota errors
  // should spy on the instance method (e.g. `vi.spyOn(localStorage,
  // "setItem")`), not on `Storage.prototype`.
  const makeMemoryStorage = (): Storage => {
    const data = new Map<string, string>();
    const api: Storage = {
      get length(): number {
        return data.size;
      },
      clear(): void {
        data.clear();
      },
      getItem(key: string): string | null {
        return data.has(key) ? data.get(key)! : null;
      },
      key(index: number): string | null {
        return Array.from(data.keys())[index] ?? null;
      },
      removeItem(key: string): void {
        data.delete(key);
      },
      setItem(key: string, value: string): void {
        data.set(key, String(value));
      },
    };
    return api;
  };
  const installFreshStorage = (key: "localStorage" | "sessionStorage") => {
    const fresh = makeMemoryStorage();
    Object.defineProperty(window, key, {
      value: fresh,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, key, {
      value: fresh,
      writable: true,
      configurable: true,
    });
  };
  installFreshStorage("localStorage");
  installFreshStorage("sessionStorage");
}

afterEach(() => {
  // Reset storage between tests so writes don't leak across test files.
  if (typeof localStorage !== "undefined" && typeof localStorage.clear === "function") {
    try {
      localStorage.clear();
    } catch {
      // ignore — tests that mock storage methods may have replaced clear
    }
  }
  if (typeof sessionStorage !== "undefined" && typeof sessionStorage.clear === "function") {
    try {
      sessionStorage.clear();
    } catch {
      // ignore
    }
  }
});

// jsdom lacks matchMedia; Next/font reads it during render in some envs.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
