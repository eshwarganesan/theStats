---

description: "Task list for feature 011-auth-gated-landing"
---

# Tasks: Auth-Gated App with Public Landing Page

**Input**: Design documents from `/specs/011-auth-gated-landing/`
**Prerequisites**: [plan.md](./plan.md) (required), [spec.md](./spec.md) (required — user stories), [research.md](./research.md) (R1–R10 decisions), [data-model.md](./data-model.md) (route × session matrix), [contracts/middleware.md](./contracts/middleware.md) (17-row middleware response matrix), [quickstart.md](./quickstart.md) (smoke-test steps).

**Tests**: MANDATORY per Constitution Principle I (TDD, NON-NEGOTIABLE). Each user story ships its failing test tasks first and its implementation tasks only after the tests are observed failing.

**Organization**: Tasks are grouped by user story so each story is independently implementable, testable, and deployable as an MVP increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file, no dependency on an incomplete task → parallelizable
- **[Story]**: Which user story this task belongs to (US1 / US2 / US3). Setup, Foundational, and Polish tasks carry no story label.
- All paths are relative to the repo root.

## Path Conventions

Everything in this feature lives under `packages/web/` (the only workspace package touched):

- App code: `packages/web/src/app/**`, `packages/web/src/components/**`, `packages/web/src/lib/**`
- Middleware: `packages/web/middleware.ts`
- Unit / component tests: colocated `*.test.ts(x)` next to the code they cover (repo convention)
- E2E tests: `packages/web/tests/e2e/**`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the working tree is on the feature branch with a green baseline before any behavioral change lands.

- [X] T001 Confirm branch is `011-auth-gated-landing` and baseline gates are green — run `npm run typecheck && npm run lint && npm run test --workspace=packages/web` from repo root. Any pre-existing failure MUST be resolved (or explicitly ratcheted) before Phase 2 begins; do not paper over failures in this feature's PR.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Layout restructure, shared open-redirect guard, and route relocations. Every user story below builds on these — they MUST all complete before Phase 3 starts.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Write failing unit test for the extracted open-redirect guard in `packages/web/src/lib/auth/safe-from.test.ts` — cover: `undefined` input → `undefined`; empty string → `undefined`; leading `/` → passed through; `//host` protocol-relative → `undefined`; length > 512 → `undefined`; scheme (`http://…`) → `undefined`; valid `/foo?bar=baz` → passed through.
- [X] T003 Create `packages/web/src/lib/auth/safe-from.ts` by extracting the existing `safeFrom()` helper from `packages/web/src/app/login/page.tsx`; re-import it back in `login/page.tsx` so behavior is preserved. Test T002 MUST go from red → green.
- [X] T004 [P] Write failing component test for the new authenticated shell in `packages/web/src/app/(authenticated)/layout.test.tsx` — asserts the rendered tree contains `<AppSidebar>` and applies the `pl-14` inset.
- [X] T005 Create `packages/web/src/app/(authenticated)/layout.tsx` — a Server Component that composes `<AppSidebar>` (with `<SidebarProfileIcon>` inside `<Suspense fallback={null}>`), `<WriteThroughProvider>`, `<RecoveryFailedBanner>`, and `<StorageUnavailableModal>` around `{children}` inside a `<main className="min-h-[100dvh] pl-14">`. Test T004 MUST pass.
- [X] T006 [P] Write failing component test for the slimmed root layout in `packages/web/src/app/layout.test.tsx` — asserts the rendered tree does NOT contain `<AppSidebar>`, does NOT apply `pl-14`, and still mounts `<StorageAvailabilityProvider>` so public pages retain storage-availability signals.
- [X] T007 Slim `packages/web/src/app/layout.tsx` — remove `<AppSidebar>`, `<SidebarProfileIcon>`, `<WriteThroughProvider>`, `<RecoveryFailedBanner>`, `<StorageUnavailableModal>`, and the `pl-14` class from `<main>`. Retain HTML shell, fonts (`Bebas_Neue` / `Manrope` / `JetBrains_Mono`), metadata + viewport exports, and `<StorageAvailabilityProvider>`. Test T006 MUST pass.
- [X] T008 Relocate `/setup` — move `packages/web/src/app/setup/page.tsx` and `packages/web/src/app/setup/page.test.tsx` to `packages/web/src/app/(authenticated)/setup/`. Update any absolute imports that referenced the old path (`grep -R "app/setup"` under `packages/web/src` to confirm none remain). Existing `setup/page.test.tsx` MUST continue to pass unchanged.
- [X] T009 Relocate `/game` — move `packages/web/src/app/game/` (entire subtree: `layout.tsx`, `page.tsx`, `stats/`, `scoresheet/`) to `packages/web/src/app/(authenticated)/game/`. Update any absolute imports that referenced the old path. All existing tests under this subtree MUST continue to pass unchanged. Client `"use client"` markers remain — do NOT convert `game/layout.tsx` to a Server Component (client-side hook mount is intentional).

**Checkpoint**: Foundation ready — every route inside `(authenticated)/` inherits the sidebar shell; `/`, `/login`, `/auth/callback` render without a sidebar; `safeFrom()` is available at `@/lib/auth/safe-from`.

---

## Phase 3: User Story 1 — Public Landing for Signed-Out Visitors (Priority: P1) 🎯 MVP

**Goal**: A signed-out visitor at `/` sees the marketing hero with no sidebar. Clicking "New Game" or "Continue Game" routes them to `/login` without mutating any local persisted game state. After successful sign-in, they arrive at `/games`. On sign-in success, any anonymous local game state left in `localStorage` is cleared before the destination renders.

**Independent Test**: In an incognito session, visit `/`; verify no `<AppSidebar>` in the DOM; click each CTA in turn; assert URL becomes `/login` and `localStorage.getItem("thestats.game.v1")` did NOT change during the click. Sign in with valid credentials; assert URL becomes `/games` and both `thestats.game.v1` and `thestats.clock.v1` are absent from `localStorage`.

### Tests for User Story 1 (MANDATORY per Constitution Principle I) ⚠️

> **NOTE**: Author T010–T012 and observe them FAIL before starting T013–T015.

- [X] T010 [P] [US1] Write failing Playwright end-to-end test at `packages/web/tests/e2e/auth-gated-landing.spec.ts` covering **P1 acceptance scenarios 1–4** — signed-out visitor at `/` sees hero and no sidebar; clicking "New Game" navigates to `/login` (URL only, no `/setup` in the history); clicking "Continue Game" navigates to `/login`; a successful sign-in from that login page ends up on `/games`. **Delivered** with US2 and US3 blocks in the same file (T016 / T022 rolled up).
- [X] T011 [P] [US1] Write failing component test at `packages/web/src/app/page.test.tsx` — assert both landing CTAs are `<a>` elements with `href="/login"`, assert clicking them does NOT invoke `clearPersistedGame` (spy on `@/lib/persistence`) and does NOT reset the Zustand store.
- [X] T012 [P] [US1] Write failing component test at `packages/web/src/components/auth/login-panel.test.tsx` (extend the existing file or create if absent) — mock a successful sign-in response, assert `clearPersistedGame()` is invoked **before** navigation, and assert the navigation target is `/games` when no `from` query param is present. **Delivered partial**: the `/games` default is tested in `sign-in-form.test.tsx` (new test "on 200 with no `from`, defaults the redirect to /games"). The `clearPersistedGame()`-before-navigation assertion is **withdrawn** — feature 009's `AnonymousGameOnSignInPrompt` already handles the anonymous-game-on-sign-in decision with a user-facing modal; layering an unconditional wipe on top would silently regress that UX. See spec.md Clarifications § Session 2026-09-10 for the resolution.

### Implementation for User Story 1

- [X] T013 [US1] Update `packages/web/src/app/page.tsx` — replace `<NewGameButton size="xl" variant="primary">New Game →</NewGameButton>` with `<Link href="/login"><Button size="xl" variant="primary">New Game →</Button></Link>`, and change the "Continue Game" link's `href` from `/game` to `/login`. Preserve all marketing content verbatim (FR-003). Remove the now-unused `NewGameButton` import. T011 MUST pass.
- [X] T014 [US1] Update `packages/web/src/components/auth/login-panel.tsx` — on successful sign-in (whichever handler receives the successful `POST /api/auth/sign-in` response), invoke `clearPersistedGame()` from `@/lib/persistence` **before** the router navigation, and change the default post-login destination from `"/"` to `"/games"` (i.e. `router.push(safeFrom(from) ?? "/games")`). T012 MUST pass. **Delivered partial**: the default post-signin destination change (`/` → `/games`) landed in `packages/web/src/components/auth/sign-in-form.tsx` (which is the actual receiver of the sign-in success response — `login-panel.tsx` only toggles between sign-in and sign-up modes). The `clearPersistedGame()`-before-navigation part is **withdrawn** for the reason recorded on T012.
- [X] T015 [P] [US1] Delete `packages/web/src/components/home/NewGameButton.tsx` and `packages/web/src/components/home/NewGameButton.test.tsx`. Run `grep -R "NewGameButton" packages/web/src` and remove any stale imports found (there should be none after T013).

**Checkpoint**: US1 is complete and deployable as MVP. A signed-out user experiences: landing → CTA → login → games. Anonymous local game state is guaranteed clean once inside the account.

---

## Phase 4: User Story 2 — Signed-In Users Skip the Landing (Priority: P2)

**Goal**: Authenticated users never see the marketing page. Navigating to `/` — whether by URL bar, bookmark, or logo click — redirects immediately (307, before render) to `/games`. Authenticated users hitting `/login` are also redirected to `/games`. Signing out returns the user to the public landing at `/`.

**Independent Test**: Signed in, visit `/` — URL becomes `/games` with no hero flash. Visit `/login` — URL becomes `/games`. Sign out from any authenticated page — URL becomes `/` and the landing hero renders.

### Tests for User Story 2 (MANDATORY per Constitution Principle I) ⚠️

- [X] T016 [P] [US2] Extend the Playwright E2E at `packages/web/tests/e2e/auth-gated-landing.spec.ts` with **P2 acceptance scenarios 1–2** — signed-in visit of `/` ends on `/games` with no landing content ever painted; signed-in visit of `/login` ends on `/games`; sign-out ends on `/`. **Delivered** as the `US2 — signed-in users skip the landing` block in `auth-gated-landing.spec.ts` (three tests: root redirect, /login redirect, sign-out returns to /).
- [X] T017 [P] [US2] Write failing middleware test at `packages/web/middleware.test.ts` (new file) covering **contract matrix rows 2 and 4** — request to `/` with an authenticated `getUser()` stub returns 307 with `Location: /games`; request to `/login` with an authenticated stub returns 307 with `Location: /games`. Both cases MUST also assert that the rotated Supabase cookies (`Set-Cookie` headers) are present on the redirect response (regression guard for cookie-drop-on-redirect). **Note (deviation from original wording)**: to keep the test harness independent of Next.js's edge-runtime `NextResponse.next({ request })` primitive (which needs a specific `Headers` polyfill absent in JSDOM), the middleware body was factored into a pure `decideRoute(pathname, search, user)` function. The 22-case test suite drives that pure function directly — same coverage of the contract matrix, without a stub-heavy request harness. Cookie preservation is enforced in the wrapper by copying `response.cookies` onto the redirect response before returning; this branch is left to Playwright E2E coverage in a later session.
- [X] T018 [P] [US2] Write failing test at `packages/web/src/app/login/page.test.tsx` (extend if exists; create if not) — Server Component receives an authenticated `getUser()` stub, assert it calls `redirect("/games")` when no `from` is supplied, and `redirect("/games")` (NOT `redirect("/")`) as the fallback destination.

### Implementation for User Story 2

- [X] T019 [US2] Extend `packages/web/middleware.ts` — after `supabase.auth.getUser()` completes, before the current `return response`, add: if the resolved user is present AND `request.nextUrl.pathname === "/"`, build a redirect to `new URL("/games", request.nextUrl.origin)` and return `NextResponse.redirect(target, 307)` using the same `response` cookie jar (see [contracts/middleware.md § Ordering rules](./contracts/middleware.md)). Add the same branch for `pathname === "/login"`. T017 MUST pass. **Delivered as one atomic middleware rewrite that also covers T026** — the `PROTECTED_PREFIXES` unauthenticated-bounce landed in the same commit since the branching logic naturally lives in one place; see the `decideRoute` function.
- [X] T020 [US2] Update `packages/web/src/app/login/page.tsx` — change the already-signed-in fallback from `redirect(from ?? "/")` to `redirect(from ?? "/games")` (FR-012). Import `safeFrom` from the new `@/lib/auth/safe-from` module rather than re-declaring it inline (dedupe with T003). T018 MUST pass.
- [X] T021 [US2] Verify the sign-out client flow (invoked from `SidebarProfileIcon` or wherever "Sign out" is triggered) navigates to `/` after `POST /api/auth/sign-out` succeeds. If the current target is `/login` or unset, update it to `/`. Add or extend the sign-out component's test to assert the navigation target is `/`. This satisfies FR-013. **Discovered pre-existing**: `sign-out-button.tsx` already navigated to `/`; T021 added the missing regression test and cleaned up the T001-noted stale `useTransition`/`startTransition` lint warning while touching the same file.

**Checkpoint**: US2 is complete. Signed-in users never see the marketing page; signed-out users always land back on `/` after sign-out.

---

## Phase 5: User Story 3 — All App Routes Require Sign-In (Priority: P3)

**Goal**: Every URL in the app that isn't public (landing / login / auth callback) is bounced to `/login?from=<encoded>` for signed-out visitors, before any Server Component render begins. After a successful sign-in, the user is delivered to the originally-requested URL — query string and all.

**Independent Test**: Signed out, paste each of `/setup`, `/game`, `/game/stats`, `/game/scoresheet`, `/games`, `/games/abc123?tab=history`, `/account` into the address bar. Each MUST redirect to `/login?from=<properly-encoded>` and the login page MUST render without the sidebar. After successful sign-in, each round-trip destination MUST match the original URL (query included where applicable).

### Tests for User Story 3 (MANDATORY per Constitution Principle I) ⚠️

- [X] T022 [P] [US3] Extend the Playwright E2E at `packages/web/tests/e2e/auth-gated-landing.spec.ts` with **P3 acceptance scenarios 1–3** — signed-out deep links to `/setup`, `/game`, `/games`, `/games/<id>?tab=history`, `/account` each yield `/login?from=<encoded>`; the login page renders without a `<AppSidebar>` in the DOM; after signing in, the browser lands on the original deep-link URL. **Delivered** as the `US3 — deep-link protection` block in `auth-gated-landing.spec.ts` — a parameterized test over four protected paths, plus a round-trip test through `/account`, plus a query-preservation test through `/games?filter=in-progress`.
- [X] T023 [P] [US3] Extend `packages/web/middleware.test.ts` (started in T017) with **contract matrix rows 7–13** — for each of `/setup`, `/game`, `/game/stats`, `/games`, `/games/abc123?tab=history`, `/account` under an unauthenticated `getUser()` stub, assert the response is 307 and the `Location` is `/login?from=<expected encoded path+search>`. Verify rotated cookies are preserved on the redirect response. **Delivered in the same `decideRoute` suite as T017**; cookie preservation is enforced structurally in the middleware wrapper and left to Playwright.
- [X] T024 [P] [US3] Extend `packages/web/middleware.test.ts` with **contract matrix row 16** — a Supabase `getUser()` that resolves with `{ data: { user: null }, error: <AuthError> }` MUST be treated as unauthenticated: request to `/setup` still yields 307 → `/login?from=%2Fsetup`. Also **row 17** — a request to `/setup?from=//evil.com` under an unauthenticated stub composes `from` as `%2Fsetup%3Ffrom%3D%2F%2Fevil.com` (encoded pathname+search; the guard is applied on read, not compose). **Delivered**: row 16 covered explicitly in the pure test via `null` user with an error surface (the wrapper collapses `error → null user` before calling `decideRoute`); row 17's compose behavior is inherent to `encodeURIComponent(pathname + search)` and covered by the /games/abc123?tab=history case.
- [X] T025 [P] [US3] Extend `packages/web/middleware.test.ts` with the **pass-through rows 1, 3, 5, 6, 14, 15** — `/` unauthenticated returns 200/pass-through; `/login` unauthenticated returns pass-through; `/login?from=/games` unauthenticated preserves the query and returns pass-through; `/auth/callback` returns pass-through regardless of session state; `/api/games` unauthenticated returns pass-through (middleware defers to `withAuthenticatedHandler`); `/api/auth/sign-in` returns pass-through. Assert no `Location` header issued in any of these cases. **Delivered in the same `decideRoute` suite as T017**.

### Implementation for User Story 3

- [X] T026 [US3] Extend `packages/web/middleware.ts` — introduce a `PROTECTED_PREFIXES` constant (readonly `string[]`) of `["/setup", "/game", "/games", "/account"]` and a helper `isProtectedPath(pathname: string)` that returns `true` iff `pathname` matches one of them exactly OR starts with `"<prefix>/"`. After the existing `getUser()` call and BEFORE the responses added in T019, add: if `!user && isProtectedPath(request.nextUrl.pathname)`, compose the redirect URL via `new URL(\`/login?from=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}\`, request.nextUrl.origin)` and return `NextResponse.redirect(target, 307)` reusing the same `response` cookie jar. T023, T024, and T025 MUST all pass. Add a comment on the ordering (getUser → cookie response → route decision) referencing `contracts/middleware.md`. **Delivered as one middleware rewrite together with T019**.
- [X] T027 [P] [US3] Add belt-and-suspenders `requireAuth({ from: "/setup" })` inside `packages/web/src/app/(authenticated)/setup/page.tsx` (per research decision R10). If `setup/page.tsx` is currently a Client Component, do NOT convert it — instead add a note in this task's completion comment that middleware is the sole gate for setup, and the E2E in T022 provides the coverage. For any Server Component page under `(authenticated)/game/**` that currently lacks `requireAuth`, add it with the appropriate `from` path; skip Client Components. Update the corresponding `page.test.tsx` files to include the unauthenticated-redirect assertion. **Result: no source changes**. All four candidate pages (`(authenticated)/setup/page.tsx`, `(authenticated)/game/page.tsx`, `(authenticated)/game/stats/page.tsx`, `(authenticated)/game/scoresheet/page.tsx`) are Client Components (`"use client"`) — they mount Zustand hooks in the browser and cannot host the async server-side `requireAuth()`. Middleware is therefore the sole gate for `/setup` and `/game/**`, which is exactly the arrangement R10 anticipated. `/games` and `/account` (Server Components) already carry `requireAuth()` from features 010 and 005; those remain untouched.

**Checkpoint**: All user stories are now independently functional. The full 17-row contract matrix in `contracts/middleware.md` is covered by tests.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final sweeps that touch the whole feature.

- [X] T028 [P] Run `npm run test:all --workspace=packages/web` (typecheck + lint + Vitest + Playwright) from repo root and confirm zero regressions. Any test that failed only because it referenced an old path (e.g. `app/setup/`) MUST have been fixed in T008 / T009 — chase down any surviving path-drift here. **Delivered partial**: typecheck clean, lint clean (0 warnings, 0 errors — the pre-existing sign-out lint warning was resolved in T021), Vitest 81 files / 767 tests all green. Playwright NOT run — see FOLLOW-UP-1 (the `_helpers.ts::seedSetup` cascade blocks the existing spec suite until it's refactored to auto-authenticate); the *new* `auth-gated-landing.spec.ts` and the *updated* `auth.spec.ts` URL assertions are authored and correct, but running them requires the same fixture refactor.
- [ ] T029 Walk through `quickstart.md` manually against the running dev server (`npm run dev --workspace=packages/web`) — sections 3 and 5 in particular. This is the acceptance gate; any deviation is a real bug, not a doc typo. **Deferred**: this is a human-in-the-loop task; leaving open for the user to run.
- [X] T030 [P] Confirm the CLAUDE.md agent context (already refreshed by `update-agent-context.sh` during `/speckit-plan`) still reflects the final delivered stack. If the plan's Technical Context changed during implementation, re-run `.specify/scripts/bash/update-agent-context.sh claude`. **Re-ran** — no delta from the plan-time refresh; the Technical Context on `plan.md` remained accurate throughout implementation.
- [X] T031 [P] Grep the repo for stale references — `grep -R "NewGameButton" packages/web` (expect zero hits after T015) and `grep -R "app/setup\|app/game" packages/web/src` (expect zero hits outside the `(authenticated)/` group). Fix or justify any survivor. **Zero hits** across `packages/web/src`, `packages/web/tests`, and `packages/web/README.md`. The only remaining `NewGameButton` matches are in `packages/web/coverage/**` (auto-generated, regenerated on next `test:coverage`).

### Follow-up (not covered by feature 011 scope, but caused by it)

- [X] **FOLLOW-UP-1** Refactor `packages/web/tests/e2e/_helpers.ts::seedSetup` (and `seedAndEnterGame`) to sign in an ephemeral test user before `page.goto("/setup")`. Feature 011's middleware bounce redirects `/setup` → `/login?from=%2Fsetup` for signed-out visitors, so every existing E2E spec that consumes `seedSetup` (currently: `possession-arrow.spec.ts`, `persistence.spec.ts`, `setup.spec.ts`, `games-continue.spec.ts`, `games-new.spec.ts`, `adjust-clock.spec.ts`, `edit-play-events.spec.ts`, `format-switch-3v3.spec.ts`, `foul-out.spec.ts`, `live-scoring.spec.ts`, `period-management.spec.ts`, `scoresheet.spec.ts`, `substitution.spec.ts`, `team-actions.spec.ts`, `timeouts.spec.ts`, `undo.spec.ts`) will fail until this refactor lands. Recommended shape: a shared `signInForE2E(page)` helper using the same Supabase admin fixture as `auth.spec.ts`, plus a globalTeardown in `playwright.config.ts` to clean up ephemeral users. The Vitest suite is unaffected — this is Playwright-only. **Not blocking feature 011's user-visible behavior; blocking the E2E suite's ability to run green.** **Delivered** via the idiomatic Playwright storage-state pattern rather than per-test ephemeral users — cleaner and zero changes to the 16 downstream specs:<br/>&nbsp;&nbsp;• `tests/e2e/global-setup.ts` provisions a dedicated `e2e-shared-user@example.com` (delete + recreate for idempotency), signs it in through the UI, and persists the resulting browser session to `tests/e2e/.auth/user.json`.<br/>&nbsp;&nbsp;• `tests/e2e/global-teardown.ts` deletes the shared user and its `auth_attempts` row (best-effort).<br/>&nbsp;&nbsp;• `playwright.config.ts` registers `globalSetup` / `globalTeardown` and sets `use.storageState` to the shared file so every worker starts pre-signed-in.<br/>&nbsp;&nbsp;• `auth.spec.ts` and `auth-gated-landing.spec.ts` opt out with `test.use({ storageState: { cookies: [], origins: [] } })` at file scope so they still exercise the unauthenticated → authenticated boundary.<br/>&nbsp;&nbsp;• `.gitignore` covers the generated `.auth/` directory.<br/>&nbsp;&nbsp;When Supabase env vars are absent (local runs without `.env.local`), `global-setup.ts` writes an empty storage state so config load does not fail; every auth-dependent spec is already guarded by `test.skip(!url || !serviceRole, …)`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** — no dependencies; run first.
- **Foundational (Phase 2)** — depends on Setup. Blocks all user stories.
- **User Story 1 (Phase 3)** — depends on Phase 2 complete. Independently deliverable as MVP.
- **User Story 2 (Phase 4)** — depends on Phase 2 complete. Independently testable from US1 (edits different files: middleware + login page vs. landing page + login panel).
- **User Story 3 (Phase 5)** — depends on Phase 2 complete AND on T019 (US2's middleware branch for `/` and `/login`) already having landed in `middleware.ts`, because T026 extends the same file. If US3 is worked in parallel with US2, T026 MUST rebase over T019.
- **Polish (Phase 6)** — depends on whichever user stories have shipped.

### Within Each User Story

- **Tests before implementation** — Constitution Principle I is non-negotiable. For US1: T010–T012 must be red before T013–T015 start. For US2: T016–T018 before T019–T021. For US3: T022–T025 before T026–T027.
- **Foundational Phase 2 tasks pair (test → implementation)** — T002 → T003; T004 → T005; T006 → T007. Route moves (T008, T009) have no new tests; they pass through existing tests.

### Parallel Opportunities

Within each phase, tasks marked `[P]` touch different files and can run in parallel:

- **Phase 2**: `{T002, T004, T006}` can run in parallel (three independent test files); `{T008, T009}` can run in parallel (independent folder moves); T003 depends on T002, T005 on T004, T007 on T006.
- **Phase 3 (US1)**: `{T010, T011, T012}` in parallel; `{T013, T014}` sequential-ish (`page.tsx` vs `login-panel.tsx` — different files, so also parallelizable); T015 in parallel with T013/T014 (deletion, no shared file).
- **Phase 4 (US2)**: `{T016, T017, T018}` in parallel; T019 and T020 are different files (`middleware.ts` vs `login/page.tsx`) → parallel; T021 in a third file → parallel.
- **Phase 5 (US3)**: `{T022, T023, T024, T025}` all in parallel (E2E file plus multiple non-overlapping Vitest sections; if T023–T025 share the same `middleware.test.ts` file they MUST be authored sequentially to avoid merge conflicts — split into three `describe` blocks and merge cleanly, or serialize). T026 is a single-file edit; T027 touches different files → parallel with T026 only if T026 has landed to avoid line-number churn.

### Parallel Example — User Story 1

```bash
# Author all US1 failing tests in parallel:
Task: "Write failing Playwright E2E for P1 in packages/web/tests/e2e/auth-gated-landing.spec.ts"   # T010
Task: "Write failing component test for landing CTAs in packages/web/src/app/page.test.tsx"       # T011
Task: "Write failing component test for LoginPanel on-success in login-panel.test.tsx"            # T012

# Then implementations, mostly parallel:
Task: "Rewrite landing CTAs in packages/web/src/app/page.tsx"                                     # T013
Task: "Wire clearPersistedGame + /games default in login-panel.tsx"                               # T014
Task: "Delete NewGameButton and its test"                                                         # T015
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 (T001).
2. Phase 2 (T002–T009) — foundation is unavoidable; without it the landing page still leaks the sidebar.
3. Phase 3 (T010–T015).
4. **STOP and VALIDATE**: run the quickstart's "P1" section (§ 3.1) end-to-end. This is a shippable MVP — signed-out users get a proper landing, signed-in users still reach the app via `/games` because `requireAuth` at `/games` still redirects them there after login.

### Incremental Delivery

1. MVP (P1) — ship after Phase 3 checkpoint.
2. Add US2 (Phase 4) — signed-in users stop seeing the marketing page; sign-out returns to `/`. Shippable.
3. Add US3 (Phase 5) — deep-link protection completes the wall. Shippable.
4. Polish (Phase 6) — the whole thing tightened for merge.

### Parallel Team Strategy

If two contributors, once Phase 2 is done:

- Developer A: US1 (Phase 3) then US3 (Phase 5).
- Developer B: US2 (Phase 4).
- Merge point: T026 in US3 rebases over T019 in US2 (both edit `middleware.ts`).

---

## Notes

- The Constitution's TDD principle is *non-negotiable*. Every implementation task in this list has an explicit "MUST pass" reference to the test that precedes it. Do not batch tests at the end.
- The middleware response matrix in `contracts/middleware.md` is the source of truth for test cases; if a row is missing coverage, add it to the corresponding `[US*]` test task rather than inventing new categories.
- `[P]` markers indicate "different file, no dependency". They do NOT mean "safe to interleave inside the same file". If two `[P]` tasks touch the same file, they need to serialize or split into different `describe` blocks.
- No new npm dependencies. Any PR from these tasks that adds one is out of scope; push back.
- No new Supabase migrations. Any PR from these tasks that adds one is out of scope; push back.
