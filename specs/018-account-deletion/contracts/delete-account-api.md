# Contract: `POST /api/account/delete`

Deletes the caller's own account and everything it owns. The same route serves the web app (session cookie) and the iOS app (bearer token). Design: [research.md](../research.md) R1–R4, R13 and R14.

## Request

| Part | Value |
|---|---|
| Method | `POST` |
| Auth | Session cookie, or `Authorization: Bearer <access token>`. The same rules as `/api/games` (`withAuthenticatedHandler`); a malformed `Bearer` header is rejected, never ignored |
| Body | `application/json`: `{ "password": "<current password>" }` |
| Validation | `DeleteAccountBodySchema`: `password` is a string of 1–1024 characters. Unknown keys are ignored. The account is always the session's; no user ID is accepted |

## Processing order

1. **Authenticate.**
   - No valid session: `401 unauthenticated`.
   - A token whose user no longer exists: `401 account_deleted` (see [account-gone-signals.md](./account-gone-signals.md)).
2. **Validate the body.** On failure: `400 invalid_body`.
3. **Check the throttle** for keys `e:<session email>` and `ip:<x-forwarded-for[0]>`.
   - Lookup failed: `500 internal_error`.
   - Not allowed: `429 rate_limited`.
4. **Check the password**: `signInWithPassword` on a stateless client.
   - Wrong: record a failure, then `403 current_password_incorrect`.
   - Right: record a success, which resets the backoff.
5. **Delete**: `auth.admin.deleteUser(sessionUserId)`, a hard delete that cascades (see [data-model.md](../data-model.md)).
   - Auth reports the user is already gone: treat it as success.
   - Any other failure: best-effort revoke the step-4 session (`signOut({ scope: "local" })` on the stateless client), then `500 internal_error`.
6. **Respond**: for cookie callers, clear the auth cookies (`signOut({ scope: "local" })` on the cookie client), then `204`.

## Responses

All error bodies use the shared envelope `{ "error": { "code": string, "message": string } }`. Every response sends `Cache-Control: no-store`.

| Status | `code` | `message` | When | Client behavior |
|---|---|---|---|---|
| `204` | (no body) | | Deleted. Cookie callers also get Set-Cookie headers that expire the auth cookies | Clean up and show the start screen with the "deleted" notice |
| `400` | `invalid_body` | `Enter your password to confirm.` | Body isn't JSON, or `password` is missing, empty or too long | Show the message next to the field |
| `401` | `unauthenticated` | `Sign in to continue.` | No valid session | Web: go to `/login?from=/account`. iOS: the session is already gone, so the auth wall shows sign-in |
| `401` | `account_deleted` | `This account no longer exists.` | The session's account is already deleted, e.g. a double submit or a retry after a lost response | **Treat as success**: same as `204` |
| `403` | `current_password_incorrect` | `Current password is incorrect.` | Wrong password | Show the message; the user can retry |
| `429` | `rate_limited` | `Too many attempts. Please try again shortly.` | Throttle limit reached. The body adds `"retry_after_seconds": number`, and a `Retry-After` header is sent | Show "Too many attempts. Try again in N seconds." |
| `500` | `internal_error` | `Something went wrong.` | Throttle lookup or deletion failed. Nothing was deleted | Show "Something went wrong, and your account wasn't deleted. Please try again." |

A network failure (no response) isn't a server response. Clients show "Couldn't reach theStats. Check your connection and try again." and, on retry, rely on `account_deleted` meaning success (research R4).

## Guarantees

- **All-or-nothing**: either every row in [data-model.md](../data-model.md) is gone, or none is (FR-006).
- **Repeatable**: any number of repeats gives one deletion and one outcome on the client (FR-014).
- **No enumeration**: after deletion, sign-in with the old email and password returns the existing `401 invalid_credentials` "Invalid email or password." (FR-010). This route is unchanged by it.
- **Logging**: entry and exit log lines carry `request_id`, `handler: "account-delete"`, `user_id` and `outcome` (research R13). They never contain the password or the email address.

## Integration tests (local Supabase; self-skip without env)

1. No credentials: `401 unauthenticated`. Malformed `Bearer`: `401`.
2. `{}`, `{ "password": "" }`, non-JSON: `400 invalid_body`, and the account still exists.
3. Wrong password: `403 current_password_incorrect`; the profile and games are intact.
4. Repeated wrong passwords: `429` with `retry_after_seconds` and `Retry-After`.
5. Correct password:
   - Over bearer: `204`; `profiles`, `games` and `game_writes` rows for the user are gone; the `auth_attempts` row for `e:<email>` still exists.
   - Over cookie: `204`, with Set-Cookie headers that expire the auth cookies.
6. After 5:
   - Sign-in with the same credentials gives `401 invalid_credentials`, the same body as for an unknown email.
   - Sign-up with the same email succeeds, and the new account has no profile or games.
7. Repeat the request with the deleted user's still-valid token: `401 account_deleted`.
8. Two concurrent requests: both end in `204` or `401 account_deleted`; one user deleted; no `500`.
9. Admin delete failing (admin client stubbed to error): `500 internal_error`; the account, profile and games are intact.
10. Timing: with 200 games seeded, the delete returns `204` in under 5 s, and no game rows remain (plan Performance Goals).
