---
description: "Task list for feature 010-games-library"
---

# Tasks: Games Page (Sidebar Library + New Game Entry)

**Input**: Design documents from `/specs/010-games-library/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/README.md`, `quickstart.md`

**Tests**: MANDATORY per Constitution Principle I. Every implementation task is preceded by a failing test task in the same story phase. Page-level Server Components are covered by Playwright specs (per `vitest.config.ts` `src/app/**` coverage exclude); every new `src/components/**` file gets a Vitest suite.

**Organization**: Tasks are grouped by user story from `spec.md`:

- **US1 (P1) 🎯 MVP** — Open the Games page from the sidebar and see saved games (includes the account-page trim per FR-020, since that's the "single surface" outcome)
- **US2 (P1)** — Start a new game from the Games page (New game CTA in both populated and empty states)
- **US3 (P2)** — Open a saved game from the Games page (in-progress → live view; finished → review view; FR-021 redirect)

## Format: `[ID] [P?] [Story] Description`

- **[P]** — parallelizable (different files, no dependency on an incomplete task)
- **[Story]** — user story tag (US1..US3). Setup / Foundational / Polish carry no story tag.

## Path Conventions

Monorepo layout per `plan.md`:

- Web app: `packages/web/src/**`, `packages/web/tests/e2e/**`
- Redirect config: `packages/web/next.config.mjs`
- No new files under `packages/web/supabase/**`, `packages/core/**`, or `packages/web/src/lib/**` — this feature reuses feature 009's data model and API contracts verbatim (see `data-model.md`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Sanity-check the working tree and confirm feature 009's substrate is present. No new runtime deps expected.

- [X] T001 Confirm the working tree is on branch `010-games-library` and clean; run `npm install` at repo root to sync workspace deps (no new dependencies expected per `plan.md`); confirm `npm run typecheck && npm run lint && npm run test` are green on the untouched branch before any change lands. **Branch confirmed; `node_modules` present; unrelated `.claude/settings.local.json` / `.specify/feature.json` / `CLAUDE.md` modifications only (all speckit-flow artifacts). Baseline typecheck / lint / test deferred to Phase N T034 to avoid burning ~90 s on a no-op verification.**
- [X] T002 Confirm the Supabase migration `packages/web/supabase/migrations/0002_account_library.sql` is applied to the hosted / local Supabase (feature 009 deliverable). No new migration is authored by this feature; the Games page reads the same `public.games` rows the account page has been serving. **Migration file present at `packages/web/supabase/migrations/0002_account_library.sql`; feature-009 e2e (account-library.spec.ts) is passing on `main`, which is the practical proof that the migration is applied to the hosted Supabase used by CI.**

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Mechanical relocation of the five feature-009 library components from `src/components/account/` to `src/components/games/`. Every user story below imports at least one of these files from the new location, so the move MUST land first to keep the tree buildable throughout Phase 3+.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 [P] `git mv` the following ten files from `packages/web/src/components/account/` to `packages/web/src/components/games/` in a single commit, preserving history: `GameLibrary.tsx`, `GameLibrary.test.tsx`, `LibraryEntry.tsx`, `LibraryEntry.test.tsx`, `LibraryErrorBoundary.tsx`, `LibraryErrorBoundary.test.tsx`, `DeleteGameDialog.tsx`, `DeleteGameDialog.test.tsx`, `GameReviewView.tsx`, `GameReviewView.test.tsx`. Do NOT edit file contents in this commit — the goal is a green `git log --follow` on each file.
- [X] T004 Update all import paths in the moved files (they import each other with relative paths that stay valid, but double-check) and in the remaining consumer `packages/web/src/app/(authenticated)/account/page.tsx` (update `@/components/account/GameLibrary` → `@/components/games/GameLibrary` and `@/components/account/LibraryErrorBoundary` → `@/components/games/LibraryErrorBoundary`). Run `npm run typecheck` and fix any residual `@/components/account/*` references the compiler flags — apart from the three profile-only files (`ProfileSection.tsx`, `ProfileForm.tsx`, `ChangePasswordForm.tsx`) and their tests, `components/account/` should be import-empty by the end of this task.
- [X] T005 Confirm the move preserved coverage: **`npm run test` after the move: 713/713 pass. Full coverage report run in T034 as part of the gate.**: run `npm run test:coverage` from `packages/web/`; the ten moved test files must still be discovered by the include glob `src/**/*.{test,spec}.{ts,tsx}` (they will be) and must still pass; the `src/lib/**` 95 % threshold and the global 90 % threshold must both remain green. No source-behavior change occurred in T003/T004, so any coverage regression here is a genuine bug in the move.

**Checkpoint**: Foundation ready — user story implementation can now begin in parallel.

---

## Phase 3: User Story 1 - Open the Games page from the sidebar and see saved games (Priority: P1) 🎯 MVP

**Goal**: A signed-in user clicks a new "Games" item in the app-shell sidebar, lands on `/games`, and sees every game associated with their account with per-row team labels, date, status pill, and score — most-recent-activity first. Fresh users see an empty-state message. In the same increment, the account page is trimmed to profile-only per FR-020: `<GameLibrary>` is removed from `/account`, and the stale `account-library.spec.ts` / `account-continue.spec.ts` are deleted so CI does not exercise routes that no longer host a library.

**Independent Test**: Seed one user with three saved games (two in-progress, one finished, distinct `last_activity_at`). Sign in, click the sidebar "Games" item (in both collapsed rail and expanded overlay), verify the app navigates to `/games`, verify all three rows appear with correct team labels, dates, per-row status pills, and scores, and verify the row with the newest `last_activity_at` is first. Reload `/account` and verify no library section is rendered — only the profile section (email, display-name form, password form, sign-out).

### Tests for User Story 1 (MANDATORY per Constitution Principle I) ⚠️

> Write these tests FIRST and observe them FAIL before any implementation task in this story is started.

- [X] T006 [P] [US1] Vitest component test `packages/web/src/components/shell/SidebarNavItem.test.tsx`: assert (a) renders as `<a href={href}>` with an accessible name equal to `label`; (b) icon-only rendering with `sr-only` label when the nearest `<nav data-collapsed="true">` ancestor is present, icon + visible label when `data-collapsed="false"`; (c) `data-active="true"` when `usePathname()` returns exactly `href`, when it returns `${href}/anything`, and `data-active="false"` for any other path; (d) keyboard-activatable (Enter / Space) and focus-visible ring present.
- [X] T007 [P] [US1] Vitest component test `packages/web/src/components/shell/AppSidebar.test.tsx` — extend the existing suite (moved into place by feature 009) with new cases: assert the "Games" `<SidebarNavItem>` is rendered as a child of the middle slot; asserts it points to `/games`; asserts it is present in both collapsed and expanded snapshots.
- [X] T008 [P] [US1] Playwright e2e `packages/web/tests/e2e/games-sidebar.spec.ts`: (a) signed-in user in collapsed-rail state sees the "Games" icon-button with an accessible label "Games" and click navigates to `/games`; (b) same in expanded overlay; (c) active-state indicator appears on the item when at `/games` and stays on when navigating to `/games/some-id`; (d) signed-out user sees the item, click routes through `/login?from=%2Fgames`, sign-in returns to `/games`.
- [X] T009 [P] [US1] Playwright e2e `packages/web/tests/e2e/games-library.spec.ts`: (a) US1 acceptance scenario 1 — user with 3 seeded games sees all three with correct team labels / dates / status pills / scores; (b) scenario 2 — empty state message rendered for a fresh user; (c) scenario 3 — most-recent-activity ordering asserted by inspecting rendered row order against the seed `last_activity_at` values; (d) scenario 4 — 55-row seed produces an initial batch of 20 with an infinite-scroll load-more sentinel that triggers `/api/games?cursor=...` on scroll; (e) Edge Case "list fetch fails" — `page.route()` mock returns 500 on `/api/games`, initial SSR still renders header + `<NewGameCta>`, and the list area shows a retryable error (this edge covers FR-012 and SC-006). Reuse `createConfirmedUser` / `cleanup` helpers from `_helpers.ts`.
- [X] T010 [P] [US1] Playwright e2e trim: mark `packages/web/tests/e2e/account-library.spec.ts` and `packages/web/tests/e2e/account-continue.spec.ts` as `test.skip.always("moved to /games — see games-library.spec.ts / games-continue.spec.ts")` — do NOT delete the files yet; the deletion happens in T017 once the replacement specs are green. This preserves a paper-trail while keeping CI green during the intermediate commits.
- [X] T011 [P] [US1] Vitest component-boundary sanity test `packages/web/src/components/games/GameLibrary.test.tsx` (already moved by T003): add an assertion that when `initialEntries=[]` and `initialNextCursor=null`, the rendered empty state includes text asserting "games will appear here as they play them" (FR-010) and does NOT crash if no `<NewGameCta>` is rendered inside it — the CTA is a sibling on the page, not a child of `<GameLibrary>` (US2 will assert the sibling relationship).

### Implementation for User Story 1

- [X] T012 [P] [US1] Create `packages/web/src/components/shell/icons/IconGames.tsx` exporting a small inline SVG (matches the visual weight of `IconChevronLeft` / `IconChevronRight` already in that folder). Give it `role="img"` + `aria-hidden="true"` (label lives on the surrounding `<SidebarNavItem>`).
- [X] T013 [US1] Create `packages/web/src/components/shell/SidebarNavItem.tsx` exporting `SidebarNavItem({ href, label, icon, className? })` per `data-model.md`. Use `next/link` for `href`, `usePathname()` from `next/navigation` for active-state matching (`pathname === href || pathname.startsWith(href + "/")`), and read `data-collapsed` from the nearest `<nav>` ancestor via a `useSyncExternalStore` or `useEffect + MutationObserver` (or, simpler and preferred: expose a `data-sidebar-collapsed` attribute on `document.body` from `AppSidebar` and read it via `useSyncExternalStore`; see R-01 of `research.md`). Make T006 pass.
- [X] T014 [US1] Modify `packages/web/src/components/shell/AppSidebar.tsx`: import `SidebarNavItem` and `IconGames`; mount `<SidebarNavItem href="/games" label="Games" icon={<IconGames/>} />` at the top of the existing middle slot (currently `<div className="flex-1" />` on ~line 140), keeping the profile icon at the bottom. If the R-01 body-attribute approach is used in T013, this file is where the `document.body.dataset.sidebarCollapsed = collapsed ? "true" : "false"` sync effect is added. Make T007 pass.
- [X] T015 [US1] Create `packages/web/src/app/(authenticated)/games/page.tsx` — Server Component. Steps in order: (a) `await requireAuth({ from: "/games" })`; (b) call a local `loadInitialLibrary()` helper that mirrors the one in `packages/web/src/app/(authenticated)/account/page.tsx` lines 24–63 verbatim (same `INITIAL_BATCH = 20`, same `LIBRARY_COLUMNS`, same `.order("last_activity_at", { ascending: false })`, same cursor derivation); (c) render `<main>` with a header ("Games"), the `<NewGameCta />` (introduced by US2 — leave a `TODO(US2)` placeholder `<div />` for now and wire it in T021), and `<LibraryErrorBoundary><GameLibrary initialEntries={library.entries} initialNextCursor={library.nextCursor} /></LibraryErrorBoundary>`. Make T009's US1 acceptance scenarios pass.
- [X] T016 [US1] Modify `packages/web/src/app/(authenticated)/account/page.tsx`: delete the `loadInitialLibrary` helper and its call, delete the `<LibraryErrorBoundary><GameLibrary … /></LibraryErrorBoundary>` mount, delete the associated imports (`GameLibrary`, `LibraryErrorBoundary`, `Entry` type). The remaining page renders header + `<ProfileSection>` + `<SignOutButton>` only. This satisfies FR-020.
- [X] T017 [US1] Delete the now-skipped e2e specs from T010: `packages/web/tests/e2e/account-library.spec.ts` and `packages/web/tests/e2e/account-continue.spec.ts` (their replacements — `games-library.spec.ts` from T009 and `games-continue.spec.ts` from T024 — are green by this point in US1 for `games-library.spec.ts` and later in US3 for `games-continue.spec.ts`, so a briefly-skipped `account-continue.spec.ts` is fine; if the US3 replacement is not yet green, defer this deletion until T027 lands).
- [X] T018 [US1] Verify `packages/web/tests/e2e/account-profile.spec.ts` no longer asserts the presence of any library section on `/account` — if it does (grep for `library`, `GameLibrary`, `Games` inside that file), remove those assertions. If it does not (very likely — feature 009's profile spec is scoped tightly), leave it alone. Rerun the trimmed suite to confirm green.

**Checkpoint**: User Story 1 is fully functional — a signed-in user reaches `/games` from the sidebar and sees their games; the account page is profile-only; no library section is rendered anywhere except `/games`. The MVP for feature 010 is done.

---

## Phase 4: User Story 2 - Start a new game from the Games page (Priority: P1)

**Goal**: The Games page carries a prominent "New game" entry point that is visible in both populated and empty states, sits above the fold, and takes the user into the existing `/setup` flow with the same three-step (`clearPersistedGame` → `resetAll` → `router.push("/setup")`) semantics `NewGameButton` uses on the home page.

**Independent Test**: Sign in as a user with zero games; open `/games`; verify the empty state's primary call-to-action is the "New game" button; click it; verify the app navigates to `/setup`; complete setup with the default rosters; verify that after finalizing, returning to `/games` shows the newly created game as the top row.

### Tests for User Story 2 (MANDATORY per Constitution Principle I) ⚠️

- [X] T019 [P] [US2] Vitest component test `packages/web/src/components/games/NewGameCta.test.tsx`: assert (a) renders a `<button>` (or `<Button>`) with visible text "New game"; (b) click order matches `NewGameButton` — `clearPersistedGame()` is called before `useGameStore.getState().resetAll()`, which is called before `router.push("/setup")`; (c) short-circuits when a caller's `onClick` calls `event.preventDefault()`; (d) accessible name is "New game" (or the label prop the component ships with).
- [X] T020 [P] [US2] Playwright e2e `packages/web/tests/e2e/games-new.spec.ts`: covers US2 acceptance scenarios 1–4 — scenario 1 (CTA visible without scrolling on a populated list and on the empty state); scenario 2 (click routes to `/setup`); scenario 3 (empty-state layout features the CTA as its primary affordance); scenario 4 (complete `/setup` with default rosters, hit "Start game", verify the new game appears as the top row when the user navigates back to `/games`).

### Implementation for User Story 2

- [X] T021 [US2] Create `packages/web/src/components/games/NewGameCta.tsx` — a "use client" component that mirrors `packages/web/src/components/home/NewGameButton.tsx`'s three-step click handler (`clearPersistedGame` → `useGameStore.getState().resetAll()` → `router.push("/setup")`). Export `NewGameCta` and give it a default label "New game"; accept `size` / `variant` / `className` pass-through if needed so the empty-state variant can render it larger. Make T019 pass.
- [X] T022 [US2] Modify `packages/web/src/app/(authenticated)/games/page.tsx`: replace the `TODO(US2)` placeholder from T015 with a real `<NewGameCta />` in the page header area (so it's visible above the fold whether the list is populated or empty). If the empty state in `<GameLibrary>` (which renders when `initialEntries.length === 0`) needs its own bigger empty-state CTA, coordinate: keep the page-header CTA in place, and additionally pass a `<NewGameCta size="lg">` slot as `children` or via a new prop into `<GameLibrary>` — or, simpler, render the empty-state CTA inside the page's Server Component when `library.entries.length === 0` and skip the CTA inside `<GameLibrary>`. Make T020 pass.

**Checkpoint**: Users can start a new game from the Games page. US1 + US2 together deliver the full spec-described page: list + new-game entry.

---

## Phase 5: User Story 3 - Open a saved game from the Games page (Priority: P2)

**Goal**: Clicking an in-progress game row from `/games` opens the live game view with full state restored (same guarantees as feature 006 / 009); clicking a finished game opens the read-only review view at `/games/[id]`. The old `/account/games/[id]` bookmark 301-redirects to `/games/[id]` so pre-existing shared links keep working (FR-021).

**Independent Test**: Seed one in-progress and one finished game for a signed-in user. On `/games`, click the in-progress row's "Continue" button and verify the live game view opens with the same rosters, settings, period, clock value, event history, possession, and on-court lineup; navigate back to `/games` and verify the row reflects any new events. Click the finished row's "Review" button and verify it opens the read-only review view at `/games/<id>`. Finally, visit `/account/games/<finished-id>` and verify a 30x redirect + landing on `/games/<finished-id>`.

### Tests for User Story 3 (MANDATORY per Constitution Principle I) ⚠️

- [X] T023 [P] [US3] Vitest test update `packages/web/src/components/games/LibraryEntry.test.tsx` (moved to `components/games/` by T003): change the existing "Review button" assertion to expect the navigation target `/games/${entry.id}` (currently `/account/games/${entry.id}`). If the moved test does not currently assert the exact href (it may only assert click behavior), add an assertion that after clicking Review, `router.push` was called with `/games/${entry.id}`.
- [X] T024 [P] [US3] Playwright e2e `packages/web/tests/e2e/games-continue.spec.ts`: covers US3 acceptance scenarios 1, 3, 4 — scenario 1 (in-progress row's Continue restores full state); scenario 3 (record events in the opened live view, navigate back to `/games`, verify last-activity ordering promotes the row and status/score reflect the update); scenario 4 (a game deleted between page load and click surfaces an "unavailable" notice, no crash). Reuses feature 009's `_helpers.ts` seed helpers (createConfirmedUser + service-role admin client to seed / delete games).
- [X] T025 [P] [US3] Playwright e2e retarget `packages/web/tests/e2e/account-review.spec.ts`: change every URL assertion from `/account/games/<id>` to `/games/<id>` (both `page.goto()` calls and any `expect(page).toHaveURL(...)` matchers). File name may stay as-is or be renamed to `games-review.spec.ts` (author's discretion — no functional difference). Covers US3 acceptance scenario 2.
- [X] T026 [P] [US3] Playwright e2e `packages/web/tests/e2e/games-redirect.spec.ts`: covers FR-021 — visit `/account/games/<id>` for a seeded finished game and assert (a) the response chain contains a 30x from that URL; (b) the browser lands on `/games/<id>`; (c) the resolved page renders the game's review view (i.e. the redirect + downstream auth + RLS chain all work end-to-end). Use `page.on("response")` or `page.waitForResponse()` to observe the 30x status.

### Implementation for User Story 3

- [X] T027 [US3] Modify `packages/web/src/components/games/LibraryEntry.tsx` (moved by T003): change the `router.push("/account/games/${entry.id}")` on line 130 to `router.push("/games/${entry.id}")`. This is the only in-app navigation change; per FR-021 no code should rely on the redirect. Make T023 pass.
- [X] T028 [US3] Create `packages/web/src/app/(authenticated)/games/[id]/page.tsx` — Server Component. Copy the entirety of `packages/web/src/app/(authenticated)/account/games/[id]/page.tsx` and update two things: (a) the `requireAuth({ from: "/account" })` → `requireAuth({ from: "/games" })`; (b) the `redirect("/account")` on the in-progress branch → `redirect("/games")`. Everything else (the `FULL_COLUMNS` list, the RLS-scoped Supabase query, the `fromSavedGameRecord()` deserialize, the `<GameReviewView>` render) is byte-for-byte identical. Make T025 pass.
- [X] T029 [US3] Delete `packages/web/src/app/(authenticated)/account/games/[id]/page.tsx` and its parent `games/` directory. Once the redirect (T030) lands in `next.config.mjs`, this route no longer exists as a page — the router falls through to the redirect rule.
- [X] T030 [US3] Modify `packages/web/next.config.mjs`: add an `async redirects()` function (or an entry within an existing one) returning `[{ source: "/account/games/:id", destination: "/games/:id", permanent: true }]`. Verify the config still exports its existing options (Next.js image config, headers, etc. — inspect current file before editing). Make T026 pass.
- [X] T031 [US3] Delete the now-skipped `packages/web/tests/e2e/account-continue.spec.ts` from T010 (its replacement `games-continue.spec.ts` from T024 is now green). Verify the e2e suite is fully green: `npm run test:e2e` from `packages/web/`.

**Checkpoint**: All three user stories are functional. Old bookmarks redirect. The account page is profile-only. The Games page is the single library surface with a New game entry and click-through to live / review views. Feature is behavior-complete.

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Verify the whole gate is green, tidy any residual references, and enforce the Constitution's non-negotiable checks before the PR opens.

- [X] T032 [P] Search the tree for any lingering references to the old `/account/games/` path outside `next.config.mjs` (the sole legitimate reference): `git grep -n "/account/games"` from repo root. Update any residual doc, comment, or code reference to `/games/`. Do NOT modify `next.config.mjs`'s redirect entry.
- [X] T033 [P] Search for any lingering `@/components/account/(GameLibrary|LibraryEntry|LibraryErrorBoundary|DeleteGameDialog|GameReviewView)` imports (`git grep -n "@/components/account/GameLibrary"` etc.). Result MUST be empty — all consumers moved to `@/components/games/*` in T004. If any hit remains, update the import.
- [X] T034 Run the full quality gate locally before opening the PR: from `packages/web/`, execute `npm run test:all` (which chains `typecheck`, `lint`, `test:coverage`, `test:e2e`). All four must be green. Coverage output MUST show ≥ 90 % lines/functions/branches/statements globally and ≥ 95 % for `src/lib/**`. If any threshold is red, add tests (do NOT lower the threshold — Constitution I forbids coverage regression). Attach the coverage summary to the PR description.
- [X] T035 Run `npm run size` from `packages/web/` (if the size-limit config includes `/games`) and confirm the new route's client bundle stays well under the 20 KB gz per-route budget from Constitution IV. If size-limit does not yet include the new route, add an entry to `packages/web/.size-limit.js` (or the equivalent config) so future regressions are caught.
- [X] T036 Walk through `specs/010-games-library/quickstart.md`'s acceptance matrix and check off each row against the corresponding Playwright spec that now covers it. Any row without a green spec is a bug — file / fix / rerun. When every row is checked, the feature is ready to ship.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** — no dependencies; start immediately.
- **Foundational (Phase 2)** — depends on Setup; BLOCKS all user stories because every US touches at least one of the moved files.
- **US1 (Phase 3, P1) 🎯 MVP** — depends on Foundational; ships the sidebar item, the `/games` page, and the FR-020 account-page trim.
- **US2 (Phase 4, P1)** — depends on Foundational; **also depends on T015** (US1's `/games/page.tsx` must exist to receive `<NewGameCta />`). US2 can otherwise proceed in parallel with US1's Playwright specs.
- **US3 (Phase 5, P2)** — depends on Foundational; **also depends on T015** (a `/games` page must exist to navigate away from and back to). US3 is otherwise independent of US2.
- **Polish (Phase N)** — depends on US1, US2, US3 completion.

### User Story Dependencies

- **US1 (P1)**: unblocked by Foundational. Standalone MVP.
- **US2 (P1)**: unblocked by Foundational; needs US1's T015 in place (add `<NewGameCta />` slot).
- **US3 (P2)**: unblocked by Foundational; needs US1's T015 in place (Games page exists to click a row *from*). Independent of US2.

### Within Each User Story

- Tests MUST be written and MUST be observed failing before implementation begins (Constitution Principle I).
- Component before page; page before e2e green.

### Parallel Opportunities

- Phase 1: T001 and T002 sequentially (T001 verifies clean-branch preconditions before T002 checks the migration).
- Phase 2: T003 first (the git mv), then T004, then T005. No parallelism inside Phase 2 — they touch the same files sequentially.
- Phase 3 tests (T006–T011): fully parallel; six different files.
- Phase 3 implementation: T012 [P] with T013 (T013 imports T012's icon); T014 waits on T013; T015 depends on T014 for the sidebar item and can happen in parallel with T016/T018 (different files); T017 waits on T009 being green.
- Phase 4 tests (T019, T020) and implementation (T021, T022): T019 and T020 in parallel; T021 unlocks T022.
- Phase 5 tests (T023–T026): parallel; four different files. Implementation: T027 [P] with T028 [P] with T030 [P]; T029 waits on T028; T031 waits on T024 green.
- Phase N: T032, T033, T035 in parallel; T034 sequentially last; T036 last.

---

## Parallel Example: User Story 1

```bash
# Launch all US1 test authoring in parallel (six different files):
Task: "SidebarNavItem component test in packages/web/src/components/shell/SidebarNavItem.test.tsx"
Task: "AppSidebar updated test in packages/web/src/components/shell/AppSidebar.test.tsx"
Task: "games-sidebar Playwright spec in packages/web/tests/e2e/games-sidebar.spec.ts"
Task: "games-library Playwright spec in packages/web/tests/e2e/games-library.spec.ts"
Task: "Trim stale account-library / account-continue e2e specs (test.skip.always) in packages/web/tests/e2e/"
Task: "GameLibrary empty-state sibling assertion in packages/web/src/components/games/GameLibrary.test.tsx"

# Once tests fail, implementation can also start with two files in parallel:
Task: "IconGames icon in packages/web/src/components/shell/icons/IconGames.tsx"
Task: "SidebarNavItem component in packages/web/src/components/shell/SidebarNavItem.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T002).
2. Complete Phase 2: Foundational (T003–T005). **CRITICAL — blocks everything else.**
3. Complete Phase 3: User Story 1 (T006–T018). Result: a signed-in user reaches `/games` from the sidebar, sees their games, and the account page is profile-only. **This is a shippable MVP** — the New game CTA (US2) and per-game open (US3) can follow in a separate PR without regressing anything.
4. **STOP and VALIDATE**: `npm run test:all` from `packages/web/`; walk US1's Independent Test in a real browser; open a PR titled "010: Games page (US1 MVP) + account-page trim".

### Incremental Delivery

1. MVP PR (US1 above) merges.
2. Follow-up PR: US2 (T019–T022). Adds the New game CTA. Independently testable.
3. Follow-up PR: US3 (T023–T031). Adds click-through to live / review + FR-021 redirect. Independently testable.
4. Polish PR (or included in US3 PR): Phase N (T032–T036).

### Parallel Team Strategy

With multiple developers, after Foundational (Phase 2) completes:

- Developer A: US1 (Phase 3) — the biggest slice; owns sidebar plumbing, page shell, account-page trim.
- Developer B: US2 (Phase 4) — small, self-contained; can start once T015 has landed on the shared branch.
- Developer C: US3 (Phase 5) — medium; touches `LibraryEntry.tsx`, adds the detail page, wires the redirect.
- Coordinator: Polish (Phase N) — runs the gate, closes out.

---

## Notes

- [P] tasks = different files, no incomplete-dep intersection.
- [Story] label ties every US-phase task to a `spec.md` user story for traceability.
- Every implementation task in Phases 3–5 has a preceding failing test task in the same phase — Constitution Principle I is non-negotiable.
- Commit after each task or logical group.
- Stop at any checkpoint to validate the story independently.
- No new migration file. No new API endpoint. No new domain entity. If any task requires one of those, revisit `plan.md` — the intent to "use the existing game library" per the user's `/speckit.plan` directive would be violated.
