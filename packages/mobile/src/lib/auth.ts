import { getEnv } from "@/env";
import { getSupabase } from "@/lib/supabase";

/**
 * Email + password sign-in for the iOS app.
 *
 * Credentials go to the web API's POST /api/auth/token rather than
 * straight to Supabase, so the app shares web's per-account + per-IP
 * backoff and non-enumerating errors. The returned tokens are handed to
 * supabase-js, which stores them in the keychain and refreshes them.
 */
export type SignInErrorCode =
  | "invalid_input"
  | "invalid_credentials"
  | "email_unconfirmed"
  | "rate_limited"
  | "network_error"
  | "internal_error";

export type SignInResult =
  | { ok: true }
  | {
      ok: false;
      code: SignInErrorCode;
      message: string;
      retryAfterSeconds?: number;
    };

const KNOWN_CODES: readonly SignInErrorCode[] = [
  "invalid_input",
  "invalid_credentials",
  "email_unconfirmed",
  "rate_limited",
];

const GENERIC_ERROR: SignInResult = {
  ok: false,
  code: "internal_error",
  message: "Something went wrong. Please try again.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseError(body: unknown): SignInResult {
  const error = isRecord(body) ? body.error : undefined;
  if (!isRecord(error)) return GENERIC_ERROR;
  const code = KNOWN_CODES.find((c) => c === error.code);
  if (!code || typeof error.message !== "string") return GENERIC_ERROR;
  const retry = error.retry_after_seconds;
  return {
    ok: false,
    code,
    message: error.message,
    ...(typeof retry === "number" ? { retryAfterSeconds: retry } : {}),
  };
}

function parseTokens(body: unknown): { access_token: string; refresh_token: string } | null {
  if (!isRecord(body)) return null;
  const { access_token, refresh_token } = body;
  if (typeof access_token !== "string" || typeof refresh_token !== "string") return null;
  return { access_token, refresh_token };
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  let response: Response;
  try {
    response = await fetch(`${getEnv().apiUrl}/api/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return {
      ok: false,
      code: "network_error",
      message: "Can't reach theStats. Check your connection and try again.",
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return GENERIC_ERROR;
  }

  if (!response.ok) return parseError(body);

  const tokens = parseTokens(body);
  if (!tokens) return GENERIC_ERROR;

  const { error } = await getSupabase().auth.setSession(tokens);
  return error ? GENERIC_ERROR : { ok: true };
}

/**
 * Revokes the refresh token server-side and clears the keychain. If the
 * network call fails, the local session is still removed, so the device
 * is signed out either way.
 */
export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) await supabase.auth.signOut({ scope: "local" });
}
