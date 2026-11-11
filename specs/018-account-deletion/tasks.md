---

description: "Task list for feature 018: account deletion"
---

# Tasks: Account Deletion

**Input**: Design documents from `/specs/018-account-deletion/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Tests are MANDATORY for theStats per Constitution Principle I (Test-Driven Development, NON-NEGOTIABLE). Every test task below MUST be written first and seen failing before the implementation task it drives starts.

**Organization**: Tasks are grouped by user story (spec.md), so each story can be built, tested and shipped as its own increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task in the same phase)
- **[Story]**: The spec user story the task belongs to (US1–US4)
- Paths are from the repository root

## Ground rules for every phase

- **Local Supabase only.** Integration and E2E suites create and delete accounts. Run them against `supabase start` from `packages/web`, with the env exported as in quickstart.md §1. Never point them at the hosted project: it serves the live site.
- **Mobile tests (RNTL v14):** always `await` `render`, `act` and `fireEvent`. An un-awaited `act` silently skips later effects. Never fake `queueMicrotask`; it hangs.
- **No secrets in code or logs.** The service-role key is read only through `getServerEnv()` in `packages/web/src/lib/supabase/admin.ts`. Never log a password or an email address.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm a green baseline, and add the shared integration-test helpers.

- [X] T001 Confirm a green baseline before changing anything, following `specs/018-account-deletion/quickstart.md` §1–2:
  1. From `packages/web`, run `supabase start`, then `eval "$(supabase status -o env)"`, then export `NEXT_PUBLIC_SUPABASE_URL=$API_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY`.
  2. Run `npm test` in `packages/app`; `npm run typecheck && npm run lint && npm run test:coverage` in `packages/web`; and `npm run typecheck && npm test` in `packages/mobile`.
  3. Note any failures that were already there before starting.
- [X] T002 [P] Create shared helpers for the account integration suites in `packages/web/tests/integration/account/_helpers.ts`. Export:
  - `RUN`: true only when all three Supabase env vars are set.
  - A service-role `admin` client: `SupabaseClient<Database>`, `autoRefreshToken: false`, `persistSession: false`.
  - `uniqueEmail(prefix)`: an `@example.com` address.
  - `uniqueIp()`: an address in `203.0.113.x`.
  - `createConfirmedUser(password)`: admin `createUser` with `email_confirm: true`; returns `{ id, email }`.
  - `accessTokenFor(email, password)`: `signInWithPassword` on a fresh non-persisting anon client.
  - `makeGameState()`: copied from `makeState()` in `packages/web/tests/integration/games/route.test.ts`.
  - `deleteRequest(body, headers?)`: builds a `Request` to `http://localhost:3000/api/account/delete` with `x-forwarded-for: uniqueIp()`.

  The file must not call `vi.mock`; each suite mocks `next/headers` itself.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared copy and parsers, the `account_deleted` signal in the authenticated-handler wrapper, and the complete `POST /api/account/delete` endpoint. US1 and US2 both call this endpoint. Its server-side protections (throttle, password check, all-or-nothing delete, natural idempotency) are built and contract-tested here.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests for the foundation (write first, see them fail) ⚠️

- [X] T003 [P] Write failing tests for `DeleteAccountBodySchema` and `AccountStatusQuerySchema` in `packages/app/src/validation/account.test.ts`:
  - `password` is accepted at 1 and 1024 characters.
  - It's rejected when missing, empty, 1025 characters long, or not a string.
  - Unknown keys are stripped.
  - `userId` is accepted for a UUID, and rejected for `abc`, an empty string, or a missing value.
- [X] T004 [P] Write failing tests for `parseApiError(body)` and `readApiErrorCode(response)` in `packages/app/src/api/errors.test.ts`:
  - A body `{ error: { code, message, retry_after_seconds } }` parses to `{ code, message, retryAfterSeconds }`. `retryAfterSeconds` is present only for a non-negative number.
  - Non-objects, and a missing or non-string `code` or `message`, parse to `null`.
  - `readApiErrorCode` returns the code from a JSON body, and `null` for a non-JSON or empty body.
  - It leaves the original `Response` body unread, because it reads a clone.
- [X] T005 [P] Write failing tests in `packages/app/src/account/notices.test.ts`:
  - `ACCOUNT_NOTICE_TEXT` equals the two strings in contracts/account-gone-signals.md §6 exactly.
  - `parseAccountNoticeKind` returns `"deleted"` or `"deleted-elsewhere"` for those values, and `null` for any other string, an array, or `undefined`.
  - Neither string contains `@` (FR-018).
- [X] T006 [P] Write failing tests in `packages/app/src/account/deleteAccount.test.ts`:
  - `DELETE_ACCOUNT_COPY` matches every string in contracts/confirmation-ui.md: section heading and text, button labels, dialog title, explanation, the "Password" label, the accessible name "Delete account permanently", and "Deleting…".
  - `toDeleteAccountOutcome(status, body)` maps:

    | Response | Outcome |
    |---|---|
    | `204` | `{ kind: "deleted" }` |
    | `401` with `account_deleted` | `deleted` |
    | any other `401` | `signed-out` |
    | `403` | `wrong-password` |
    | `429` | `rate-limited`, with `retryAfterSeconds` from the body (30 when absent) |
    | `400` | `invalid` |
    | anything else | `failed` |

  - `deleteAccountErrorText(outcome)` returns the contract's text for `wrong-password`, `rate-limited` ("1 second" vs "N seconds"), `failed`, `offline` and `invalid`.
- [X] T007 [P] Extend `packages/web/src/lib/api/handler.test.ts` with failing tests, reusing the file's existing client mocks:
  - A `getUser` error with `code: "user_not_found"`, on either a bearer or a cookie credential, returns `401 { error: { code: "account_deleted", message: "This account no longer exists." } }`.
  - For the cookie credential, `auth.signOut({ scope: "local" })` is also called.
  - Any other `getUser` error still returns `401 unauthenticated`.
  - The handler context carries `email` (the verified user's email, or `null`) and `credential` (`"cookie" | "bearer"`).
  - `jsonError(code, message, status?)` still works, and accepts a fourth argument `{ retryAfterSeconds }` that adds `retry_after_seconds` to the body and a `Retry-After` header.
  - The new codes map to their statuses: `account_deleted` 401, `current_password_incorrect` 403, `rate_limited` 429.
  - `withAuthenticatedHandler(name, handler, { component })` logs that component (default `"games-api"`), and logs the outcome `account_deleted` with `user_id: null`.
- [X] T008 [P] Write failing unit tests for `deleteOwnAccount({ request, userId, email, password })` in `packages/web/src/lib/account/delete-account.test.ts`, mocking `@/lib/auth/attempt-throttle`, `@/lib/supabase/stateless` and `@/lib/supabase/admin`:
  - The keys come from `throttleKeys(email.trim().toLowerCase(), request)`, so they match sign-in's `e:<email>` key.
  - A `null` throttle lookup returns `{ kind: "error", stage: "throttle" }` with no password check.
  - A disallowed attempt returns `{ kind: "rate-limited", retryAfterSeconds }`.
  - A failed `signInWithPassword` calls `recordAuthAttempt(keys, false)` and returns `{ kind: "wrong-password" }`, with no admin call.
  - Success calls `recordAuthAttempt(keys, true)`, then `auth.admin.deleteUser(userId, false)`, and returns `{ kind: "deleted" }`.
  - An admin `user_not_found` or `404` error also returns `deleted`.
  - Any other admin error calls the stateless client's `auth.signOut({ scope: "local" })` and returns `{ kind: "error", stage: "delete" }`.
- [X] T009 [P] Write the failing bearer-path contract suite in `packages/web/tests/integration/account/delete.test.ts`. Use `describe.skipIf(!RUN)`, mock `next/headers` with an empty cookie store as `packages/web/tests/integration/games/bearer.test.ts` does, and import `POST` from `@/app/api/account/delete/route`. Seed one game through `@/app/api/games/route` with the bearer token, and a `profiles` row through `admin`. Cover contracts/delete-account-api.md integration tests 1–8 and 10:
  1. No credentials, and a malformed `Bearer` header: `401`.
  2. `{}`, `{ password: "" }` and a non-JSON body: `400 invalid_body`, with the account intact.
  3. A wrong password: `403 current_password_incorrect`, with the profile and game intact.
  4. Repeated wrong passwords: `429`, with `retry_after_seconds` and `Retry-After`.
  5. The right password: `204` with `Cache-Control: no-store`. Through `admin`, there are no `profiles`, `games` or `game_writes` rows for the user, but the `auth_attempts` row `e:<email>` still exists (FR-017).
  6. Sign-in with the old credentials returns the same `401 invalid_credentials` body as an unknown email. A new account with the same email has no profile or games.
  7. Repeating the delete with the old token: `401 account_deleted`.
  8. Two concurrent deletes both end in `204` or `401 account_deleted`, with no `500`.
  9. Timing (contract test 10): bulk-insert 200 `games` rows for the user through `admin`, each built from `makeGameState()` with `deriveSummaryColumns` from `@thestats/app`. The delete returns `204` in under 5 s, and no game rows remain (plan Performance Goals).
- [X] T010 [P] Write the failing cookie-path suite in `packages/web/tests/integration/account/delete-cookie.test.ts`:
  - Mock `next/headers` with a `cookieJar` map, exactly as `packages/web/tests/integration/games/route.test.ts` does.
  - Sign in once through `@/app/api/auth/sign-in/route`; the auth client is a per-file singleton.
  - Seed one game through `@/app/api/games/route`.
  - Delete with the right password and assert:
    - `204`;
    - every `sb-…-auth-token` cookie in the jar is emptied;
    - the user's rows are gone;
    - a following `GET /api/games` returns `401`.
- [X] T011 [P] Write the failing failure-path suite in `packages/web/tests/integration/account/delete-failure.test.ts`:
  - `vi.mock("@/lib/supabase/admin")` so that `createAdminClient()` returns the real admin client (via `vi.importActual`), except that `auth.admin.deleteUser` resolves `{ data: { user: null }, error: new AuthApiError("boom", 500, "unexpected_failure") }`.
  - Deleting with the right password (bearer) returns `500 internal_error`.
  - The user, profile and game all still exist (FR-006, FR-013).
- [X] T012 [P] Write the failing suite `packages/web/tests/integration/games/deleted-account.test.ts` (contracts/account-gone-signals.md §1). It pins Supabase reporting `user_not_found` for deleted users (research R5).
  - **Bearer**: create a user, take its access token, delete the user with `admin.auth.admin.deleteUser`, then `GET /api/games` with the still-valid token. Expect `401 account_deleted`.
  - **Cookie**: sign in through the sign-in route into a cookie jar (mocked as in `games/route.test.ts`), delete the user with the admin API, then `GET /api/games`. Expect `401 account_deleted`, and the jar's auth cookies emptied.

### Implementation for the foundation

- [X] T013 [P] Implement `DeleteAccountBodySchema` (`{ password: z.string().min(1).max(1024) }`) and `AccountStatusQuerySchema` (`{ userId: z.string().uuid() }`), with their inferred types, in `packages/app/src/validation/account.ts`. Follow `validation/profile.ts`.
- [X] T014 [P] Implement `parseApiError` and `readApiErrorCode` in `packages/app/src/api/errors.ts` with type guards only. Don't use Zod, so client chunks stay small. `readApiErrorCode` reads `response.clone()` and never throws.
- [X] T015 [P] Implement `AccountNoticeKind`, `ACCOUNT_NOTICE_TEXT` (`as const satisfies Record<AccountNoticeKind, string>`) and `parseAccountNoticeKind(value: unknown)` in `packages/app/src/account/notices.ts`.
- [X] T016 Implement the following in `packages/app/src/account/deleteAccount.ts` (depends on T014):
  - `DELETE_ACCOUNT_COPY`.
  - The `DeleteAccountOutcome` union: `deleted`, `signed-out`, `wrong-password`, `rate-limited` (with `retryAfterSeconds`), `invalid`, `failed` and `offline`.
  - `toDeleteAccountOutcome(status, body)`, using `parseApiError`.
  - `deleteAccountErrorText(outcome)`.
- [X] T017 Export `validation/account`, `api/errors`, `account/notices` and `account/deleteAccount` from `packages/app/src/index.ts`. Then run `npm test && npm run typecheck` in `packages/app`; T003–T006 should pass.
- [X] T018 [P] Implement the T007 behavior in `packages/web/src/lib/api/handler.ts`:
  - `authenticate()` returns `{ kind: "ok", userId, email, supabase } | { kind: "deleted" } | { kind: "unauthenticated" }`.
  - It returns `deleted` when the `getUser` error's `code` is `"user_not_found"`. For cookie credentials it also runs `await supabase.auth.signOut({ scope: "local" })`, swallowing errors.
  - Add `email` and `credential` to `AuthenticatedContext`.
  - Extend `ErrorCode` and `DEFAULT_STATUS` with `account_deleted`, `current_password_incorrect` and `rate_limited`.
  - Add the optional `{ retryAfterSeconds }` argument to `jsonError`, and the `{ component }` option to `withAuthenticatedHandler`.
  - The existing games routes must keep passing unchanged.
- [X] T019 [P] Update the doc comment in `packages/web/src/lib/supabase/admin.ts` to list every justified service-role use, citing plan.md Complexity Tracking:
  - the throttle RPCs (`lib/auth/attempt-throttle.ts`);
  - account deletion (`lib/account/delete-account.ts`);
  - the account existence lookup (`lib/account/account-status.ts`).
- [X] T020 [P] Implement `deleteOwnAccount` in `packages/web/src/lib/account/delete-account.ts` (`import "server-only"`), per research R1–R2 and the T008 tests:
  - Reuse `throttleKeys`, `checkAuthAttempt` and `recordAuthAttempt`.
  - Check the password with `createStatelessClient()` and `signInWithPassword`.
  - Delete with `createAdminClient().auth.admin.deleteUser(userId, false)`.
  - Return a discriminated result. Never throw for expected failures.
- [X] T021 Implement `POST` in `packages/web/src/app/api/account/delete/route.ts` as `withAuthenticatedHandler("account-delete", handler, { component: "account-api" })`, per contracts/delete-account-api.md (depends on T017, T018, T020):
  - Parse the JSON body; a parse failure returns `400 invalid_body` "Enter your password to confirm."
  - Validate with `DeleteAccountBodySchema`.
  - Return `500` if the context has no email.
  - Call `deleteOwnAccount` and map its result:
    - `deleted`: for `credential === "cookie"`, first run `await ctx.supabase.auth.signOut({ scope: "local" })`; then `204`.
    - `wrong-password`: `403 current_password_incorrect` "Current password is incorrect."
    - `rate-limited`: `429 rate_limited`, with `retryAfterSeconds`.
    - `error`: `500 internal_error`.
  - Every response carries `Cache-Control: no-store`.
  - Never log the password or the email address.
  - Run T009–T012 against local Supabase until they're green.

**Checkpoint**: The endpoint passes every contract test, and every authenticated API reports `account_deleted`. User story work can start, on web and iOS in parallel.

---

## Phase 3: User Story 1 - Delete my account from the account page (Priority: P1) 🎯 MVP

**Goal**: A signed-in web user deletes their account from `/account`, confirms with their password, and lands on the landing page with "Your account has been deleted." The browser keeps no sign-in and no game data. Other open tabs follow at once, so none can write the game back.

**Independent Test** (spec US1):
1. Create an account and save a game.
2. Delete the account from `/account`.
3. Check that the landing page shows the notice.
4. Check that signing in with the old credentials fails.
5. Check that the old game's URL no longer opens it.

### Tests for User Story 1 (MANDATORY per Constitution Principle I) ⚠️

> **NOTE: Write these tests FIRST and see them FAIL before any implementation task in this story starts.**

- [X] T022 [P] [US1] Extend `packages/web/src/lib/persistence.test.ts` with failing tests:
  - `ACCOUNT_STORAGE_KEY === "thestats.account.v1"`.
  - `forgetRememberedAccount()` removes that key, and doesn't throw when storage is unavailable.
- [X] T023 [P] [US1] Write failing tests in `packages/web/src/lib/account/device-account.test.ts`:
  - `clearDeviceGameData()` removes `thestats.game.v1`, `thestats.clock.v1` and `thestats.account.v1`, and doesn't throw without storage.
  - `beginOwnDeletion()`, `endOwnDeletion()` and `isOwnDeletionInProgress()` track the flag.
  - The module never imports `@/lib/store`. Guard this with `vi.mock("@/lib/store", () => { throw new Error("store imported"); })`.
- [X] T024 [P] [US1] Write failing tests in `packages/web/src/lib/account/account-gone.test.ts`:
  - `handleAccountGone("deleted")` calls `useGameStore.getState().resetAll()`, then `clearDeviceGameData()`, then posts `"deleted"` on `BroadcastChannel("thestats.account")`, then `window.location.assign("/?account=deleted")`.
  - `"deleted-elsewhere"` posts that kind and navigates to `/?account=deleted-elsewhere`.
  - `handleAccountGone(kind, { fromBroadcast: true })` cleans up and navigates without posting again.
  - Nothing throws when `BroadcastChannel` is undefined.
  - A second call before navigation does nothing.
  - `"deleted-elsewhere"` does nothing while `isOwnDeletionInProgress()` is true.
- [X] T025 [P] [US1] Write failing tests in `packages/web/src/lib/account/delete-account-request.test.ts`:
  - `requestAccountDeletion(password)` sends `POST /api/account/delete` with `Content-Type: application/json` and body `{ password }`.
  - For any response, including one with a non-JSON body, it returns `toDeleteAccountOutcome(status, body)`.
  - It returns `{ kind: "offline" }` when `fetch` rejects.
- [X] T026 [P] [US1] Write failing tests for the `useAccountDeletion()` hook in `packages/web/src/lib/account/useAccountDeletion.test.ts`, using `renderHook` and mocking `@/lib/account/delete-account-request` and `@/lib/account/account-gone`:
  - `submit(password)` calls `requestAccountDeletion` with the password, between `beginOwnDeletion()` and `endOwnDeletion()`.
  - `pending` is `true` while the request is in flight, and a second `submit` during that time sends nothing (FR-014).
  - `deleted` calls `handleAccountGone("deleted")`.
  - `signed-out` calls `window.location.assign("/login?from=/account")`.
  - Any failure outcome sets `failure` to that outcome and clears the own-deletion flag.
  - `reset()` clears `failure`.
- [X] T027 [P] [US1] Write failing tests in `packages/web/src/components/account/DeleteAccountSection.test.tsx`:
  - It renders a `section` labelled "Delete account", with the section text from `DELETE_ACCOUNT_COPY`, styled as a danger zone and separate from the profile panels.
  - Its "Delete account" button opens the dialog.
- [X] T028 [P] [US1] Write failing tests in `packages/web/src/components/account/DeleteAccountDialog.test.tsx`. The `<dialog>` polyfill is in `packages/web/vitest.setup.ts`. Mock `@/lib/account/useAccountDeletion`, so these tests cover rendering only:
  - When open, it shows the title and explanation from `DELETE_ACCOUNT_COPY` and focuses the password field.
  - Delete is disabled while the field is empty.
  - Submitting, with the button or with Enter, calls the hook's `submit` with the typed password.
  - A `failure` from the hook shows `deleteAccountErrorText(failure)` in a `role="alert"` element, and the dialog stays open.
  - Cancel and Esc close the dialog, clear the field and call `reset()`, without calling `submit`.
- [X] T029 [P] [US1] Write failing tests in `packages/web/src/components/account/AccountNotice.test.tsx`:
  - For each `AccountNoticeKind`, it renders `ACCOUNT_NOTICE_TEXT[kind]` in a `role="status"` element.
  - It calls `clearDeviceGameData()` once, on mount.
  - A Dismiss button (`aria-label="Dismiss"`) hides it.
  - The rendered text never contains `@`.
- [X] T030 [P] [US1] Write failing tests in `packages/web/src/components/account/AccountWatcher.test.tsx` for its US1 job, listening to other tabs (mock `@/lib/account/account-gone`):
  - A message on `BroadcastChannel("thestats.account")` carrying a valid `AccountNoticeKind` calls `handleAccountGone(kind, { fromBroadcast: true })`.
  - Any other message is ignored.
  - The channel is closed on unmount, and nothing throws when `BroadcastChannel` is undefined.
  - It renders nothing.
- [X] T031 [P] [US1] Extend `packages/web/src/app/page.test.tsx` with failing tests for the landing page taking `searchParams` (a Promise in Next 15):
  - `{ account: "deleted" }` and `{ account: "deleted-elsewhere" }` render the matching notice.
  - `{ account: "nope" }`, an array value, or no parameter render no notice.
  - The existing hero assertions keep passing.
- [X] T032 [P] [US1] Write the failing US1 block of `packages/web/tests/e2e/account-deletion.spec.ts`. Copy the setup of `packages/web/tests/e2e/account-profile.spec.ts`: empty `storageState`, skip without env, admin `createConfirmedUser`, `signInViaAPI`, and a random `X-Forwarded-For`.
  1. Sign in, start a game, and record a play.
  2. Open `/account` and delete with the right password.
  3. The URL is `/?account=deleted`, showing "Your account has been deleted."
  4. localStorage holds none of `thestats.game.v1`, `thestats.clock.v1` or `thestats.account.v1`, and no `sb-` cookies remain.
  5. Signing in through the `/login` form shows "Invalid email or password."
  6. `/games/<old id>` redirects to `/login`.
  7. A new user created with the same email sees an empty games list.
  8. With a second tab of the same browser context open on the live game page, deleting in the first tab sends the second to `/?account=deleted`, and 3 s later localStorage still holds none of the `thestats.*` keys.

### Implementation for User Story 1

- [X] T033 [US1] Add `ACCOUNT_STORAGE_KEY` and `forgetRememberedAccount()` to `packages/web/src/lib/persistence.ts`, which owns every `localStorage` call. Use `getBrowserStorage()` and swallow storage errors.
- [X] T034 [US1] Implement `packages/web/src/lib/account/device-account.ts` as a client module that doesn't import `@/lib/store` (depends on T033):
  - `clearDeviceGameData()`: `clearPersistedGame()` plus `forgetRememberedAccount()`.
  - `beginOwnDeletion()`, `endOwnDeletion()` and `isOwnDeletionInProgress()`.
- [X] T035 [US1] Implement `handleAccountGone(kind: AccountNoticeKind, opts?: { fromBroadcast?: boolean })` in `packages/web/src/lib/account/account-gone.ts`, per research R9 (depends on T034):
  1. Ignore `"deleted-elsewhere"` while an own deletion is in progress, and guard against repeat calls.
  2. `useGameStore.getState().resetAll()`.
  3. `clearDeviceGameData()`.
  4. Unless `opts.fromBroadcast` is set, post `kind` on `BroadcastChannel("thestats.account")`, skipping silently when `BroadcastChannel` is unavailable.
  5. `window.location.assign("/?account=" + kind)`.
- [X] T036 [P] [US1] Implement `requestAccountDeletion(password): Promise<DeleteAccountOutcome>` in `packages/web/src/lib/account/delete-account-request.ts`, using `toDeleteAccountOutcome` from `@thestats/app`.
- [X] T037 [US1] Implement `useAccountDeletion()` in `packages/web/src/lib/account/useAccountDeletion.ts`, per the T026 tests (depends on T035, T036):
  - It returns `{ pending, failure, submit, reset }`.
  - It guards against double submits with a ref.
  - It owns the own-deletion flag, and the `deleted` and `signed-out` handling.
- [X] T038 [US1] Implement `packages/web/src/components/account/DeleteAccountDialog.tsx` (`"use client"`), per contracts/confirmation-ui.md and the T028 tests. It only renders: its state and actions come from `useAccountDeletion()` (depends on T037):
  - Build it on `Modal`, `Button` (`variant="danger"` and `"ghost"`) and `Input`.
  - Use a `<form>` with a labelled password input: `type="password"`, `autoComplete="current-password"`, `autoFocus`.
  - Give the danger button `aria-label="Delete account permanently"`.
- [X] T039 [US1] Implement `packages/web/src/components/account/DeleteAccountSection.tsx` (`"use client"`): a danger-styled `panel` section (`aria-labelledby` its heading) with the shared copy and a button that opens `DeleteAccountDialog` (depends on T038).
- [X] T040 [US1] Render `<DeleteAccountSection />` last in the column of `packages/web/src/app/(authenticated)/account/page.tsx`, after `<SignOutButton />`, and update the page's doc comment (depends on T039).
- [X] T041 [US1] Implement `packages/web/src/components/account/AccountNotice.tsx` (`"use client"`, prop `kind`), per contracts/account-gone-signals.md §3 and the T029 tests (depends on T034).
- [X] T042 [US1] Implement `packages/web/src/components/account/AccountWatcher.tsx` (`"use client"`, renders `null`) with only its US1 job, per the T030 tests: subscribe to `BroadcastChannel("thestats.account")`, hand valid kinds to `handleAccountGone(kind, { fromBroadcast: true })`, and close the channel on unmount (depends on T035).
- [X] T043 [US1] Mount `<AccountWatcher />` inside `WriteThroughProvider` in `packages/web/src/app/(authenticated)/layout.tsx`, so every signed-in tab listens (depends on T042).
- [X] T044 [US1] Update `packages/web/src/app/page.tsx` (depends on T040, T041, T043):
  - Change it to `export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> })`.
  - Parse `account` with `parseAccountNoticeKind`, and when it's present render `<AccountNotice kind={kind} />` at the top of `<main>`.
  - Run the US1 E2E block (T032) until it's green.

**Checkpoint**: Web users can delete their accounts (spec US1 acceptance scenarios 1–5), and the MVP can ship.

---

## Phase 4: User Story 2 - Delete my account in the iOS app (Priority: P2)

**Goal**: An iOS user opens the Account screen from Home in one tap and deletes their account with their password. The app clears the account's games from the device and shows the sign-in screen with "Your account has been deleted." This unblocks App Store guideline 5.1.1(v).

**Independent Test** (spec US2):
1. In the app, sign in to an account with a finished saved game, and leave another game in progress.
2. Delete the account from the Account screen.
3. Check that the sign-in screen shows the notice.
4. Check that the old credentials fail in the app and on the web.
5. Sign up again with the same email, and check that neither game appears.

### Tests for User Story 2 (MANDATORY per Constitution Principle I) ⚠️

- [X] T045 [P] [US2] Extend `packages/mobile/src/lib/gameSync.test.ts` with failing tests for `forgetDeviceGame()`:
  - The active controller is disposed, so a pending change is never sent: no `apiFetch` call happens afterwards.
  - `useGameStore.getState().resetAll()` runs.
  - `thestats.game.v1` and `thestats.clock.v1` are cleared, and `thestats.sync.v1` is removed.
  - It's safe to call with no active controller.
- [X] T046 [P] [US2] Write failing tests in `packages/mobile/src/lib/accountGone.test.ts`, mocking `@/lib/gameSync` and `@/lib/supabase`:
  - `handleAccountGone("deleted")` calls `forgetDeviceGame()`, then sets the notice to `"deleted"`, then `auth.signOut({ scope: "local" })`, in that order.
  - A second call does nothing until `onSignedIn()`.
  - `"deleted-elsewhere"` is ignored while `isOwnDeletionInProgress()`.
  - `useAccountNotice()` re-renders with the current notice.
  - `clearAccountNotice()` and `onSignedIn()` clear it.
- [X] T047 [P] [US2] Write failing tests in `packages/mobile/src/lib/account.test.ts` for `deleteAccount(password)`:
  - It reads the token from `getSupabase().auth.getSession()`. With no session it returns `{ kind: "signed-out" }` and sends nothing.
  - It POSTs `${apiUrl}/api/account/delete` with `Authorization: Bearer <token>`, `Content-Type: application/json` and body `{ password }`, between `beginOwnDeletion()` and `endOwnDeletion()`.
  - It returns `toDeleteAccountOutcome(status, body)`, or `{ kind: "offline" }` when `fetch` rejects.
  - It calls `handleAccountGone("deleted")` only for `deleted`.
  - It never calls `apiFetch` or `refreshSession`.
- [X] T048 [P] [US2] Write failing tests in `packages/mobile/src/components/account/DeleteAccountSheet.test.tsx`, mocking `@/lib/account`:
  - When visible, it shows the title and explanation from `DELETE_ACCOUNT_COPY`, and a secure `TextField` labelled "Password".
  - Delete (accessibility label "Delete account permanently") is disabled until a password is typed.
  - Pressing it, or the return key, calls `deleteAccount` with the password.
  - A failure outcome shows `deleteAccountErrorText(outcome)` with `accessibilityRole="alert"`.
  - Cancel and Close call `onClose` without calling `deleteAccount`.
  - The sheet's scroll view sets `automaticallyAdjustKeyboardInsets`, so the field and buttons scroll clear of the keyboard (drives T056).
- [X] T049 [P] [US2] Write failing screen tests in `packages/mobile/src/__tests__/account-screen.test.tsx`, following the pattern of `packages/mobile/src/__tests__/home-screen.test.tsx`:
  - It shows "Signed in as <email>" from the session.
  - It shows the "Delete account" heading and text.
  - The "Delete account" button opens the sheet.
  - The header's back button returns home.

  Also write a failing route-registration test in `packages/mobile/src/__tests__/root-layout.test.tsx`: render `RootLayout` with `@/lib/session` mocked to control the session, and `expo-router` mocked so `Stack.Protected` renders its children only when `guard` is true and `Stack.Screen` renders its `name`. `account` appears with a session and not without one (drives T059).
- [X] T050 [P] [US2] Extend `packages/mobile/src/__tests__/home-screen.test.tsx`: an "Account" button sits beside "Sign out", and one press calls `router.push("/account")` (FR-016, SC-007).
- [X] T051 [P] [US2] Extend `packages/mobile/src/__tests__/sign-in-screen.test.tsx`:
  - With the notice set to `"deleted"`, the screen shows `ACCOUNT_NOTICE_TEXT.deleted` with `accessibilityRole="alert"`, and calls `AccessibilityInfo.announceForAccessibility` with that text.
  - Dismiss clears the notice.
  - With no notice, nothing extra renders.
- [X] T052 [P] [US2] Extend `packages/mobile/src/lib/session.test.tsx`: applying a non-null session calls `onSignedIn()` from `@/lib/accountGone`.

### Implementation for User Story 2

- [X] T053 [US2] Implement `forgetDeviceGame()` in `packages/mobile/src/lib/gameSync.ts`:
  - Dispose `active`, dropping unsaved changes without flushing.
  - Call `useGameStore.getState().resetAll()`, `clearPersistedGame(deviceStorage)` and `deviceStorage.removeItem(SYNC_STORAGE_KEY)`.
  - Guard each storage call the way `writeStoredSync` does.
- [X] T054 [US2] Implement `packages/mobile/src/lib/accountGone.ts`, per research R11 and the T046 tests (depends on T053):
  - A tiny notice store built on `useSyncExternalStore`, with `useAccountNotice`, `setAccountNotice` and `clearAccountNotice`.
  - `beginOwnDeletion`, `endOwnDeletion` and `isOwnDeletionInProgress`.
  - `onSignedIn()`.
  - `handleAccountGone(kind)`.
- [X] T055 [US2] Implement `deleteAccount(password): Promise<DeleteAccountOutcome>` in `packages/mobile/src/lib/account.ts`, per the T047 tests, using `getEnv().apiUrl` and `toDeleteAccountOutcome` from `@thestats/app` (depends on T054).
- [X] T056 [P] [US2] Add `automaticallyAdjustKeyboardInsets` to the `ScrollView` in `packages/mobile/src/components/ui/Sheet.tsx`, so sheet content scrolls clear of the keyboard. The tests of existing Sheet users must stay green. This makes T048's keyboard assertion pass.
- [X] T057 [US2] Implement `packages/mobile/src/components/account/DeleteAccountSheet.tsx`, per contracts/confirmation-ui.md and the T048 tests (depends on T055, T056):
  - Build it on `Sheet` without a `footer`. The Cancel and `variant="danger"` buttons go inside the scrolling content, so they can be scrolled above the landscape keyboard.
  - Use a `TextField` with `secureTextEntry`, `textContentType="password"`, `autoComplete="current-password"` and `returnKeyType="go"`.
- [X] T058 [US2] Create the Account screen `packages/mobile/src/app/account.tsx` (depends on T057):
  - A `SafeAreaView` with a `ScreenHeader` titled "Account", going back to Games with `router.back()`.
  - "Signed in as <email>" from `useSession()`.
  - A danger-styled "Delete account" block with the shared copy, and a `variant="danger"` button that opens `DeleteAccountSheet`.
- [X] T059 [US2] Register `<Stack.Screen name="account" />` inside the signed-in `Stack.Protected` in `packages/mobile/src/app/_layout.tsx` (depends on T058). This makes T049's route-registration test pass.
- [X] T060 [US2] Add an "Account" `Pressable` next to `<SignOutButton />` in `packages/mobile/src/app/index.tsx`: `accessibilityRole="button"`, label "Account", the same styling as `SignOutButton`, calling `router.push("/account")` (depends on T059).
- [X] T061 [US2] Show the account notice at the top of the form in `packages/mobile/src/app/sign-in.tsx` (depends on T054):
  - Read `useAccountNotice()`.
  - Render `ACCOUNT_NOTICE_TEXT[notice]` with `accessibilityRole="alert"` and a Dismiss control.
  - Announce it once with `AccessibilityInfo.announceForAccessibility`.
- [X] T062 [US2] In `packages/mobile/src/lib/session.tsx`, call `onSignedIn()` in `SessionProvider`'s `apply` whenever a session is applied. Then run `npm run typecheck && npm test` in `packages/mobile` (depends on T054).

**Checkpoint**: iOS users can delete their accounts in the app (spec US2 scenarios 1–4). Scenario 5, the iPhone landscape keyboard, is checked by hand in T107.

---

## Phase 5: User Story 3 - Back out or make a mistake safely (Priority: P3)

**Goal**: On both platforms, cancelling, mistyping or failing never deletes anything. The user always sees one clear outcome, and a double tap sends one request. The server-side protections already exist (Phase 2); this story completes and verifies the client side.

**Independent Test** (spec US3): On the web and then in the app, try each of these in turn:
- open the confirmation step and cancel;
- enter a wrong password;
- make the request fail.

After each one, check that the user is still signed in and their profile and games are intact.

### Tests for User Story 3 (MANDATORY per Constitution Principle I) ⚠️

- [X] T063 [P] [US3] Extend `packages/web/src/components/account/DeleteAccountDialog.test.tsx` with failing tests, with `useAccountDeletion` still mocked:
  - While the hook reports `pending`, the danger button reads "Deleting…" with `aria-busy="true"`, and the input, Cancel and Delete are disabled.
  - After a `wrong-password` failure, the password field is focused with its text selected.
  - A `rate-limited` failure shows "Too many attempts. Try again in 1 second." or "… N seconds."
  - After `failed` and `offline` failures, Delete is enabled again, so the user can retry.
- [X] T064 [P] [US3] Write the failing US3 block of `packages/web/tests/e2e/account-deletion.spec.ts` (SC-003, SC-006):
  - Esc and Cancel leave the account intact: reloading `/account` still shows the user signed in, and the game is still in `/games`.
  - A wrong password shows "Current password is incorrect.", and a correct retry then deletes.
  - Repeated wrong passwords show "Too many attempts. Try again in N seconds.", and the account still exists.
  - The whole flow works with the keyboard alone: Tab to "Delete account", Enter, type the password, Enter.
  - At a 360×640 viewport, the account page and the open dialog show the password field and both buttons without horizontal scrolling (FR-015, Principle IV).
- [X] T065 [P] [US3] Extend `packages/mobile/src/components/account/DeleteAccountSheet.test.tsx` with failing tests:
  - While pending, the danger button's `accessibilityState.busy` is set, and the field and both buttons are disabled.
  - A double press calls `deleteAccount` once.
  - After `wrong-password`, the field is focused again.
  - `rate-limited`, `failed` and `offline` show their texts and allow a retry.

### Implementation for User Story 3

- [X] T066 [US3] Implement the T063 behaviors in `packages/web/src/components/account/DeleteAccountDialog.tsx`:
  - render the hook's `pending` state: inputs disabled, "Deleting…" and `aria-busy`;
  - refocus and `select()` the password field after `wrong-password`.

  The double-submit guard already lives in `useAccountDeletion` (T037).
- [X] T067 [P] [US3] Implement the T065 behaviors in `packages/mobile/src/components/account/DeleteAccountSheet.tsx`: the pending state, a double-press guard, and refocus on `wrong-password`.

**Checkpoint**: Spec US3 scenarios 1–5 hold on both platforms. Scenarios 3–5 are also backed by the Phase 2 contract tests.

---

## Phase 6: User Story 4 - Other signed-in devices stop using the deleted account (Priority: P4)

**Goal**: Any other browser or iOS device signed in to a deleted account loses access the next time it contacts theStats. It throws away its copy of the game, including unsaved changes, and shows its start screen with "You were signed out because this account was deleted." This must work both while that device's sign-in is still valid and after it has expired.

**Independent Test** (spec US4):
1. Sign in to one account in two browsers, or in a browser and the app.
2. Delete the account in one.
3. In the other, open the games list or record a play.
4. Check that it signs out to its start screen with the notice and no longer shows the account's games.

### Tests for User Story 4 (MANDATORY per Constitution Principle I) ⚠️

- [X] T068 [P] [US4] Write failing tests for `parseAccountStatus(body)` in `packages/app/src/account/status.test.ts`: `{ exists: true }` and `{ exists: false }` parse to themselves; anything else (missing, non-boolean, non-object) parses to `null`.
- [X] T069 [P] [US4] Extend `packages/app/src/games/writeThrough.test.ts` with failing tests:
  - A `401` whose body has `error.code === "account_deleted"` calls `onAccountGone` exactly once and schedules no retry, even with a `retry` policy.
  - Later `onCommit` and `saveNow` calls send nothing.
  - A `401` with `unauthenticated` keeps today's retry behavior.
- [X] T070 [P] [US4] Write failing unit tests for `accountExists(userId)` in `packages/web/src/lib/account/account-status.test.ts`, mocking `@/lib/supabase/admin`:
  - a found user returns `true`;
  - an error with status `404` or code `user_not_found` returns `false`;
  - any other error returns `null`.
- [X] T071 [P] [US4] Write the failing contract suite `packages/web/tests/integration/account/status.test.ts`, covering contracts/account-status-api.md tests 1–5. Call `GET` from `@/app/api/account/status/route` with no cookies and no `Authorization`.
- [X] T072 [P] [US4] Extend `packages/web/src/middleware.test.ts` (moved from the package root with the middleware; see T090) with failing tests for a new pure `deletedAccountRedirect(pathname)` (rows 18–20 in contracts/account-gone-signals.md):
  - It returns `"/?account=deleted-elsewhere"` for `/`, `/login`, `/games`, `/games/abc`, `/game`, `/setup` and `/account`.
  - It returns `null` for `/api/games`, `/api/account/delete` and every other `/api/…` path.
- [X] T073 [P] [US4] Extend `packages/web/src/lib/persistence.test.ts` with failing tests:
  - `rememberAccount(userId)` writes `{"userId":"…"}`.
  - `readRememberedAccount()` returns the id.
  - A malformed value returns `null` and is removed.
  - Neither throws without storage.
- [X] T074 [P] [US4] Extend `packages/web/src/lib/account/device-account.test.ts` with failing tests for `fetchAccountExists(userId)`:
  - It GETs `/api/account/status?userId=<encoded>` with `cache: "no-store"`.
  - It returns `true` or `false` via `parseAccountStatus`.
  - It returns `null` for a non-200 response, an unparsable body, or a rejected `fetch`.
- [X] T075 [P] [US4] Extend `packages/web/src/components/account/AccountWatcher.test.tsx` (created in T030) with failing tests for its US4 job, mocking `@/lib/supabase/client`, `@/lib/account/device-account` and `@/lib/account/account-gone`:
  - A present session calls `rememberAccount(session.user.id)`.
  - A `SIGNED_OUT` event, with a remembered account and no own deletion in progress, calls `fetchAccountExists`:
    - `false` calls `handleAccountGone("deleted-elsewhere")`;
    - `true` or `null` does nothing.
  - During an own deletion, nothing is fetched.
  - It renders nothing.
- [X] T076 [P] [US4] Write failing tests in `packages/web/src/components/account/AccountCheck.test.tsx`:
  - With a remembered account and no `account` query parameter, it calls `fetchAccountExists` once:
    - `false` calls `forgetRememberedAccount()` and then `window.location.replace("/?account=deleted-elsewhere")`;
    - `true` calls only `forgetRememberedAccount()`;
    - `null` does nothing, keeping the account for next time.
  - With an `account` parameter, or no remembered account, nothing is fetched.
  - It renders nothing, and imports neither `@/lib/store` nor `@/lib/supabase/client`.
- [X] T077 [P] [US4] Extend `packages/web/src/lib/games/writeThrough.test.ts`: the hook builds the controller with an `onAccountGone` that calls `handleAccountGone("deleted-elsewhere")`. Mock `@/lib/account/account-gone`.
- [X] T078 [P] [US4] Extend `packages/web/src/components/auth/sign-out-button.test.tsx`: `forgetRememberedAccount()` is called before the `POST /api/auth/sign-out`.
- [X] T079 [P] [US4] Extend `packages/web/src/app/login/page.test.tsx` and `packages/web/src/app/page.test.tsx`: both pages render `AccountCheck`. Mock the component and assert it mounted.
- [X] T080 [P] [US4] Write the failing US4 block of `packages/web/tests/e2e/account-deletion.spec.ts`, using two browser contexts for one user:
  - **(a)** A deletes. B runs `goto("/games")` and lands on `/?account=deleted-elsewhere`, showing "You were signed out because this account was deleted.", with B's `thestats.*` keys cleared.
  - **(b)** B is on the live game page and records a play after A deletes. B lands on the same notice.
  - **(c)** B visits `/games`, then clears its cookies (`context.clearCookies()`) but keeps localStorage. A deletes. B reloads `/`, and the status check shows the notice.
- [X] T081 [P] [US4] Write failing tests in `packages/mobile/src/lib/accountEvents.test.ts`:
  - `onAccountDeleted(listener)` returns an unsubscribe function.
  - `reportAccountDeleted()` calls each current listener once.
  - An unsubscribed listener isn't called.
- [X] T082 [P] [US4] Extend `packages/mobile/src/lib/api.test.ts`:
  - A `401` with `account_deleted` calls `reportAccountDeleted()`, doesn't call `refreshSession`, and returns the original response with its body still readable.
  - A `401` with `unauthenticated` keeps the existing refresh-and-retry.
- [X] T083 [P] [US4] Extend `packages/mobile/src/lib/account.test.ts` for `checkAccountExists(userId)`:
  - It GETs `${apiUrl}/api/account/status?userId=<encoded>` with no `Authorization` header.
  - It returns `true` or `false` via `parseAccountStatus`.
  - It returns `null` for a non-200 response, a bad body, or a rejected `fetch`.
- [X] T084 [P] [US4] Extend `packages/mobile/src/lib/gameSync.test.ts` for `deviceGameOwner()`: it returns the sync record's `userId`, or `null` when the record is missing or unreadable.
- [X] T085 [P] [US4] Extend `packages/mobile/src/lib/session.test.tsx`:
  - The provider subscribes to `onAccountDeleted`, and runs `handleAccountGone("deleted-elsewhere")` when it fires.
  - When signed out with `deviceGameOwner()` set, it calls `checkAccountExists` once per launch per owner:
    - `false` calls `handleAccountGone("deleted-elsewhere")`;
    - `true` does nothing;
    - `null` is retried on the next `AppState` `"active"` while still signed out.
  - While signed in, it never checks.

### Implementation for User Story 4

- [X] T086 [P] [US4] Implement `parseAccountStatus` in `packages/app/src/account/status.ts` as a type guard without Zod, and export it from `packages/app/src/index.ts`.
- [X] T087 [P] [US4] Implement `onAccountGone` in `packages/app/src/games/writeThrough.ts`, per research R10 and the T069 tests: on a `401`, read the code with `readApiErrorCode`. For `account_deleted`, call `dispose()` and then `onAccountGone()` once, and return without scheduling a retry.
- [X] T088 [P] [US4] Implement `accountExists(userId): Promise<boolean | null>` in `packages/web/src/lib/account/account-status.ts` (`import "server-only"`), using `createAdminClient().auth.admin.getUserById`.
- [X] T089 [US4] Implement `GET` in `packages/web/src/app/api/account/status/route.ts`, per contracts/account-status-api.md (depends on T086, T088):
  - Validate `userId` with `AccountStatusQuerySchema`; invalid gives `400 invalid_query_params` "userId must be a UUID."
  - Call `accountExists`, then answer `200 { exists }`, or `500 internal_error`.
  - Always send `Cache-Control: no-store`.
  - Log structured entry and exit lines with `handler: "account-status"`, a request ID and the outcome, but no `user_id`.
  - Run T071 until it's green.
- [X] T090 [P] [US4] Implement the deleted-account branch in `packages/web/src/middleware.ts`. The file moved here from the package root, where Next.js never loaded it (research R7, "Found during implementation"):
  - Export the pure `deletedAccountRedirect(pathname)`.
  - In `middleware`, when `getUser()` fails with `code === "user_not_found"` and `deletedAccountRedirect` returns a target: run `await supabase.auth.signOut({ scope: "local" })`, then 307-redirect to the target, copying the cookies from `response` as the existing redirect path does.
  - Leave `/api/` requests unchanged.
  - Update the file's doc comment to cite contracts/account-gone-signals.md §2.
- [X] T091 [P] [US4] Add `rememberAccount(userId)` and `readRememberedAccount()` to `packages/web/src/lib/persistence.ts`. The read uses a type guard; a malformed value is removed and returns `null`.
- [X] T092 [US4] Add `fetchAccountExists(userId)` to `packages/web/src/lib/account/device-account.ts`, per T074 (depends on T086, T091).
- [X] T093 [US4] Extend `packages/web/src/components/account/AccountWatcher.tsx` (created in T042) with its US4 job, per T075 (depends on T092):
  - Use `createBrowserClient()`.
  - Whenever `getSession()` or `onAuthStateChange` reports a session, call `rememberAccount`.
  - On `SIGNED_OUT`, run the status check unless an own deletion is in progress.
- [X] T094 [US4] Implement `packages/web/src/components/account/AccountCheck.tsx` (`"use client"`, renders `null`, no store or Supabase imports), per T076 (depends on T092).
- [X] T095 [US4] Render `<AccountCheck />` in `packages/web/src/app/page.tsx` and `packages/web/src/app/login/page.tsx` (depends on T094).
- [X] T096 [US4] Pass `onAccountGone: () => handleAccountGone("deleted-elsewhere")` to the `WriteThroughController` in `packages/web/src/lib/games/writeThrough.ts` (depends on T087).
- [X] T097 [P] [US4] Call `forgetRememberedAccount()` before the sign-out request in `packages/web/src/components/auth/sign-out-button.tsx`.
- [X] T098 [P] [US4] Implement the listener registry `packages/mobile/src/lib/accountEvents.ts`: `onAccountDeleted` and `reportAccountDeleted`, with no imports.
- [X] T099 [US4] In `packages/mobile/src/lib/api.ts`, on a `401`, read `readApiErrorCode(response)`. For `account_deleted`, call `reportAccountDeleted()` and return the response without refreshing (depends on T098).
- [X] T100 [P] [US4] Add `checkAccountExists(userId)` to `packages/mobile/src/lib/account.ts`, per T083.
- [X] T101 [P] [US4] Export `deviceGameOwner()` from `packages/mobile/src/lib/gameSync.ts`; it reads the sync record's `userId` with `readStoredSync()`.
- [X] T102 [US4] Update `SessionProvider` in `packages/mobile/src/lib/session.tsx`, per T085 (depends on T098–T101):
  - Subscribe to `onAccountDeleted`.
  - When signed out, check `deviceGameOwner()` with `checkAccountExists` once per launch per owner. After a `null`, retry on `AppState` `"active"`.
  - Then run `npm run typecheck && npm test` in `packages/mobile`.

**Checkpoint**: Spec US4 scenarios 1–3 hold for live and expired sign-ins, on web and iOS. All four stories work.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, security and size checks, full gates, manual checks, and the PR write-up.

- [X] T103 [P] Update the App Store blockers in `packages/mobile/README.md`:
  - In-app account deletion is done (feature 018).
  - Note that the privacy policy must mention that failed-attempt records keep the email address after deletion (Clarification Q1).
- [X] T104 [P] Do a security sweep of `packages/web/src` and `packages/mobile/src` before review:
  - Grep the new code for any log of an email address or password.
  - Confirm `SUPABASE_SERVICE_ROLE_KEY` is referenced only in `packages/web/src/lib/supabase/admin.ts`.
  - Confirm `createAdminClient` is imported only by `packages/web/src/lib/auth/attempt-throttle.ts`, `packages/web/src/lib/account/delete-account.ts` and `packages/web/src/lib/account/account-status.ts`.
  - Confirm no notice shows the email address (FR-018).
- [X] T105 Run every quality gate against local Supabase, as in `specs/018-account-deletion/quickstart.md` §2:
  - `npm test && npm run typecheck` in `packages/app`.
  - `npm run test:all` in `packages/web` (typecheck, lint, coverage, E2E), with coverage no lower than on `main`.
  - `npm run typecheck && npm run lint && npm test` in `packages/mobile`.
- [X] T106 Run `npm run build && npm run size` in `packages/web` and confirm `packages/web/.size-limit.json` still passes (`/account` ≤ 20 KB, `/login` ≤ 30 KB). If a limit is exceeded, find the import that pulled Zod, the store or Supabase into a public chunk.
- [ ] T107 Walk through `specs/018-account-deletion/quickstart.md` and record the results in the PR:
  - §3, web: delete; keyboard only, with a screen reader; narrow screen; two tabs; two browsers; expired session.
  - §4, iOS: the Account screen; delete; VoiceOver; an iPhone in landscape with the keyboard up; deleted elsewhere; expired.
- [X] T108 Draft the PR description from `specs/018-account-deletion/plan.md`, with the sections the constitution requires:
  - the service-role justification and the public status endpoint (plan.md Complexity Tracking);
  - no migration, because there's no schema change;
  - the integration suites that were run;
  - the deploy order: the web app before any iOS build that calls `/api/account/*`.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: needs Setup. Blocks every story.
- **US1 (Phase 3)** and **US2 (Phase 4)**: each needs only Foundational. They touch different packages (web vs. mobile), so they can run at the same time.
- **US3 (Phase 5)**: extends the US1 dialog and the US2 sheet. Its web half needs US1 and its iOS half needs US2.
- **US4 (Phase 6)**: its web half reuses US1's `account-gone.ts`, `device-account.ts`, persistence key and `AccountNotice`, and extends US1's `AccountWatcher`. Its iOS half reuses US2's `accountGone.ts`, `account.ts` and `forgetDeviceGame`.
- **Polish (Phase 7)**: after the stories you're shipping.

### Story graph

```text
Setup ─▶ Foundational ─┬─▶ US1 (web) ─┬─▶ US3 web half ──┐
                       │              └─▶ US4 web half ──┤
                       └─▶ US2 (iOS) ─┬─▶ US3 iOS half ──┼─▶ Polish
                                      └─▶ US4 iOS half ──┘
```

### Within each story

- Tests first, and seen failing (Principle I).
- Within the shared package: schemas and parsers before the modules that use them.
- Server modules before routes; client modules before components; components before the pages that mount them.
- Finish a story's checkpoint before moving to the next priority, unless the work is split between web and iOS.

### Parallel opportunities

- Phase 2: all ten test tasks (T003–T012) at once, then T013–T015 and T018–T020 at once.
- US1 tests T022–T032 at once. T036 runs alongside T033–T035, and T041 and T042 alongside T037–T040.
- US2 tests T045–T052 at once. T056 runs alongside T053–T055.
- US3: T063–T065 at once. T067 (iOS) alongside T066 (web).
- US4: all eighteen test tasks (T068–T085) at once. Then the shared package (T086, T087), web server (T088, T090, T091, T097) and mobile (T098, T100, T101) tasks run in parallel.
- After Phase 2, one person can take US1 (web) while another takes US2 (iOS).

---

## Parallel Example: Foundation

```bash
# All foundation tests together (different files):
Task: "T003 validation/account.test.ts"          Task: "T008 lib/account/delete-account.test.ts"
Task: "T004 api/errors.test.ts"                  Task: "T009 integration/account/delete.test.ts"
Task: "T005 account/notices.test.ts"             Task: "T010 integration/account/delete-cookie.test.ts"
Task: "T006 account/deleteAccount.test.ts"       Task: "T011 integration/account/delete-failure.test.ts"
Task: "T007 lib/api/handler.test.ts"             Task: "T012 integration/games/deleted-account.test.ts"
```

## Parallel Example: User Story 1

```bash
# Tests together:
Task: "T022 persistence.test.ts"      Task: "T026 useAccountDeletion.test.ts"      Task: "T030 AccountWatcher.test.tsx"
Task: "T023 device-account.test.ts"   Task: "T027 DeleteAccountSection.test.tsx"   Task: "T031 page.test.tsx"
Task: "T024 account-gone.test.ts"     Task: "T028 DeleteAccountDialog.test.tsx"    Task: "T032 e2e US1 block"
Task: "T025 delete-account-request.test.ts"   Task: "T029 AccountNotice.test.tsx"
# Then implementation: T033 → T034 → T035, with T036 alongside; T037 → T038 → T039 → T040;
# T041 after T034; T042 → T043 after T035; T044 last
```

## Parallel Example: User Story 2

```bash
# Tests together:
Task: "T045 gameSync.test.ts"     Task: "T048 DeleteAccountSheet.test.tsx"   Task: "T051 sign-in-screen.test.tsx"
Task: "T046 accountGone.test.ts"  Task: "T049 account-screen.test.tsx"       Task: "T052 session.test.tsx"
Task: "T047 account.test.ts"      Task: "T050 home-screen.test.tsx"
# Then: T053 → T054 → T055, with T056 alongside; T057 → T058 → T059 → T060; T061 and T062 after T054
```

## Parallel Example: User Story 4

```bash
# Shared, web and mobile tests together (T068–T085), then:
Task: "T086 account/status.ts"        Task: "T088 account-status.ts (server)"   Task: "T098 accountEvents.ts"
Task: "T087 writeThrough.ts (shared)" Task: "T090 middleware.ts"                Task: "T100 checkAccountExists"
                                      Task: "T091 persistence.ts"               Task: "T101 deviceGameOwner"
                                      Task: "T097 sign-out-button.tsx"
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1: Setup.
2. Phase 2: Foundational. This blocks everything, and it delivers the complete, contract-tested endpoint.
3. Phase 3: US1.
4. **Stop and validate**: run quickstart.md §3 step 1 and the US1 E2E block.
5. Deploy the web app. Real users can now delete their accounts.

### Incremental delivery

1. Setup + Foundational: the endpoint is ready.
2. US1: web deletion. Deploy (MVP).
3. US2: iOS deletion. Ship it in the first App Store build, after the web deploy.
4. US3: protections complete on both platforms.
5. US4: other devices sign out cleanly. Deploy the web app, and ship the next iOS build.

### Splitting the work

With two people, after Phase 2 one takes the web path (US1, then the US3 and US4 web halves) and the other the iOS path (US2, then the US3 and US4 iOS halves). Polish is done together.

---

## Notes

- [P] tasks touch different files and don't depend on unfinished tasks in their phase.
- The [USn] labels trace each task to its spec story. Foundation tasks have no label, because both platforms need them.
- Verify every test fails before implementing it, and keep the suites green at each checkpoint.
- Stop at any checkpoint to validate a story on its own.
- Avoid same-file conflicts: tasks that extend one file in the same phase are sequential (none are marked [P] together).
