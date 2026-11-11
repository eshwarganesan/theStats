# Contract: "Account gone" signals and notices

How every part of theStats learns that the signed-in account no longer exists, and what each device then does. This covers FR-007 to FR-009, FR-018, SC-004 and SC-005. Design: [research.md](../research.md) R5 to R12.

## 1. API: `401 account_deleted` on every authenticated endpoint

`withAuthenticatedHandler` (so `/api/games`, `/api/games/[id]`, `/api/account/delete` and any future wrapped route) classifies authentication failures like this:

| `getUser` result | Response | Side effect |
|---|---|---|
| A user | (the handler runs) | |
| Error with `code === "user_not_found"` | `401 { error: { code: "account_deleted", message: "This account no longer exists." } }` | Cookie callers: auth cookies cleared (`signOut({ scope: "local" })`) |
| Any other error, no session, or a malformed bearer | `401 { error: { code: "unauthenticated", message: "Sign in to continue." } }` (unchanged) | |

Structured log outcome: `account_deleted`, with `user_id: null`.

## 2. Middleware: page navigations

For requests **outside `/api/`**:

| Session check | Result |
|---|---|
| `getUser` error `user_not_found` | Clear the auth cookies; `307` to `/?account=deleted-elsewhere` |
| Anything else | Unchanged from feature 011's [middleware contract](../../011-auth-gated-landing/contracts/middleware.md) |

Requests under `/api/` are unchanged: the handler answers them as in section 1. Middleware never emits JSON.

New rows for the feature 011 response matrix:

| # | Path | Session | Result |
|---|---|---|---|
| 18 | `/games`, `/game`, `/setup`, `/account` (any protected path) | Token valid, user deleted | `307` → `/?account=deleted-elsewhere`, cookies cleared |
| 19 | `/` or `/login` | Token valid, user deleted | `307` → `/?account=deleted-elsewhere`, cookies cleared |
| 20 | `/?account=deleted-elsewhere` | None (after 18 or 19) | `P` (renders the landing page with the notice) |

## 3. Landing page: `?account=`

| Value | Notice | Also does |
|---|---|---|
| `deleted` | "Your account has been deleted." | On mount: reset the game store, clear `thestats.game.v1` and `thestats.clock.v1`, forget `thestats.account.v1` |
| `deleted-elsewhere` | "You were signed out because this account was deleted." | Same |
| Anything else, or missing | (none) | (nothing) |

The notice:
- is rendered by `AccountNotice` at the top of the landing page, with `role="status"`, so screen readers announce it;
- has a dismiss button (`aria-label="Dismiss"`);
- never includes the email address or any account data (FR-018).

## 4. Web client triggers

| Trigger | Action |
|---|---|
| Own deletion succeeds (`204`, or `401 account_deleted` on a retry) | `handleAccountGone("deleted")` |
| Write-through controller gets `401 account_deleted` | The controller disposes itself, then `onAccountGone` runs `handleAccountGone("deleted-elsewhere")` |
| `AccountWatcher` (signed-in layout) sees a `SIGNED_OUT` event that this device didn't start | `GET /api/account/status` for the remembered account. If `exists: false`: `handleAccountGone("deleted-elsewhere")`. Otherwise nothing; the next navigation reaches the auth wall as today |
| `AccountCheck` on `/` or `/login` (always signed out there) finds `thestats.account.v1` naming a user, and the URL has no `account` parameter | `GET /api/account/status`. If `exists: false`: forget the account and `location.replace("/?account=deleted-elsewhere")`. If `exists: true`: forget the account |
| User signs out with the Sign out button | Forget `thestats.account.v1` before navigating, so no check runs |
| `AccountWatcher` receives a kind on `BroadcastChannel("thestats.account")` from another tab | `handleAccountGone(kind, { fromBroadcast: true })`: the same cleanup and notice, without posting again |

`AccountWatcher` also writes `thestats.account.v1` whenever a session is present. Neither component loads Supabase on the public pages: `AccountCheck` uses only `fetch` and `localStorage`.

`handleAccountGone(kind, { fromBroadcast? })`:
1. Reset the game store.
2. Clear the device keys.
3. Forget the remembered account.
4. Unless `fromBroadcast` is set, post `kind` on `BroadcastChannel("thestats.account")` so every other signed-in tab does the same. Skip this silently where `BroadcastChannel` doesn't exist.
5. `window.location.assign("/?account=" + kind)`.

While an own deletion is in flight, the watcher and the write-through hook ignore account-gone signals (research R9).

## 5. iOS triggers

| Trigger | Action |
|---|---|
| Own deletion succeeds (`204`, or `401 account_deleted`) | `handleAccountGone("deleted")` |
| `apiFetch` gets `401 account_deleted` | No refresh-and-retry. Report it through `accountEvents`, then return the response. `SessionProvider` subscribes and runs `handleAccountGone("deleted-elsewhere")` |
| Signed out, and the sync record names a user that hasn't been checked this launch | `GET /api/account/status`. If `exists: false`: `handleAccountGone("deleted-elsewhere")` |

`handleAccountGone(kind)`:
1. Dispose the sync controller; unsaved changes are dropped, not flushed.
2. `resetAll()`.
3. `clearPersistedGame(deviceStorage)`.
4. Remove `thestats.sync.v1`.
5. Set the notice.
6. `auth.signOut({ scope: "local" })`.

It runs at most once per signed-in session. The auth wall then shows the sign-in screen, which renders the notice:
- with `accessibilityRole="alert"`;
- announced with `AccessibilityInfo.announceForAccessibility`;
- with a Dismiss control;
- cleared on the next successful sign-in.

## 6. Notice copy

The copy is exported from `@thestats/app` as `ACCOUNT_NOTICE_TEXT`:

```ts
export const ACCOUNT_NOTICE_TEXT = {
  deleted: "Your account has been deleted.",
  "deleted-elsewhere": "You were signed out because this account was deleted.",
} as const satisfies Record<AccountNoticeKind, string>;
```

## Tests

- **Unit tests** for:
  - the handler classification table (section 1);
  - the middleware pure branch (rows 18 to 20);
  - `AccountNotice` (per value; clears storage);
  - the watcher (each status answer, the in-flight flag, and messages from other tabs);
  - the controller (`account_deleted` stops retries and calls back once; other `401`s still retry);
  - iOS `apiFetch` (no refresh on `account_deleted`);
  - iOS `handleAccountGone` (store, storage, sync record, local sign-out, notice; runs once);
  - iOS `SessionProvider` (signed out plus remembered user leads to a status check).
- **Integration tests**: games API with a deleted user's still-valid token, over bearer and over cookie, returns `401 account_deleted`; the cookie path also returns expiring Set-Cookie headers.
- **E2E tests** (two browser contexts, one user):
  - Delete in context A.
  - In context B, navigating to `/games` lands on `/?account=deleted-elsewhere` with the notice.
  - In context B, recording a play on the live page also lands there, and the device keys are cleared.
  - Two tabs in one context: deleting in one sends the other to `/?account=deleted`, and the device keys stay cleared.
