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
