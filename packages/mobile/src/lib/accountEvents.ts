/**
 * "The API says this account no longer exists" (feature 018-account-deletion).
 *
 * `apiFetch` reports it here and `SessionProvider` handles it. A registry
 * rather than a direct call keeps `api.ts` from importing `accountGone.ts`,
 * which imports `gameSync.ts`, which imports `api.ts`: a require cycle.
 */
const listeners = new Set<() => void>();

export function onAccountDeleted(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function reportAccountDeleted(): void {
  for (const listener of [...listeners]) listener();
}
