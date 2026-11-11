/**
 * Reading the API's error envelope, `{ error: { code, message } }`
 * (Constitution Principle VI), on either client.
 *
 * Plain type guards rather than Zod: these run in size-limited browser
 * chunks (see packages/web/.size-limit.json).
 */

export interface ApiError {
  code: string;
  message: string;
  /** From `retry_after_seconds`, present on `rate_limited` replies. */
  retryAfterSeconds?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseApiError(body: unknown): ApiError | null {
  const error = isRecord(body) ? body.error : undefined;
  if (!isRecord(error)) return null;
  const { code, message, retry_after_seconds: retry } = error;
  if (typeof code !== "string" || typeof message !== "string") return null;
  return typeof retry === "number" && retry >= 0
    ? { code, message, retryAfterSeconds: retry }
    : { code, message };
}

/**
 * The envelope's `code`, or `null`. Reads a clone, so the caller can
 * still read the response body; never throws.
 */
export async function readApiErrorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.clone().json();
    return parseApiError(body)?.code ?? null;
  } catch {
    return null;
  }
}
