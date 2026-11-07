import { getEnv } from "@/env";
import { flushGameSync } from "@/lib/gameSync";
import { getSupabase } from "@/lib/supabase";

/**
 * Email + password accounts for the iOS app.
 *
 * Requests go to the web API (POST /api/auth/token, /sign-up and
 * /resend-confirmation) rather than straight to Supabase, so the app
 * shares web's per-account + per-IP backoff and non-enumerating errors.
 * Sign-in's tokens are handed to supabase-js, which stores them in the
 * keychain and refreshes them.
 */
export type AuthErrorCode =
  | "invalid_input"
  | "invalid_credentials"
  | "email_unconfirmed"
  | "email_exists"
  | "rate_limited"
  | "network_error"
  | "internal_error";

export type AuthResult =
  | { ok: true }
  | {
      ok: false;
      code: AuthErrorCode;
      message: string;
      retryAfterSeconds?: number;
    };

export type AuthFailure = Extract<AuthResult, { ok: false }>;
type Failure = AuthFailure;

const KNOWN_CODES: readonly AuthErrorCode[] = [
  "invalid_input",
  "invalid_credentials",
  "email_unconfirmed",
  "email_exists",
  "rate_limited",
];

const GENERIC_ERROR: Failure = {
  ok: false,
  code: "internal_error",
  message: "Something went wrong. Please try again.",
};

const OFFLINE: Failure = {
  ok: false,
  code: "network_error",
  message: "Can't reach theStats. Check your connection and try again.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The API's error envelope; for a rejected field, the reason it gives. */
function parseError(body: unknown): Failure {
  const error = isRecord(body) ? body.error : undefined;
  if (!isRecord(error)) return GENERIC_ERROR;
  const code = KNOWN_CODES.find((c) => c === error.code);
  if (!code || typeof error.message !== "string") return GENERIC_ERROR;
  const reason = isRecord(error.details) ? error.details.reason : undefined;
  const retry = error.retry_after_seconds;
  return {
    ok: false,
    code,
    message: code === "invalid_input" && typeof reason === "string" ? reason : error.message,
    ...(typeof retry === "number" ? { retryAfterSeconds: retry } : {}),
  };
}

function parseTokens(body: unknown): { access_token: string; refresh_token: string } | null {
  if (!isRecord(body)) return null;
  const { access_token, refresh_token } = body;
  if (typeof access_token !== "string" || typeof refresh_token !== "string") return null;
  return { access_token, refresh_token };
}

/** POSTs `payload` to the web API: the response body, or why it failed. */
async function post(path: string, payload: unknown): Promise<{ ok: true; body: unknown } | Failure> {
  let response: Response;
  try {
    response = await fetch(`${getEnv().apiUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return OFFLINE;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return GENERIC_ERROR;
  }
  return response.ok ? { ok: true, body } : parseError(body);
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const result = await post("/api/auth/token", { email, password });
  if (!result.ok) return result;

  const tokens = parseTokens(result.body);
  if (!tokens) return GENERIC_ERROR;

  const { error } = await getSupabase().auth.setSession(tokens);
  return error ? GENERIC_ERROR : { ok: true };
}

/**
 * Creates an account. Supabase emails a link to confirm the address; the
 * account can sign in once that's opened.
 */
export async function signUp(email: string, password: string): Promise<AuthResult> {
  const result = await post("/api/auth/sign-up", { email, password });
  return result.ok ? { ok: true } : result;
}

/** Sends the email-confirmation link again. */
export async function resendConfirmation(email: string): Promise<AuthResult> {
  const result = await post("/api/auth/resend-confirmation", { email });
  return result.ok ? { ok: true } : result;
}

/**
 * Saves any unsaved game changes while the session can still write them,
 * then revokes the refresh token server-side and clears the keychain. If
 * the network call fails, the local session is still removed, so the
 * device is signed out either way.
 */
export async function signOut(): Promise<void> {
  await flushGameSync();
  const supabase = getSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) await supabase.auth.signOut({ scope: "local" });
}
