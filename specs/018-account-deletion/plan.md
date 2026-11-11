# Implementation Plan: Account Deletion

**Branch**: `018-account-deletion` | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/018-account-deletion/spec.md`

## Summary

People can permanently delete their theStats account from the web account page or from a new Account screen in the iOS app. Deleting:
- requires the current password;
- removes the account, its profile and every saved game in one step;
- signs the user out;
- shows the start screen with "Your account has been deleted." That's the landing page on the web and the sign-in screen on iOS.

Other devices signed in to the account lose access the next time they contact theStats. They throw away their copy of the game and show "You were signed out because this account was deleted."

**Approach** (see [research.md](./research.md)):
- **One endpoint**: `POST /api/account/delete` serves both clients through the existing `withAuthenticatedHandler` (cookie or bearer). It throttles with the sign-in counters, checks the password on a stateless client, then deletes the Auth user with the admin API. Existing `on delete cascade` foreign keys remove `profiles`, `games` and `game_writes` in the same transaction, so there's no migration. `auth_attempts` is left alone (FR-017).
- **Other devices with a live token**: Supabase reports `user_not_found` for a token whose user is gone. The API turns that into `401 account_deleted`, and middleware turns it into a redirect to `/?account=deleted-elsewhere`.
- **Other devices with an expired token**: devices remember the account they were signed in to. Once signed out, they ask `GET /api/account/status`.
- **Shared code** in `@thestats/app`: the schemas, the notice copy, and a write-through option that stops saving once the account is gone.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict; no escape hatches per Principle II) in `packages/web`, `packages/app` and `packages/mobile`

**Primary Dependencies**: Next.js 15.5 (App Router, Route Handlers, middleware), React 19, `@supabase/ssr` 0.10, `@supabase/supabase-js` 2.117 (Auth admin API), Zod 3.25, Zustand 5, Tailwind CSS 3.4; iOS: Expo SDK 58 (React Native 0.88, expo-router 58), NativeWind 4. **No new dependencies.**

**Storage**: Supabase Postgres + Auth with no schema change (deleting the `auth.users` row cascades to `public.profiles`, `public.games` and `public.game_writes`; `public.auth_attempts` is untouched); device storage is web `localStorage` (plus new `thestats.account.v1`) and the iOS expo-sqlite key-value store.

**Testing**:
- Vitest + Testing Library: `packages/app`, and web unit and component tests.
- Vitest route-handler integration tests against local Supabase: `packages/web/tests/integration/account/`.
- Playwright E2E: `packages/web/tests/e2e/account-deletion.spec.ts`.
- Jest 30 + jest-expo + RNTL 14: `packages/mobile`.
- Manual VoiceOver and iPhone-landscape checks, listed in [quickstart.md](./quickstart.md).

**Target Platform**: Web app on Vercel (modern browsers, 360 px and up); iOS/iPadOS app on Expo SDK 58, landscape-only

**Project Type**: Web app + API (Next.js) and a native iOS app in one npm-workspaces monorepo

**Performance Goals**: The delete request completes in under 5 s for an account with hundreds of games: it's one cascading delete, and SC-001 allows 1 minute end to end. Tapping Delete shows the pending state within 100 ms (Principle IV).

**Constraints**:
- Deletion is all-or-nothing (FR-006).
- The service-role key stays server-only.
- Passwords and email addresses are never logged.
- Failed-attempt records are kept (FR-017).
- Notices never show account data (FR-018).
- The iOS confirmation stays usable in landscape with the keyboard up (FR-015).

**Scale/Scope**:
- Server: 2 new routes, 1 change to the authenticated-handler wrapper, 1 new middleware branch.
- Web: 5 new components and 4 client modules (one of them a hook).
- iOS: 1 new screen, 1 sheet and 2 modules.
- Shared: 3 schemas, the notice copy, and 1 controller option.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle or standard | Status | How the plan meets it |
|---|---|---|
| I. Test-Driven Development | PASS | Each change starts from a failing test: integration tests for both routes and for `account_deleted` on the games API, unit tests for the handler, middleware and controller, component tests on both platforms, and an E2E spec. All are listed under Project Structure. |
| II. Strict type safety | PASS | The server validates requests with Zod (`DeleteAccountBodySchema`, `AccountStatusQuerySchema`). Clients parse replies, and the stored `thestats.account.v1` value, with type-guard parsers (`parseApiError`, `parseAccountStatus`), which keep Zod out of the size-limited client chunks (`.size-limit.json`: `/account` ≤ 20 KB, `/login` ≤ 30 KB). No `any`, `!` or unchecked `as`. |
| III. Component-driven architecture | PASS | Web: `DeleteAccountSection` and `DeleteAccountDialog` only render. The `useAccountDeletion` hook owns the request, the pending state and the double-submit guard ("use hooks to isolate concerns"). `AccountNotice`, `AccountWatcher` and `AccountCheck` carry behavior. Each has its own test. The mutation goes through a Route Handler called from a small client module, never from markup. |
| IV. Performant and responsive UX | PASS | Built on the existing `Modal` (web) and `Sheet` (iOS). Works from 360 px with no hover-only affordances. The pending state shows within 100 ms. No new dependencies, so route bundles grow by a few KB at most. |
| V. Engineering discipline | PASS | Reuses `withAuthenticatedHandler`, the throttle module, the stateless and admin clients, and the existing UI primitives. No tombstone or idempotency tables (YAGNI). Secrets stay server-side. |
| VI. Authentication at the boundary | PASS | The delete route uses `withAuthenticatedHandler`, and the account comes only from the verified session. The status route is public by design (Complexity Tracking). |
| VI. Server-only secrets | PASS (justified) | The service-role client is used only in two server-only modules: the admin delete and the existence lookup (Complexity Tracking). |
| VI. Row Level Security | PASS | No new tables. Cascades run through existing foreign keys, and the RLS policies on `profiles` and `games` don't change. |
| VI. Input validation | PASS | Zod at the top of both handlers, with `400` in the shared envelope. |
| VI. Generated DB types | PASS | No new tables or RPCs, so `database.types.ts` is unchanged. Admin calls use supabase-js's typed Auth API. |
| VI. HTTP semantics and error shape | PASS | `POST` for the mutation (the body carries the password) and `GET` for the pure status read. Statuses are `204/400/401/403/429/500`. One envelope, and messages carry no internals. |
| VI. Atomicity and idempotency | PASS | One `auth.users` delete with cascades in one transaction. Repeats converge on "already deleted" (research R4). |
| VI. Migrations as code | PASS | No schema change, so no migration. |
| VI. Observability | PASS | Entry and exit logs with request ID, handler, user ID and outcome. Never the password or the email address. |
| Accessibility | PASS | Keyboard handling from the native `<dialog>`, labelled fields, and `role="status"` / `role="alert"` announcements. iOS gets VoiceOver labels and announcements. |
| Testing standard and backend PR gate | PASS | (a) No schema change, so no migration file. (b) No table's RLS changes. (c) Route integration tests run on local Supabase. |

**Gate (before research)**: PASS, with the three justified items in Complexity Tracking.
**Re-check (after design)**: PASS. The contracts, data model and quickstart add nothing beyond those three items.

## Project Structure

### Documentation (this feature)

```text
specs/018-account-deletion/
├── plan.md                         # This file
├── research.md                     # Phase 0: decisions R1–R14
├── data-model.md                   # Phase 1: cascade map, device keys, transitions
├── quickstart.md                   # Phase 1: local run + manual checks
├── contracts/
│   ├── delete-account-api.md       # POST /api/account/delete
│   ├── account-status-api.md       # GET /api/account/status
│   ├── account-gone-signals.md     # 401 account_deleted, middleware, ?account=, notices
│   └── confirmation-ui.md          # Delete account UI on web and iOS
├── checklists/requirements.md      # From /speckit.specify
└── tasks.md                        # Phase 2 (/speckit.tasks, not created here)
```

### Source Code (repository root)

```text
packages/app/src/                            # shared by web and iOS
├── account/notices.ts (+ .test.ts)          NEW  AccountNoticeKind, ACCOUNT_NOTICE_TEXT, parseAccountNoticeKind
├── account/deleteAccount.ts (+ .test.ts)    NEW  DELETE_ACCOUNT_COPY, DeleteAccountOutcome,
│                                                 toDeleteAccountOutcome(status, body), deleteAccountErrorText():
│                                                 the confirmation-ui.md wording and reply mapping both clients share
├── account/status.ts (+ .test.ts)           NEW  parseAccountStatus(body): type guard, no Zod
├── api/errors.ts (+ .test.ts)               NEW  parseApiError(body), readApiErrorCode(response): type guards
├── validation/account.ts (+ .test.ts)       NEW  DeleteAccountBodySchema, AccountStatusQuerySchema (Zod, server side)
├── games/writeThrough.ts (+ .test.ts)       MOD  onAccountGone; 401 account_deleted is final (no retry)
└── index.ts                                 MOD  exports

packages/web/
├── src/middleware.ts (+ .test.ts)           MOVED from the package root, where Next.js never loaded
│                                                 it (feature 011's routing was dormant); then MOD:
│                                                 page requests: user_not_found → clear cookies,
│                                                 307 /?account=deleted-elsewhere
├── src/app/
│   ├── api/account/delete/route.ts          NEW  POST: auth → validate → throttle → password → admin delete
│   ├── api/account/status/route.ts          NEW  GET (public): { exists }
│   ├── (authenticated)/account/page.tsx     MOD  renders DeleteAccountSection last
│   ├── (authenticated)/layout.tsx           MOD  mounts AccountWatcher
│   ├── page.tsx (+ page.test.tsx)           MOD  reads ?account=, renders AccountNotice and AccountCheck
│   └── login/page.tsx (+ page.test.tsx)     MOD  mounts AccountCheck
├── src/lib/
│   ├── api/handler.ts (+ .test.ts)          MOD  user_not_found → 401 account_deleted (+ cookie clear);
│   │                                             codes current_password_incorrect / rate_limited;
│   │                                             retry-after support; per-route log component
│   ├── account/delete-account.ts (+ test)   NEW  server-only: throttle, stateless password check,
│   │                                             admin delete, revoke check session on failure
│   ├── account/account-status.ts (+ test)   NEW  server-only: admin getUserById → exists
│   ├── account/device-account.ts (+ test)   NEW  client, no store import (safe on public pages):
│   │                                             remembered account, clearDeviceGameData,
│   │                                             deletion-in-flight flag
│   ├── account/account-gone.ts (+ test)     NEW  client, signed-in pages: handleAccountGone(kind) =
│   │                                             reset store → clearDeviceGameData → full navigation
│   ├── account/delete-account-request.ts (+ test)  NEW  client: POST + outcome mapping
│   ├── account/useAccountDeletion.ts (+ test)      NEW  client hook: request, pending and failure state,
│   │                                                    double-submit guard, own-deletion flag
│   ├── games/writeThrough.ts                MOD  wires onAccountGone
│   └── supabase/admin.ts                    MOD  doc comment lists the new justified uses
├── src/components/
│   ├── account/DeleteAccountSection.tsx (+ test)  NEW  danger panel + button
│   ├── account/DeleteAccountDialog.tsx (+ test)   NEW  Modal, password form, states
│   ├── account/AccountNotice.tsx (+ test)         NEW  role="status" notice; clears device data
│   ├── account/AccountWatcher.tsx (+ test)        NEW  signed-in layout: follows other tabs' broadcasts
│   │                                                   (US1); remembers the account and checks status
│   │                                                   on an unexpected SIGNED_OUT (US4)
│   ├── account/AccountCheck.tsx (+ test)          NEW  `/` and `/login`: status check for a remembered account
│   └── auth/sign-out-button.tsx (+ test)          MOD  forgets the remembered account first
└── tests/
    ├── integration/account/delete.test.ts         NEW  contract tests 1–9
    ├── integration/account/status.test.ts         NEW  contract tests 1–5
    ├── integration/games/deleted-account.test.ts  NEW  401 account_deleted over bearer + cookie
    └── e2e/account-deletion.spec.ts               NEW  delete, wrong password, keyboard, two contexts

packages/mobile/
├── src/app/
│   ├── account.tsx                          NEW  Account screen: email, danger section, sheet
│   ├── _layout.tsx                          MOD  registers "account" in the signed-in stack
│   ├── index.tsx                            MOD  "Account" button beside "Sign out"
│   └── sign-in.tsx                          MOD  shows the account notice (alert + announcement)
├── src/components/
│   ├── account/DeleteAccountSheet.tsx (+ test)    NEW  explanation, password, actions in scroll content
│   └── ui/Sheet.tsx                         MOD  ScrollView automaticallyAdjustKeyboardInsets
├── src/lib/
│   ├── account.ts (+ test)                  NEW  deleteAccount(password), checkAccountExists(userId)
│   ├── accountGone.ts (+ test)              NEW  handleAccountGone(kind), notice store + hook
│   ├── accountEvents.ts (+ test)            NEW  listener registry, so api.ts needn't import accountGone
│   │                                             (avoids an api → accountGone → gameSync → api cycle)
│   ├── api.ts (+ test)                      MOD  401 account_deleted → report the event, no refresh-and-retry
│   ├── gameSync.ts (+ test)                 MOD  forgetDeviceGame(): dispose sync, reset store,
│   │                                             clear game, clock and sync keys
│   └── session.tsx (+ test)                 MOD  signed out + remembered user → status check
├── src/__tests__/account-screen.test.tsx    NEW
├── src/__tests__/root-layout.test.tsx       NEW  "account" is registered only in the signed-in group
├── src/__tests__/home-screen.test.tsx       MOD  Account button
├── src/__tests__/sign-in-screen.test.tsx    MOD  notice
└── README.md                                MOD  drop account deletion from the App Store blockers
```

**Structure decision**: This follows the monorepo as it stands:
- Server code goes in `packages/web` server-only paths (`src/lib/account/*` marked `import "server-only"`; routes under `src/app/api/account/`).
- Code both clients need goes in `@thestats/app`, next to the existing `validation/games.ts` and `validation/profile.ts`.
- Each platform's UI and device handling stays in its own package.
- Web unit tests sit next to their modules; route integration tests go in `tests/integration/`. iOS screen tests go in `src/__tests__/`, and lib tests sit next to their modules.

### Delivery order (maps to the spec's user stories)

1. **Foundation**, needed by every story:
   - shared schemas, error reader and notice copy;
   - the server-only delete module;
   - `withAuthenticatedHandler`'s `account_deleted` classification;
   - the delete route, with its integration tests.
2. **US1 (P1), web delete**:
   - `DeleteAccountSection` and `DeleteAccountDialog` on `/account`, driven by the `useAccountDeletion` hook;
   - `delete-account-request`;
   - `handleAccountGone("deleted")`, which also tells other tabs;
   - `AccountWatcher`, listening for other tabs, mounted in the signed-in layout;
   - the landing page `AccountNotice`;
   - E2E for the happy path, a second tab, sign-in failing afterwards, and re-sign-up.
3. **US2 (P2), iOS delete**:
   - Account screen and Home button;
   - `DeleteAccountSheet` and the `Sheet` keyboard insets;
   - `deleteAccount`;
   - iOS `handleAccountGone`, and the sign-in notice.
4. **US3 (P3), protections**, on both platforms:
   - cancel, wrong-password, rate-limited, failed and offline states;
   - one request per confirmation;
   - keyboard-only and screen reader checks.
5. **US4 (P4), other devices**:
   - the status module and route, with their integration tests;
   - the middleware branch;
   - the write-through `onAccountGone`;
   - `AccountWatcher`'s remembered account and status check, and `AccountCheck`;
   - iOS `apiFetch` detection (through `accountEvents`) and the `SessionProvider` status check;
   - two-context E2E.

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
|---|---|---|
| **The service-role client is used in user-facing routes**: `auth.admin.deleteUser` in `POST /api/account/delete` and `auth.admin.getUserById` in `GET /api/account/status` (Principle VI, server-only secrets and RLS bypass) | Supabase only lets the admin API delete an Auth user. Both calls are confined to two `import "server-only"` modules. The delete always targets the verified caller's own ID after a throttled password check, and neither call reads or writes app tables directly. This is the same pattern as the existing throttle (`attempt-throttle.ts`). | A `SECURITY DEFINER` RPC that `authenticated` can execute would let anyone holding a session token delete the account without the password, straight through PostgREST (it breaks FR-003, FR-004 and the "device left signed in" case). A JWT-freshness (`amr`) check inside the RPC depends on token-claim details and adds a second client, and it still leaves a window (research R1). |
| **A public endpoint reveals whether an account exists**: `GET /api/account/status` (Principle VI, authentication at the boundary; feature 005's no-enumeration stance) | A device whose token expired has no credential left. On the web, the middleware's failed refresh clears the cookie before any script runs, but FR-009 and SC-004 still require that device to find out, clear its data and show the notice. The endpoint takes a random UUIDv4, never an email, and returns one boolean. | Decoding the expired JWT on the server fails because the web no longer has it, and verifying it needs the JWT secret. A `deleted_accounts` tombstone table is a new table, RLS policy and retention question for the same answer. Showing no notice once the token expires breaks FR-009 and SC-004 for the most common case (research R6). |
| **Request schemas and reply parsers live in `@thestats/app`**, not under `packages/web` server-only paths (Technology & Quality Standards, Backend) | The iOS app builds the delete request and parses both replies with the same code as the web. `@thestats/app` already holds the API schemas both clients share (`validation/games.ts`, `validation/profile.ts`), so this follows the structure set when the iOS app was added. | Copying the schemas into web and mobile would let them drift apart. Putting them in `packages/core` would mix API request shapes into the pure domain package. |
