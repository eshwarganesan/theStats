import * as Crypto from "expo-crypto";

interface CryptoLike {
  randomUUID?: () => string;
  getRandomValues?: typeof Crypto.getRandomValues;
}

/**
 * Hermes has no Web Crypto, so the shared code's id and idempotency-key
 * helpers (`uid`, `newIdempotencyKey`) would fall back to `Math.random`.
 * This fills in `crypto.randomUUID` and `crypto.getRandomValues` from
 * expo-crypto's native secure random source. Runtimes that already have
 * them are left alone.
 */
export function installCryptoPolyfill(target: { crypto?: CryptoLike }): void {
  const current = target.crypto ?? {};
  if (typeof current.randomUUID === "function") return;
  target.crypto = {
    ...current,
    randomUUID: Crypto.randomUUID,
    getRandomValues: current.getRandomValues ?? Crypto.getRandomValues,
  };
}
