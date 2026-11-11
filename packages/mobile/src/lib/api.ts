import { readApiErrorCode } from "@thestats/app";

import { getEnv } from "@/env";
import { reportAccountDeleted } from "@/lib/accountEvents";
import { getSupabase } from "@/lib/supabase";

/**
 * `fetch` against the web API as the signed-in user. The session's
 * access token goes in `Authorization: Bearer`, which the games API
 * accepts in place of the browser's session cookie.
 *
 * supabase-js refreshes an expired token before handing it out. If the
 * server still rejects it (the device clock is off, or the session was
 * revoked), the session is refreshed once and the request retried. If
 * that fails too, the 401 is returned; a session that can't be refreshed
 * signs the app out through `onAuthStateChange`.
 *
 * `401 account_deleted` is different: the account is gone, so there's
 * nothing to refresh. It's reported to `accountEvents` and returned as is
 * (feature 018, FR-009).
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const auth = getSupabase().auth;
  const { data } = await auth.getSession();
  const token = data.session?.access_token;
  if (!token) return unauthenticated();

  const response = await send(path, init, token);
  if (response.status !== 401) return response;
  if ((await readApiErrorCode(response)) === "account_deleted") {
    reportAccountDeleted();
    return response;
  }

  const refreshed = await auth.refreshSession();
  const next = refreshed.data.session?.access_token;
  if (!next || next === token) return response;
  return send(path, init, next);
}

function send(path: string, init: RequestInit, token: string): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  return fetch(`${getEnv().apiUrl}${path}`, { ...init, headers });
}

/** Same envelope the API sends, for when there's no session to send. */
function unauthenticated(): Response {
  return new Response(
    JSON.stringify({ error: { code: "unauthenticated", message: "Sign in to continue." } }),
    { status: 401, headers: { "Content-Type": "application/json" } },
  );
}
