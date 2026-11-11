/**
 * Reading GET /api/account/status replies (feature 018-account-deletion,
 * research R6). A type guard rather than Zod: it runs in size-limited
 * browser chunks.
 */

export interface AccountStatus {
  exists: boolean;
}

export function parseAccountStatus(body: unknown): AccountStatus | null {
  if (typeof body !== "object" || body === null || !("exists" in body)) return null;
  return typeof body.exists === "boolean" ? { exists: body.exists } : null;
}
