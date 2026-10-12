/**
 * Idempotency-key helpers for the games API (feature 009-account-library).
 *
 * Per Constitution Principle VI: "Endpoints the client can retry ... MUST be
 * safely retryable: accept a client-provided idempotency key and enforce it
 * with a unique constraint." The enforcement happens server-side via the
 * `record_game_write` RPC (see 0002_account_library.sql); this module owns
 * the client-side minting + server-side header reading.
 */

/**
 * Mint a new idempotency key. Standardizes on RFC 4122 v4 UUIDs so retries
 * of the same logical operation MUST reuse the same key — the client is
 * expected to hold the key with the pending mutation, not regenerate on
 * every attempt.
 */
export function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `key_${Date.now()}_${Math.random()}`;
}

/**
 * Read the `Idempotency-Key` header from an incoming Request. Returns null
 * when absent OR empty (after trimming). Callers that require the header
 * should short-circuit with `idempotency_key_required`.
 */
export function readIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get("Idempotency-Key");
  if (raw === null) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
