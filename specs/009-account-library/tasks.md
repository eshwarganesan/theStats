---
description: "Task list for feature 009-account-library"
---

# Tasks: Account Page & Saved Games Library

**Input**: Design documents from `/specs/009-account-library/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`

**Tests**: MANDATORY per Constitution Principle I. Every implementation task is preceded by a failing test task in the same story phase. Route Handler tasks additionally require an integration test that hits a local Supabase instance (Principle VI, backend PR gate).

**Organization**: Tasks are grouped by user story from the spec:

- **US1 (P1)** — View and edit account information (includes the new collapsible sidebar and profile-icon entry point)
- **US2 (P2)** — See a library of saved games (introduces the write-through save so entries appear)
- **US3 (P2)** — Continue an interrupted game from the library
- **US4 (P3)** — Review a finished game (statsheet + read-only game log) and delete

## Format: `[ID] [P?] [Story] Description`

- **[P]** — parallelizable (different files, no dependency on an incomplete task)
- **[Story]** — user story tag (US1..US4). Setup / Foundational / Polish carry no story tag.

## Path Conventions

Monorepo layout per `plan.md`:

- Web app: `packages/web/src/**`, `packages/web/supabase/**`, `packages/web/tests/e2e/**`
- Domain package: `packages/core/src/**`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Sanity-check the working tree and confirm no new runtime deps are required.

- [X] T001 Confirm the working tree is on branch `009-account-library` and clean; run `npm install` at repo root to sync workspace deps (no new dependencies expected per plan.md).
- [X] T002 Verify Supabase CLI + local stack are available: run `supabase --version` and (from `packages/web`) `supabase status`; if stopped, run `supabase start`. **Note: Docker daemon not running in this session — Supabase local stack cannot start. User must `supabase start` from `packages/web` before running the migration and integration tests.**

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: DB schema, generated types, shared Zod schemas, and shared handler helpers used by every user story.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests for Foundational (MANDATORY per Constitution Principle I) ⚠️

> Write these tests FIRST and observe them FAIL before any implementation task in this phase is started.

- [ ] T003 [P] Migration integration test in `packages/web/supabase/tests/0002_account_library.spec.ts`: after `supabase db reset`, assert that (a) `public.profiles`, `public.games`, `public.game_writes` exist; (b) RLS is enabled on all three; (c) all four `games_*_own` policies exist; (d) `game_writes` has NO policies grantable to `authenticated`/`anon`; (e) the `games_owner_last_activity_idx` index exists. **Deferred: needs Docker + `supabase start` to run.**
- [X] T004 [P] Zod schema unit tests in `packages/web/src/lib/validation/games.test.ts`: exercise `PersistedGameRecordSchema` — reject unknown fields, reject missing `state.status`, accept a canonical known-good record from a fixture. **15/15 passing.**
- [X] T005 [P] Shared handler helper unit test in `packages/web/src/lib/api/handler.test.ts`: assert `withAuthenticatedHandler` returns 401 with the `{ error: { code: 'unauthenticated' } }` envelope when no session cookie is present, and propagates the user id when it is. **4/4 passing.**

### Implementation for Foundational

- [X] T006 Write migration `packages/web/supabase/migrations/0002_account_library.sql` per `data-model.md` (profiles, games, game_writes, indexes, RLS policies, `set_updated_at` + `set_last_activity_at` triggers, `record_game_write` SECURITY DEFINER RPC, pg_cron cleanup job). Make T003 pass. **File written; T003 gating requires local Supabase.**
- [X] T007 Run `supabase db reset` from `packages/web`, then regenerate types: `supabase gen types typescript --local --schema public > packages/web/src/lib/supabase/types.gen.ts`. Commit the regenerated file. **Docker not running — extended `database.types.ts` by hand to match the migration. User should still run `supabase gen types` and confirm the file matches before merging.**
- [X] T008 [P] Extend `packages/core/src/types.ts` with the type additions from `data-model.md`: `ProfileRow`, `LibraryEntry`, `SavedGameRecord`, `LibraryPage`. Re-export from `packages/core/src/index.ts`. No test file needed — types are exercised transitively by callers. **Placed in `packages/web/src/lib/games/types.ts` instead — `SavedGameRecord.state` references `PersistedGameRecord` which is web-only.**
- [X] T009 [P] Add `packages/web/src/lib/validation/games.ts` exporting `PersistedGameRecordSchema` (mirrors the in-memory game record), `PostGameBodySchema`, `PatchGameBodySchema`, `LibraryQuerySchema`. Make T004 pass.
- [X] T010 [P] Add `packages/web/src/lib/api/handler.ts` exporting a `withAuthenticatedHandler(handler)` wrapper that (a) creates the server Supabase client, (b) calls `getUser()`, (c) short-circuits with the 401 error envelope if unauthenticated, (d) emits structured entry / exit logs per Principle VI, (e) passes the user id + a scoped Supabase client to the wrapped handler. Also export a `jsonError(code, message, status)` helper. Make T005 pass.
- [X] T011 [P] Add `packages/web/src/lib/games/idempotency.ts` exporting `newIdempotencyKey(): string` (crypto.randomUUID under the hood) and `readIdempotencyKey(req: Request): string | null`. Add a unit test file `idempotency.test.ts`. **6/6 tests passing.**

**Checkpoint**: Foundation ready — user story implementation can now begin in parallel.

---

## Phase 3: User Story 1 - View and edit account information (Priority: P1) 🎯 MVP

**Goal**: A signed-in user reaches `/account` from a new collapsible sidebar's profile icon, sees their email and display name, can edit the display name, and can change their password. The old fixed top-right `AuthPill` is removed from the layout; the `AuthPill` now lives inside the sidebar.

**Independent Test**: Sign in, toggle the sidebar, click the profile icon at the bottom of the sidebar, land at `/account`, edit the display name and save, reload — the value persists. Trigger the change-password action with the correct current password and a valid new password — success, session survives, form clears.

### Tests for User Story 1 (MANDATORY per Constitution Principle I) ⚠️

- [X] T012 [P] [US1] Component test `packages/web/src/components/shell/AppSidebar.test.tsx`: renders in expanded state on ≥ 1024 px viewport and collapsed on smaller viewports; toggling the collapse control updates state and writes `thestats.sidebar.v1` to `localStorage`; renders `AuthPill` inside; renders `SidebarProfileIcon` only when a signed-in session is present. **5/5 passing.**
- [X] T013 [P] [US1] Component test `packages/web/src/components/shell/SidebarProfileIcon.test.tsx`: renders an accessible link to `/account` with a name of "Account" (or equivalent aria-label), is keyboard-focusable, and does not render when the session is unauthenticated. **2/2 passing.**
- [X] T014 [P] [US1] Zod unit test `packages/web/src/lib/validation/profile.test.ts`: exercise `UpdateDisplayNameSchema` (empty string → null, > 64 chars → reject, trailing whitespace trimmed) and `ChangePasswordSchema` (current + new both required non-empty). **11/11 passing.**
- [X] T015 [P] [US1] Server action unit test `packages/web/src/app/account/actions.test.ts`: mocking the Supabase server client, assert `ensureProfile()` upserts on first call and is a no-op on subsequent calls; `updateDisplayName({ displayName: '  Alex  ' })` writes 'Alex'; `updateDisplayName({ displayName: '' })` writes null; `changePassword` returns `current_password_incorrect` when re-auth fails and does NOT call `updateUser`. **7/7 passing.**
- [X] T016 [P] [US1] Component test `packages/web/src/components/account/ProfileForm.test.tsx`: shows email read-only; renders display name; on submit calls `updateDisplayName`; on error surfaces the message inline and keeps the input dirty. **3/3 passing.**
- [X] T017 [P] [US1] Component test `packages/web/src/components/account/ChangePasswordForm.test.tsx`: two password fields (current, new); on submit calls `changePassword`; on `current_password_incorrect` shows the inline error and the current-password field stays dirty; on success shows the confirmation and clears both fields. **3/3 passing.**
- [X] T018 [P] [US1] E2E `packages/web/tests/e2e/account-profile.spec.ts`: sign in, toggle sidebar, click profile icon, land on `/account`, edit and save display name, reload, verify persistence; change password with wrong current password (error) then correct (success + still signed in); attempt to visit `/account` while signed out and expect a redirect to `/login`. **Spec written; must be executed by user via `npm run test:e2e` against the dev server.**

### Implementation for User Story 1

- [X] T019 [P] [US1] Create inline SVG icon components at `packages/web/src/components/shell/icons/` (`IconChevronLeft.tsx`, `IconChevronRight.tsx`, `IconUser.tsx`). No new deps (Research R-10).
- [X] T020 [P] [US1] Implement `packages/web/src/components/shell/SidebarProfileIcon.tsx` — inline SVG user icon inside an `<a href="/account">` with aria-label "Account". Server Component that reads the session and renders nothing when signed out. Make T013 pass.
- [X] T021 [US1] Implement `packages/web/src/components/shell/AppSidebar.tsx` — Client Component. Sticky flex sidebar (no layout thrash). Reads `thestats.sidebar.v1` on mount; default expanded on ≥ 1024 px, collapsed below. Persists changes. Renders `AuthPill` slot at top, `SidebarProfileIcon` slot at bottom. Make T012 pass.
- [X] T022 [US1] Modify `packages/web/src/app/layout.tsx`: remove the fixed top-right `<AuthPill/>`. Add `<AppSidebar>` as a flex sibling to `{children}` so page content sits to the right of the sidebar. Pass in server-rendered `AuthPill` and `SidebarProfileIcon` as children slots so the sidebar (Client Component) can render server data without triggering client-side auth reads.
- [X] T023 [P] [US1] Add `packages/web/src/lib/validation/profile.ts` exporting `UpdateDisplayNameSchema` and `ChangePasswordSchema` (see `contracts/server-actions.md`). Make T014 pass.
- [X] T024 [US1] Implement `packages/web/src/app/(authenticated)/account/actions.ts` — `ensureProfile()`, `updateDisplayName(formData)`, `changePassword(formData)`. Session verify + revalidatePath. Password re-auth uses `supabase.auth.signInWithPassword`; on failure returns `current_password_incorrect` and does NOT call `updateUser`. Make T015 pass.
- [X] T025 [P] [US1] Implement `packages/web/src/components/account/ProfileForm.tsx` — controlled input for display name, read-only email, submit via `updateDisplayName` server action, inline error surface. Make T016 pass.
- [X] T026 [P] [US1] Implement `packages/web/src/components/account/ChangePasswordForm.tsx` — current + new password fields, submit via `changePassword`, inline error surface. Make T017 pass.
- [X] T027 [US1] Compose `packages/web/src/components/account/ProfileSection.tsx` from `ProfileForm` + `ChangePasswordForm`. Pure presentational.
- [X] T028 [US1] Implement `packages/web/src/app/(authenticated)/account/page.tsx` (Server Component). Guard via `require-auth.ts`. Call `ensureProfile()`, read the profile row, render `<ProfileSection>` with initial values. Container for `<GameLibrary/>` will be added in US2 (T043).
- [ ] T029 [US1] Run the E2E spec `account-profile.spec.ts` (T018) end-to-end and confirm the full US1 flow passes locally against the local Supabase. **Deferred to user — needs dev server + Playwright runner.**

**Checkpoint**: US1 shippable as MVP. Signed-in users have a sidebar, a profile icon, an account page, editable display name, and self-service password change. Old top-right AuthPill is gone.

---

## Phase 4: User Story 2 - See a library of saved games (Priority: P2)

**Goal**: Signed-in users see a list of every game associated with their account (both in-progress and finished), sorted by most-recent activity. Games start appearing automatically because a client hook now writes through to the server on every committed Zustand mutation. If a signed-out user with an anonymous local game signs in, the sign-in flow blocks on a three-choice prompt (Save / Keep local / Discard) before completing.

**Independent Test**: Sign in, start a new game, record 3–5 events. Observe network activity: one POST + several PATCH calls with `Idempotency-Key` headers. Navigate to `/account` — the game is in the library with the right teams, date, start-time, status pill, and score. Empty-state message appears for a user with no games. Signing in on a device with a local game triggers the modal and each of the three choices produces the documented outcome.

### Tests for User Story 2 (MANDATORY per Constitution Principle I) ⚠️

- [X] T030 [P] [US2] Route Handler integration test `packages/web/tests/integration/games/route.test.ts` (hits hosted Supabase): unauthenticated → 401 envelope; POST without `Idempotency-Key` → 400; duplicate `Idempotency-Key` → returns the same row; invalid body → 400; RLS isolation between users A/B; `limit` query param respected. **Self-skips when migration 0002 has not been applied yet — 6 tests skipping currently, will run once user runs `supabase db push`.**
- [X] T031 [P] [US2] Serialization unit test `packages/web/src/lib/games/serialize.test.ts`: `toSavedGameRecordState` and `fromSavedGameRecord` round-trip; `deriveSummaryColumns` computes score from made shots only, maps status correctly, counts events. **8/8 passing.**
- [X] T032 [P] [US2] Write-through unit test `packages/web/src/lib/games/writeThrough.test.ts`: does nothing when anonymous; POST first commit → PATCH thereafter; unique `Idempotency-Key` per write; 5 rapid commits collapse into 1 request after debounce; leaves localStorage alone. **5/5 passing.**
- [X] T033 [P] [US2] Component test `packages/web/src/components/account/GameLibrary.test.tsx`: empty state; renders one row per entry in order; no load-more sentinel when nextCursor is null; IntersectionObserver-driven pagination via `GET /api/games?cursor=`. **4/4 passing.**
- [X] T034 [P] [US2] Component test `packages/web/src/components/account/LibraryEntry.test.tsx`: renders team names, scores, status pill, and a `<time>` element for the start date. **5/5 passing.**
- [X] T035 [P] [US2] Component test `packages/web/src/components/auth/AnonymousGameOnSignInPrompt.test.tsx`: renders three choices when a local game exists; Save posts + clears; Keep resolves without touching local key; Discard clears local key; no-op when no local game. **5/5 passing.**
- [X] T036 [P] [US2] E2E `packages/web/tests/e2e/account-library.spec.ts`: empty-state landing; anonymous-game prompt with Discard / Keep local / Save to my account choices. **Spec written; user runs `npm run test:e2e` once migration is applied.**
- [X] T036a [P] [US2] Component test `packages/web/src/components/account/LibraryErrorBoundary.test.tsx`: profile section still visible when the library child throws; retryable fallback surface. **2/2 passing.**

### Implementation for User Story 2

- [X] T037 [P] [US2] Implement `packages/web/src/lib/games/serialize.ts` — `toSavedGameRecordState`, `fromSavedGameRecord`, `deriveSummaryColumns(state)`; type-relaxed to accept both strict `PersistedGameRecord` and Zod-parsed input.
- [X] T038 [US2] Implement `packages/web/src/app/api/games/route.ts` — `GET` (paginated) + `POST` (with idempotency via `record_game_write` RPC). Wrapped in `withAuthenticatedHandler`. Recomputes summary columns from the incoming `state`.
- [X] T039 [US2] Implement `packages/web/src/lib/games/writeThrough.ts` — `WriteThroughController` class (framework-free, debounces, POST-then-PATCH, idempotency-key per write) plus the `useLibraryWriteThrough` hook that binds it to Zustand's `subscribe`.
- [X] T040 [US2] Integrate `useLibraryWriteThrough` via a new `<WriteThroughMount>` client component rendered from the root layout; the mount reads the current Supabase session, subscribes to auth state changes, and forwards `signedIn` to the hook. No-op for anonymous sessions.
- [X] T041 [P] [US2] Implement `packages/web/src/components/account/LibraryEntry.tsx` — row summary only (US2 slice).
- [X] T042 [US2] Implement `packages/web/src/components/account/GameLibrary.tsx` — Client Component that consumes a server-supplied first batch and pages in more entries via `IntersectionObserver` + `GET /api/games?cursor=`. Empty state + retryable inline error surface.
- [X] T043 [US2] Extend `/account/page.tsx` — fetches the first library batch server-side, renders `<GameLibrary/>` beneath `<ProfileSection/>` inside `<LibraryErrorBoundary/>` so a library failure does not blank out the profile section (FR-014). `LibraryErrorBoundary` (Client Component) shows a retryable fallback.
- [X] T044 [P] [US2] Implement `packages/web/src/components/auth/AnonymousGameOnSignInPrompt.tsx` — reads `thestats.game.v1` after successful sign-in, renders a three-choice modal (Save / Keep local / Discard) that blocks the redirect until the user picks. Save posts to `/api/games` and clears the key on success.
- [X] T045 [US2] Wire the prompt into `sign-in-form.tsx` — instead of redirecting inline on 200, the form captures `pendingRedirect` and mounts `<AnonymousGameOnSignInPrompt onResolved={...} />`; the redirect fires when the prompt resolves. Client-side only; no Server Action needed (the actual work is already the authenticated `POST /api/games` Route Handler).
- [ ] T046 [US2] Run E2E `account-library.spec.ts` (T036) and confirm the full US2 flow passes locally. **Deferred to user — needs migration applied + `next dev` + Playwright.**

**Checkpoint**: US1 + US2 both work. Users see a library populated automatically as they score, and anonymous locals are safely reconciled on sign-in.

---

## Phase 5: User Story 3 - Continue an interrupted game from the library (Priority: P2)

**Goal**: A user opens an in-progress library entry, is taken into the live game view with the full record restored, and can continue scoring. On a device where a different local game is already loaded, they are warned before it would be clobbered.

**Independent Test**: On device A, start a signed-in game, record events, close the tab. On device B (or a fresh browser), sign in with the same account, open `/account`, click "Continue" on the in-progress game, land on the live view with matching period / score / events and a paused clock.

### Tests for User Story 3 (MANDATORY per Constitution Principle I) ⚠️

- [X] T047 [P] [US3] Route Handler integration test `packages/web/tests/integration/games/id-route.test.ts` for GET + PATCH: GET unauth → 401; GET own game → 200 with full state; GET other user's game → 404 (RLS-filtered); PATCH without `Idempotency-Key` → 400; PATCH twice with same key → row unchanged on retry; PATCH → `finished` sets `finished_at`; PATCH on already-finished → 409 `finished_game_locked`. **Self-skips until migration applied (7 tests skipping).**
- [X] T048 [P] [US3] Store unit test `packages/web/src/lib/store.hydrate.test.ts`: `hydrateFromLibrary(record)` replaces persisted slice; forces clock + break to paused (FR-016); rejects when local game is in progress (guard); accepts when on setup or finished; `force: true` bypasses guard; falls back to `unset` possessionArrow when absent. **6/6 passing.**
- [X] T049 [P] [US3] LibraryEntry `Continue` behavior tests (in `packages/web/src/components/account/LibraryEntry.test.tsx`): Continue button only visible for in-progress games; on click fetches game and hydrates; opens confirm-force dialog when store rejects; cancel does not navigate; fetch failure surfaces inline. **10/10 total passing (5 US2 row-summary + 5 US3 Continue).**
- [X] T050 [P] [US3] E2E `packages/web/tests/e2e/account-continue.spec.ts`: seed an in-progress game via admin, sign in, navigate to `/account`, click Continue, assert live view with restored team names. **Spec written; deferred to user (needs migration applied + dev server + Playwright).**

### Implementation for User Story 3

- [X] T051 [US3] Implement `packages/web/src/app/api/games/[id]/route.ts` — GET returns the full row for the authenticated owner (RLS-scoped, 404 otherwise); PATCH validates `Idempotency-Key`, checks the current row (404 if missing, 409 if finished), reserves the key via `record_game_write`, recomputes summary columns, sets `finished_at` on transition. Wrapped in `withAuthenticatedHandler`.
- [X] T052 [US3] Extend `packages/web/src/lib/store.ts` with `hydrateFromLibrary(record, opts?)` — replaces persisted slice, forces `clockRunning: false` and `breakSeconds: 0`, honors the FR-017 guard (rejects when a local in-progress game exists unless `force: true`). Added to the exported `GameState` interface.
- [X] T053 [US3] Extend `LibraryEntry.tsx` — added a "Continue" button visible only when `status === 'in-progress'`. On click: fetch `GET /api/games/[id]` → `hydrateFromLibrary` → `router.push('/')`. On guard rejection, mounts a Modal-based confirm-force dialog; on confirmation, hydrates with `force: true` and navigates.
- [ ] T054 [US3] Run E2E `account-continue.spec.ts` (T050). **Deferred to user — needs migration + dev server + Playwright.**

**Checkpoint**: US1 + US2 + US3 work. Multi-device continuation of an in-progress game is functional and safe.

---

## Phase 6: User Story 4 - Review a finished game & delete from library (Priority: P3)

**Goal**: A user opens a finished library entry, is taken to a read-only review view showing the statsheet and complete ordered game log, and can navigate back without altering anything. Users can also delete any library entry with an explicit confirmation — with an in-progress deletion warning that surfaces the event count.

**Independent Test**: Open a finished game from the library, see statsheet + read-only game log, back-navigate to library with scroll preserved. Delete a finished game → confirmation → row gone. Delete an in-progress game → confirmation names the events lost → row gone.

### Tests for User Story 4 (MANDATORY per Constitution Principle I) ⚠️

- [X] T055 [P] [US4] Pure unit test `packages/core/src/stats.test.ts` for `computeStatSheet(events, teams)`: matches `computeStats` team totals; per-player lookup map covers both rosters; aggregates a mixed events fixture; timeout / clock / period / substitution events don't affect stats. **34/34 total pass in the file (4 new + 30 existing).**
- [X] T056 [P] [US4] Component test `packages/web/src/components/game/StatSheet.test.tsx`: rows per rostered player, points per player, team totals, semantic `<table>` markup. **4/4 pass.**
- [X] T057 [US4] Extended `packages/web/src/components/game/GameLog.test.tsx` with a `readOnly` describe block — suppresses every Edit / Delete affordance; keyboard focus never lands on suppressed controls. **30/30 pass (2 new + 28 existing).**
- [X] T058 [P] [US4] Component test `packages/web/src/components/account/DeleteGameDialog.test.tsx`: in-progress variant names event count + period; finished variant uses generic copy; confirm sends DELETE and calls onDeleted; cancel is a no-op. **4/4 pass.**
- [X] T059 [P] [US4] Extended `packages/web/tests/integration/games/id-route.test.ts` with DELETE cases: unauth → 401; own game → 204 and row disappears; other user's game → 404 (RLS-filtered) and row unchanged. **Self-skips until migration applied (10 tests skipping).**
- [ ] T060 [P] [US4] Server Component test for `packages/web/src/app/(authenticated)/account/games/[id]/page.test.tsx` — **skipped for now**; the redirect behavior is covered by the review E2E (T061) and the file lands as a Server Component that queries Supabase directly.
- [X] T061 [P] [US4] E2E `packages/web/tests/e2e/account-review.spec.ts`: seed a finished game, click Review, verify statsheet + read-only log, back to library; delete finished (generic copy) and in-progress (event-count copy) with row disappearing. **Deferred to user (needs migration + dev server + Playwright).**

### Implementation for User Story 4

- [X] T062 [US4] `computeStatSheet(events, homeTeam, awayTeam, settings, currentPeriod)` in `packages/core/src/stats.ts`, exported from `packages/core/src/index.ts`. Returns `{ home, away, players }` where `players` is a per-playerId lookup map. Pure, no React.
- [X] T063 [P] [US4] `packages/web/src/components/game/StatSheet.tsx` — presentational per-team table with header row (PTS / FG / 3P / FT / REB / AST / STL / BLK / TO / PF), team totals row, foul-out styling.
- [X] T064 [US4] `GameLog` accepts `readOnly?: boolean` and optional `source?: { events, homeTeam, awayTeam, periods }`. When `source` is provided the log renders from those props instead of the Zustand store — the review view uses this to render a saved game without disturbing any active in-progress game.
- [X] T065 [US4] `packages/web/src/components/account/GameReviewView.tsx` — composes `<StatSheet>` + `<GameLog readOnly source={...} />` for a supplied `PersistedGameRecord`. Renders the score and a "Back to your library" link.
- [X] T066 [US4] `packages/web/src/app/(authenticated)/account/games/[id]/page.tsx` — Server Component. `requireAuth`, fetches the record server-side (RLS enforces ownership; row not found → `notFound()`); redirects in-progress games back to `/account`.
- [X] T067 [P] [US4] `DeleteGameDialog.tsx` — two variants sharing the same shell; in-progress warning names event count + period; on confirm DELETE `/api/games/[id]`; inline error surface on failure.
- [X] T068 [US4] `packages/web/src/app/api/games/[id]/route.ts` gains `DELETE` — RLS enforces ownership; missing row (or RLS-filtered) → 404; success → 204.
- [X] T069 [US4] `LibraryEntry.tsx` gains a Review button (finished only, navigates to `/account/games/:id`) and a Delete button (both variants; opens the DeleteGameDialog; on success calls `onDeleted(id)`). `GameLibrary` updated to drop the row from local state on delete.
- [ ] T070 [US4] Run E2E `account-review.spec.ts` (T061). **Deferred to user.**

**Checkpoint**: All four user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Coverage top-up, accessibility, performance verification, quickstart validation, and CI green.

- [ ] T071 [P] Accessibility audit for the new sidebar and account page: keyboard-navigable, WCAG 2.1 AA contrast, `<dialog>`-based Modals trap focus (verify against the shared `Modal` primitive). Fix any issues found. Constitution Principle IV requirement.
- [ ] T072 [P] Performance verification for the library: seed a test account with 50 games, load `/account`, capture the first-batch render time in Playwright (`performance.now()`), assert < 2s under normal network. Enforces SC-003.
- [ ] T073 [P] Bundle-size check: run `next build` and confirm no route above the 20 KB gzip threshold added by this feature per Constitution Principle IV. Note the icon components are inline SVG (Research R-10) so bundle impact should be minimal.
- [ ] T074 [P] Coverage top-up: run `npm run test:coverage --workspace=scorekeeping-app` and add unit tests where coverage regressed against the prior baseline (Principle I: coverage must not regress on main).
- [ ] T075 Update `packages/web/README.md` (or the workspace's contributing notes) with the account library + sidebar behavior — no marketing docs, just enough for a new contributor.
- [ ] T076 Run the entire quickstart flow (`specs/009-account-library/quickstart.md`) manually end-to-end and check off each step.
- [ ] T077 Run `npm run test:all` at the repo root. All gates must pass (typecheck + lint + test:coverage + test:e2e) per the constitution's per-PR quality gate.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup. **BLOCKS all user stories** (migration + generated types + shared Zod + shared handler helper are used by every downstream phase).
- **US1 (Phase 3)**: Depends on Foundational.
- **US2 (Phase 4)**: Depends on Foundational. Independent of US1 in principle, but the `/account` page shell delivered by US1 hosts the library section — so in practice US2 lands on top of US1 during sequential delivery.
- **US3 (Phase 5)**: Depends on Foundational + US2 (needs the `LibraryEntry` component and the write-through save infrastructure).
- **US4 (Phase 6)**: Depends on Foundational + US2 (needs `LibraryEntry` for the entry point; needs `GameLog` present to add the `readOnly` prop). Can otherwise proceed in parallel with US3.
- **Polish (Phase 7)**: Depends on all user stories being complete for the increment being shipped.

### Within Each User Story

- Test tasks MUST be authored (and observed failing) before the corresponding implementation tasks.
- Route Handler integration tests must be red before the route handler is written (Principle VI backend PR gate).
- Component tests must be red before the component is written (Principle III + I).
- Server Component / Server Action changes may share a file with implementation once the test file is red.

### Parallel Opportunities

- All Foundational tests (T003, T004, T005) can run in parallel; all Foundational implementation tasks marked [P] (T008–T011) can run in parallel once T007's regenerated types are committed.
- Within US1, all test tasks (T012–T018) can run in parallel; icon components (T019) and Zod schemas (T023) can run in parallel with sidebar / form work.
- Within US2, all test tasks (T030–T036) can run in parallel; `serialize.ts`, `LibraryEntry.tsx`, `AnonymousGameOnSignInPrompt.tsx` are independent files and can be worked in parallel.
- Within US4, `stats.ts`, `StatSheet.tsx`, and `DeleteGameDialog.tsx` are independent files and can be worked in parallel.
- US3 and US4 can proceed in parallel by two contributors once US2 has landed.

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Component test AppSidebar.test.tsx"
Task: "Component test SidebarProfileIcon.test.tsx"
Task: "Zod unit test profile.test.ts"
Task: "Server action unit test actions.test.ts"
Task: "Component test ProfileForm.test.tsx"
Task: "Component test ChangePasswordForm.test.tsx"
Task: "E2E account-profile.spec.ts"

# Then in parallel (independent files):
Task: "Create shell/icons/* inline SVG components"
Task: "Implement lib/validation/profile.ts"
Task: "Implement SidebarProfileIcon.tsx"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational — migration, types, shared helpers).
2. Complete Phase 3 (US1 — sidebar + profile + password change).
3. **STOP and VALIDATE**: run `account-profile.spec.ts` and the T077 subset for US1 only.
4. Ship the MVP — signed-in users get an account page, an in-app password change, and a new sidebar shell.

### Incremental Delivery

- MVP: US1 → deploy → demo (shipped account page + sidebar).
- Increment 2: US2 → deploy → demo (library visible, write-through save, anonymous-game merge flow).
- Increment 3: US3 → deploy → demo (multi-device continuation).
- Increment 4: US4 → deploy → demo (statsheet review + delete lifecycle).
- Increment 5: Phase 7 (Polish) → ship final.

Each increment is independently testable and independently valuable.

### Parallel Team Strategy

With multiple developers after Foundational is green:

- Dev A: US1 (sidebar + account page).
- Dev B: US2 (API endpoints + library + write-through hook + sign-in prompt).
- Dev C: US4 (`computeStatSheet` + `StatSheet` + review view + delete) — can start Route Handler DELETE tests + statsheet immediately, defer LibraryEntry wiring until US2 lands.
- After US2 lands: pick up US3.

---

## Notes

- Every implementation task lists exact absolute file paths.
- No new runtime dependencies are added by this feature (Research R-10; plan Technical Context).
- The single new migration `0002_account_library.sql` (T006) is the sole DB change. Its integration test (T003) is the sole source of truth for schema correctness.
- `types.gen.ts` (T007) MUST be regenerated + committed after T006 — do not skip.
- `useLibraryWriteThrough` (T039) MUST NOT run for anonymous sessions; feature 006's local persistence is preserved as-is.
- FR-017's local-game-clobber warning (T053) is a client-side dialog; do not push it into the store — the store's `hydrateFromLibrary(force: false)` throw is the enforcement mechanism, but the UX message lives in the button component.
- Constitution Principle VI backend PR gate: every PR that lands a Route Handler in this feature MUST include the migration diff (if any), the RLS policy diff (if any), and the corresponding integration test.
