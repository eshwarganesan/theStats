/**
 * Generate a short, collision-resistant identifier.
 * Uses `crypto.randomUUID` when available and falls back to a simple
 * time-plus-random string (e.g. during SSR in older environments).
 *
 * Accesses `crypto` via `globalThis` so the module remains
 * environment-agnostic (browser, Node, edge) without depending on
 * DOM or Node ambient types.
 */
export function uid(): string {
  const g = globalThis as {
    crypto?: { randomUUID?: () => string };
  };
  if (g.crypto && typeof g.crypto.randomUUID === "function") {
    return g.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
