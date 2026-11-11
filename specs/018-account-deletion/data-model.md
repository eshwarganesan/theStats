# Data Model: Account Deletion

**Feature**: `018-account-deletion` | **Date**: 2026-11-10

There's no schema change and no migration. Deletion removes existing rows through foreign keys that already cascade. Two small pieces of device state are added: one localStorage key on the web, and an in-memory notice on iOS.

## Server: what one deletion removes

Deleting the `auth.users` row (research R1) removes, in one transaction:

```text
auth.users (row for the caller)                  deleted by auth.admin.deleteUser
├── auth.identities, auth.sessions,              Supabase Auth's own cascades
│   auth.refresh_tokens, auth.mfa_*              (every device's session ends)
├── public.profiles   (id → auth.users.id)       on delete cascade (0002)
└── public.games      (owner_id → auth.users.id) on delete cascade (0002)
    └── public.game_writes (game_id → games.id)  on delete cascade (0002)

public.auth_attempts (key 'e:<email>' / 'ip:<addr>')   NOT touched (FR-017)
```

| Entity (spec) | Storage | On deletion | Requirement |
|---|---|---|---|
| Account | `auth.users` plus Auth's session tables | Deleted | FR-005 |
| Profile | `public.profiles` | Deleted by cascade | FR-005 |
| Saved game | `public.games`, `public.game_writes` | Deleted by cascade | FR-005, SC-002 |
| Failed-attempt records | `public.auth_attempts` | Kept. A correct password resets the counters to 0 first (research R2) | FR-017 |

**Validation**: the request body is `DeleteAccountBodySchema = { password: string, 1–1024 chars }`. Nothing else is accepted, and the account to delete always comes from the verified session.

**State**: an account is either active or deleted; deletion is final. There's no grace period, no soft delete, and no restore.

## Device state

### Web (browser `localStorage`)

| Key | Holds | Cleared when |
|---|---|---|
| `thestats.game.v1` | The device's game record (feature 006) | Account deleted here, or found deleted (research R9) |
| `thestats.clock.v1` | Clock checkpoint (feature 006) | Same |
| `thestats.account.v1` **(new)** | `{ "userId": "<uuid>" }`, the account this browser was last signed in to | Sign-out from this browser, account deleted or found deleted, or a status check answering `exists: true` (research R6) |

`thestats.account.v1` is written by `AccountWatcher` in the signed-in layout whenever a session exists. Reads go through a type guard; a malformed value is treated as absent and removed.

### iOS (expo-sqlite key-value store)

| Key | Holds | Cleared when |
|---|---|---|
| `thestats.game.v1` | The device's game record | Account deleted here, or found deleted (research R11) |
| `thestats.clock.v1` | Clock checkpoint | Same |
| `thestats.sync.v1` | `{ schemaVersion, userId, gameId, createKey, unsaved }`. Its `userId` also serves as the remembered account (research R6) | Same. Removed entirely, so the next sign-in claims a clean device |
| Keychain session | Supabase session | `auth.signOut({ scope: "local" })` |

### Account notice

| | Web | iOS |
|---|---|---|
| Carrier | Landing page query parameter `?account=deleted` or `?account=deleted-elsewhere` | In-memory notice store, read by the sign-in screen |
| Kinds | `deleted` (this device deleted the account) or `deleted-elsewhere` (found deleted) | Same |
| Copy | Shared from `@thestats/app` (research R12); never contains the email address or account data (FR-018) | Same |
| Lifetime | Shown while the page has the parameter | Until the next sign-in or dismissal; gone after an app restart |

## Device transitions

```text
Signed in ──(delete here: 204, or 401 account_deleted on a retry)────────▶ cleanup ─▶ start screen, notice "deleted"
Signed in ──(any API reply 401 account_deleted, or middleware sees
             user_not_found)──────────────────────────────────────────────▶ cleanup ─▶ start screen, notice "deleted-elsewhere"
Signed out, remembered account ──(status: exists false)──────────────────▶ cleanup ─▶ start screen, notice "deleted-elsewhere"
Another tab, same browser ──(broadcast from the tab that ran cleanup)────▶ cleanup ─▶ start screen, the same notice
Signed out, remembered account ──(status: exists true)───▶ web: forget the account; iOS: no change (device game kept)
```

**Cleanup** means:
- Discard unsaved changes (dispose write-through).
- Reset the game store.
- Remove the device keys above.
- End the local session.

It runs once per signed-in session.

## Shared types (`@thestats/app`)

| Name | Shape | Used by |
|---|---|---|
| `DeleteAccountBodySchema` | `{ password: string }` (1–1024) | Delete route; both clients build the body from it |
| `AccountStatusQuerySchema` | `{ userId: uuid }` | Status route |
| `parseAccountStatus(body)` | `{ exists: boolean } \| null` (type guard, no Zod) | Both clients parse the status reply |
| `parseApiError(body)`, `readApiErrorCode(response)` | `{ code, message, retryAfterSeconds? } \| null`; `Promise<string \| null>` read from a clone (type guards, no Zod) | Clients and the write-through controller read error codes without casts |
| `AccountNoticeKind` | `"deleted" \| "deleted-elsewhere"` | Notice on both platforms |
| `ACCOUNT_NOTICE_TEXT` | `Record<AccountNoticeKind, string>` | Notice copy |
| `WriteThroughOptions.onAccountGone` | `() => void` | Controller callback (research R10) |
