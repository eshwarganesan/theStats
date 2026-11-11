# Research: Account Deletion

**Feature**: `018-account-deletion` | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

The Technical Context had no open unknowns once the existing code was read. Each decision below resolves a design question the spec leaves to planning. Each one names the code it builds on.

---

## R1. How the account is deleted

**Decision**: Delete the Supabase Auth user with the Auth admin API, `auth.admin.deleteUser(userId)`, as a hard delete (`shouldSoftDelete = false`). Call it from a new server-only module, after the password check (R2). The ID is always the verified caller's own, taken from `withAuthenticatedHandler`'s context and never from the request body.

**Rationale**:
- Deleting the `auth.users` row removes the account and everything it owns in one database transaction:
  - Auth's own tables cascade: identities, sessions, refresh tokens and MFA factors.
  - Our foreign keys cascade too: `public.profiles.id` and `public.games.owner_id` both reference `auth.users(id) on delete cascade`, and `public.game_writes.game_id` references `public.games(id) on delete cascade` (migration `0002_account_library.sql`).
  - So FR-005 and FR-006 (all-or-nothing) need no new SQL, and there's no migration.
- `public.auth_attempts` has no foreign key and is keyed by `e:<email>` / `ip:<addr>`, so it is left in place. That is exactly FR-017.
- The service-role client already exists (`src/lib/supabase/admin.ts`) and is already used in production for the sign-in throttle (`src/lib/auth/attempt-throttle.ts`). `getServerEnv()` requires `SUPABASE_SERVICE_ROLE_KEY` for every server client, so the key is already configured on Vercel.

**Alternatives considered**:
- **A `SECURITY DEFINER` RPC that runs `delete from auth.users where id = auth.uid()`, executable by `authenticated`**: rejected. The browser and the iOS app both hold the user's JWT and the public anon key. Anyone holding a session could call the RPC straight through PostgREST and delete the account without the password, which defeats FR-003, FR-004 and the "device left signed in" edge case.
- **The same RPC, also requiring a recent `amr` password timestamp in the JWT**: rejected. It depends on how token claims carry over across refreshes, needs a second client bound to a fresh token, and still leaves a short window. The admin API is the documented way to do this.
- **Soft delete**: rejected. It keeps an obfuscated user row, but the spec says deletion is permanent and complete.

---

## R2. Checking the password

**Decision**: Re-authenticate with `signInWithPassword({ email: user.email, password })` on a stateless client (`createStatelessClient()`: anon key, no cookies, in-memory session). Wrap the check in the existing sign-in throttle:
- Keys: `throttleKeys(email, request)`, which gives `e:<email>` and `ip:<addr>`. These are the same keys sign-in uses, so wrong passwords during deletion count toward the same limit (FR-004). This settles the item `/speckit.clarify` deferred.
- Before the check: `checkAuthAttempt(keys)`. A failed lookup gives `500`, never fail-open. If the limit applies, answer `429 rate_limited` with `retry_after_seconds`.
- After the check: `recordAuthAttempt(keys, false)` on a wrong password, or `true` on the right one. A success resets the counter, so a later sign-up with the same email doesn't inherit a backoff.
- If the admin delete then fails, revoke the session the check created, best effort, with `signOut({ scope: "local" })` on the stateless client. Local scope revokes only that session; the default global scope would sign the user out everywhere.

**Rationale**:
- `signInWithPassword` is the only supported way to verify a password with Supabase Auth.
- The change-password action already re-authenticates this way, but on the cookie client, which swaps the browser's session cookies as a side effect. The stateless client has no side effects on the caller's session, and it works the same for cookie and bearer callers.

**Alternatives considered**:
- **Checking bcrypt against `auth.users.encrypted_password` in SQL (pgcrypto)**: rejected. It couples us to Auth's internal hash format and sends the plaintext password into SQL.
- **`auth.reauthenticate()` (emailed nonce)**: rejected. It needs email (the spec says no email) and a second step.
- **A separate counter for deletion attempts**: rejected. Two counters would give an attacker with a stolen session twice the guesses. The wait tops out at 30 s (`record_auth_attempt` caps the backoff), so sharing the counter costs real users almost nothing.

**Assumption**: Supabase's "single session per user" setting stays off (the default). With it on, the check's sign-in would end the user's other sessions. If it's ever enabled, this step needs revisiting.

---

## R3. Endpoint shape

**Decision**: `POST /api/account/delete`, with body `{ "password": string }`, wrapped in `withAuthenticatedHandler`. Web (session cookie) and iOS (`Authorization: Bearer`) both use this one route. Responses: `204`, or the shared `{ error: { code, message } }` envelope (see [contracts/delete-account-api.md](./contracts/delete-account-api.md)).

**Rationale**:
- One boundary means one Zod schema, one throttle path, one set of integration tests, and identical behavior on both platforms.
- The password must be sent in a body. RFC 9110 gives a `DELETE` body no defined semantics, and some intermediaries drop it, so the route is an action `POST`. That matches the existing `/api/auth/*` routes.

**Alternatives considered**:
- **A Server Action for the web plus a Route Handler for iOS**: rejected. That's two boundaries to validate, log and test for one operation.
- **`DELETE /api/account` with a body**: rejected, for the semantics above.

---

## R4. All-or-nothing, double submits and lost responses

**Decision**:
- **Atomicity** comes from R1: a single delete of the `auth.users` row, with cascades in the same transaction. If it fails, nothing is gone, and the client is told so (`500`; FR-013).
- **Idempotency** comes from the account's own existence; there's no key table. A repeat request after a success can go two ways, and the client treats both as already deleted:
  - It fails authentication with `401 account_deleted` (R5).
  - It races the first request and the admin API reports the user missing, which the route maps to `204`.
- **Clients**:
  - They disable the confirm button while a request is in flight (FR-014).
  - A network error tells the user to check their connection and try again, rather than claiming nothing was deleted. A retry after a lost response then lands on `account_deleted` and finishes the flow. This covers the spec's "connection lost after confirming" edge case.

**Rationale**: Principle VI asks retryable endpoints to be safely repeatable. Here the state itself, whether the account exists, makes every retry converge, with no extra table that would itself be account data.

**Alternatives considered**: An idempotency-key table like `game_writes`. Rejected: its rows would need deleting too, and it adds nothing.

---

## R5. Telling "account deleted" apart from "signed out" while the token is still valid

**Decision**: Supabase Auth answers `GET /user` for a token whose user no longer exists with `403 user_not_found`. Auth checks the user before the session. supabase-js surfaces this as an `AuthApiError` with `code === "user_not_found"` and does **not** clear the stored session. It only does that for `session_not_found`, which it turns into `AuthSessionMissingError` (`@supabase/auth-js` 2.117.3, `GoTrueClient._getUser` and `lib/fetch.js`). So:
- **`withAuthenticatedHandler`**: when `getUser` fails with `user_not_found`, answer `401 { error: { code: "account_deleted" } }` instead of `unauthenticated`. For cookie callers, also clear the auth cookies with `signOut({ scope: "local" })`.
- **Middleware** (page requests only): on `user_not_found`, clear the cookies the same way and redirect to `/?account=deleted-elsewhere` (R7).

**Rationale**: The common case is another device that is in use and holds a fresh token. That device then gets a precise signal on its very next request, with no extra lookups.

**Verification**: An integration test deletes a user, then calls the games API with that user's still-valid token (bearer and cookie) and asserts `401 account_deleted`. If a future Auth version reports `session_not_found` for deleted users instead, this test fails. The design still holds in that case, because R6 catches it.

---

## R6. Telling them apart after the token has expired

**Decision**: Each device remembers which account it was signed in to. When it finds itself signed out with a remembered account, it asks once whether that account still exists:

| | Web | iOS |
|---|---|---|
| Remembered account | New localStorage key `thestats.account.v1` = `{ userId }`, written by `AccountWatcher` in the signed-in layout while a session exists | The existing sync record `thestats.sync.v1`, whose `userId` already names the device game's owner (`claimDeviceGame`) |
| When it asks | Once per sign-out: `AccountCheck` on `/` or `/login`, or `AccountWatcher` on an unexpected `SIGNED_OUT` | When the app is signed out, at most once per launch per remembered account |
| The question | `GET /api/account/status?userId=<uuid>`, which returns `{ exists: boolean }` | Same |
| `exists: false` | Clear device data, forget the account, show the landing page with the deleted-elsewhere notice | Clear the device game and sync record, show the sign-in screen with the notice |
| `exists: true` | Forget the account (signed out some other way, e.g. a global sign-out on another device) | Keep the device game, as today, so the same user's unsaved changes still sync |
| Error or offline | Ask again on the next signed-out page load | Ask again on the next foreground while signed out |

The status route uses `auth.admin.getUserById(userId)`. A `404 user_not_found` means `exists: false`.

**Rationale**:
- This is the common case: an iPad reopened the next day, or a browser tab reloaded after an hour. Supabase removes an expired session as soon as its refresh fails, so neither the browser nor the app still has a token to show the server. On the web, the middleware's failed refresh even clears the cookies before any page script runs.
- A user ID the device kept is the only evidence left.
- Without this, FR-009 and SC-004 (the notice, and clearing the device's copy) would hold only within the hour a token stays valid.

**Security**:
- The status route has to be public, because its callers can no longer authenticate.
- It returns one boolean for a random UUIDv4. User IDs are never shown to other users: RLS hides every row of `games` and `profiles` from anyone else.
- Guessing a live ID is infeasible (122 random bits), and the answer carries no personal data.
- There's no rate limit beyond Vercel's and Supabase's own. Each call is one cheap read, and an application throttle would add more indefinitely kept rows to `auth_attempts`. This is recorded in Complexity Tracking.

**Alternatives considered**:
- **Decoding the expired JWT on the server**: rejected. The web loses the cookie before the client can send it, and verifying an expired token needs the JWT secret or key setup.
- **A `deleted_accounts` tombstone table**: rejected. It's a new table, RLS policy and retention question, for the same answer the Auth admin API already gives.
- **No notice once the token has expired**: rejected. The spec (Q2) asks for the notice on other devices.

**Known edge**: Suppose someone signs out of the iOS app on purpose and the account is later deleted on the web. The next launch clears the leftover game and shows "You were signed out because this account was deleted." The wording fits loosely, but it's still true that the account is gone. This was accepted rather than tracking how each sign-out happened.

---

## R7. Middleware

**Decision**: On page requests (paths not under `/api/`), when `getUser()` fails with `user_not_found`:
1. Call `signOut({ scope: "local" })` on the middleware's SSR client, so the cookie writes land on the response.
2. Redirect to `/?account=deleted-elsewhere`, copying the cleared cookies onto the redirect as the existing code already does.

API requests are unchanged. The handler owns API errors (feature 011, `contracts/middleware.md`: "Middleware MUST NOT emit a JSON 401 for `/api/games/**`"), and because `user_not_found` leaves the cookies in place, the handler still sees them and classifies the failure itself (R5).

**Rationale**: Navigating anywhere after the account is gone lands on the start screen with the right notice (FR-009). Without this, a protected page would bounce to `/login?from=…`.

**Loop safety**: The redirect clears the cookies. The next request has no session, so it takes the ordinary signed-out branch and `/` renders.

**Tests**: The branch is a pure function, unit-tested next to `decideRoute` (`src/middleware.test.ts`).

**Found during implementation**: the middleware sat at the package root, but with `src/app` Next.js only loads `src/middleware.ts`, so it had never run (the build's middleware manifest was empty). Feature 011's auth wall worked only because every protected page also calls `requireAuth()`. Moving it into `src/` activates feature 011's routing and session-cookie rotation for the first time, and this branch with them. That also closes a gap this design relied on: signed-in visitors never reach `/`, so a crafted `/?account=…` link can't clear their browser's game. The full E2E suite passes with it active. Decided with the user on 2026-11-10.

---

## R8. The notice on the web

**Decision**:
- The landing page (`src/app/page.tsx`) reads `searchParams.account`, either `deleted` or `deleted-elsewhere`. It renders a client `AccountNotice` with `role="status"` and the shared copy (R12).
- On mount, `AccountNotice` also clears the device's game data and forgets the remembered account. This is idempotent: the deleting device has already done it, but the middleware path (R7) can't touch localStorage itself.
- The notice never names the account (FR-018).

**Rationale**:
- A query parameter is the one channel both producers can write: client code for its own deletion, and middleware for deleted-elsewhere.
- The landing page stays the start screen, as the original request asks.
- If someone forges the link, the worst outcome is a misleading sentence on a public page, plus clearing a signed-out browser's leftover game, which feature 011 clears at the next sign-in anyway.

**Alternatives considered**:
- **A flash cookie**: rejected. It needs a server write on the delete path and on middleware, and cleanup.
- **sessionStorage**: rejected. Middleware can't set it.

---

## R9. Web cleanup and races

**Decision**:
- **Cleanup**: a client helper, `handleAccountGone(kind)`:
  1. `resetAll()` on the game store, then `clearPersistedGame()`, which removes `thestats.game.v1` and `thestats.clock.v1`.
  2. Forget the remembered account.
  3. Tell the other tabs (below).
  4. `window.location.assign("/?account=<kind>")`. The full navigation drops in-memory state, write-through controllers and timers. It's the same pattern `SignOutButton` uses.
- **Races**: own-device deletion sets a module-level "deleting" flag before its request. Both the watcher and the write-through hook ignore account-gone signals while it's set, so the deleted-elsewhere notice can't race in. The flag clears again if the request fails.
- **Other tabs**: `handleAccountGone` posts the notice kind on `BroadcastChannel("thestats.account")`. `AccountWatcher`, mounted in every signed-in tab, runs the same cleanup with `fromBroadcast` set, so it doesn't post again. Without this, a second tab left on the live game page would write `thestats.game.v1` and `thestats.clock.v1` back within about a second, breaking FR-008: the store persists on every update, and the clock checkpoint writes every second. Where `BroadcastChannel` is missing, the other tab falls back to the middleware path on its next navigation.
- **Where the request logic lives**: the dialog only renders. A `useAccountDeletion()` hook owns the request, the pending state, the double-submit guard, the "deleting" flag and the outcome handling (Principle III: "use hooks to isolate concerns").

**Rationale**: FR-008 requires no sign-in and no game data left on the device. The server's `204` already clears the auth cookies (R1, R5). The client clears the rest.

---

## R10. The shared write-through controller

**Decision**: The `WriteThroughController` in `@thestats/app` gains `onAccountGone?: () => void`.
- A `401` whose envelope code is `account_deleted` is final. The controller disposes itself, which drops pending writes and stops retries (US4 scenario 3: unsaved changes are discarded, not retried), and then calls `onAccountGone` once.
- Other `401`s keep today's retry behavior.
- Web wires the callback to `handleAccountGone("deleted-elsewhere")`. iOS doesn't need to, because `apiFetch` already handles the signal (R11). Its controller still stops retrying.

**Rationale**: During live scoring, the write-through is the request most likely to notice that the account is gone. It must neither keep retrying nor resurrect data.

---

## R11. iOS

**Decision**:
- **Account screen**: a new `src/app/account.tsx` in the signed-in stack. It shows "Signed in as <email>" and a "Delete account" section. Home gets an "Account" button next to "Sign out", one tap away (FR-016, SC-007).
- **Confirmation**: uses the existing `Sheet`. The password field and the Cancel and Delete buttons sit inside the scrolling content, not the fixed footer. The sheet's `ScrollView` gets `automaticallyAdjustKeyboardInsets`, so with the keyboard up on an iPhone in landscape every control can still be scrolled into view (FR-015, US2 scenario 5). The password field's return key submits.
- **Deleting**: `deleteAccount(password)` sends the request itself, not through `apiFetch`'s refresh-and-retry or its account-gone handler. It maps the outcomes:
  - `204`, or `401 account_deleted`: deleted.
  - `403`: wrong password.
  - `429`: rate limited (`retry_after_seconds`).
  - Network failure: offline.
  - Anything else: server error.
- **Cleanup**: `handleAccountGone(kind)`:
  1. Dispose the active sync controller, dropping unsaved changes.
  2. `resetAll()`, `clearPersistedGame(deviceStorage)`, and remove `thestats.sync.v1`.
  3. Set the in-memory notice.
  4. `auth.signOut({ scope: "local" })`. The server has already removed every session, so a global sign-out would fail. The local sign-out clears the keychain and makes the auth wall show the sign-in screen.
  5. The cleanup is guarded so it runs once per signed-in session.
- **Signal from the API**: `apiFetch` peeks at a `401`'s envelope (`response.clone()`). For `account_deleted` it skips the refresh-and-retry, reports the event through a small listener registry (`accountEvents.ts`), and returns the response. `SessionProvider` subscribes and runs `handleAccountGone("deleted-elsewhere")`. The registry keeps `api.ts` from importing `accountGone.ts`, which would close an `api → accountGone → gameSync → api` cycle.
- **Signal after expiry**: `SessionProvider` runs the R6 check when it's signed out and the sync record names a user.
- **Showing the notice**: the sign-in screen shows it with `accessibilityRole="alert"`, announces it through `AccessibilityInfo.announceForAccessibility`, and clears it on the next sign-in or when dismissed.

**Rationale**:
- These reuse the app's existing pieces: `Sheet`, `TextField`, `ScreenHeader`, the auth wall in `_layout.tsx`, and the sync record's owner ID.
- Normal sign-out flushes unsaved changes first (`flushGameSync`). Deletion deliberately doesn't (FR-008).

---

## R12. Notice copy

**Decision**: The copy is shared from `@thestats/app`, so web and iOS say exactly the same thing:

| Kind | Copy |
|---|---|
| `deleted` (the device that deleted the account) | "Your account has been deleted." |
| `deleted-elsewhere` (any other device) | "You were signed out because this account was deleted." |

**Rationale**: One source of truth, and both strings follow FR-018 (no email address, no account data).

---

## R13. Logging

**Decision**: Both routes log structured entry and exit lines. Each line carries the request ID, handler name, user ID (or null) and outcome. The outcomes are: `ok`, `invalid_body`, `unauthenticated`, `account_deleted`, `current_password_incorrect`, `rate_limited`, `internal_error:throttle_lookup`, `internal_error:delete`, plus for the status route `exists` / `missing`. They never log the password or the email address. The delete route's `ok` line is the operational record that a deletion happened.

**Rationale**: Principle VI observability, matching `withAuthenticatedHandler`'s `logEvent` and `logAuthEvent`.

---

## R14. Wrong-password status code

**Decision**: `403 current_password_incorrect`, with the message "Current password is incorrect.", the same code and wording as the change-password action.

**Rationale**: Both clients treat `401` as session trouble: iOS's `apiFetch` refreshes and retries on `401`, and `account_deleted` rides on `401`. A wrong password is an authenticated caller being refused one action, which is `403`.

---

## Open follow-ups (outside this feature)

- **Password reset**: no "forgot password" flow exists, so a signed-in user who has forgotten their password can't delete their account (spec Edge Cases, Clarification Q3). A separate spec would fix sign-in too.
- **Privacy policy**: failed-attempt records keep the email address after deletion (Clarification Q1, FR-017). The privacy policy the App Store requires should say so.
- **Global sign-out**: `signOut()` defaults to global scope on both clients, so signing out on one device signs out all of them. That's existing behavior, and R6's check copes with it. Worth a conscious decision some day.
