---

description: "Task list for Preserve Game State on Browser Refresh"
---

# Tasks: Preserve Game State on Browser Refresh

**Input**: Design documents from `/specs/006-preserve-game-state-on-refresh/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: MANDATORY per Constitution Principle I (Test-Driven Development, NON-NEGOTIABLE). Every test task MUST be authored and observed FAILING before the corresponding implementation task is started.

**Organization**: Grouped by user story. Phase 2 (Foundational) blocks both stories. Phases 3 (US1) and 4 (US2) are independent of each other after Phase 2 completes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file from sibling tasks, no incomplete-task dependency — safe to parallelize.
- **[Story]**: Maps task to its user story (US1 / US2). Setup / Foundational / Polish phases carry no story tag.
- Paths are absolute-style from the repo root (`packages/web/...`).

## Path Conventions

This feature lives entirely in the existing `packages/web/` Next.js workspace.
- Source: `packages/web/src/`
- Vitest unit/component tests: colocated `*.test.ts(x)` next to source, plus `packages/web/tests/integration/`
- Playwright E2E: `packages/web/tests/e2e/`

---

## Phase 1: Setup

**Purpose**: Confirm the toolchain is ready. No new runtime dependencies; the design uses Zustand 5's bundled `persist`/`createJSONStorage` middleware.

- [X] T001 Verify `zustand/middleware` ships `persist` and `createJSONStorage` in the installed Zustand 5 — quick import check from `packages/web` (no `package.json` change expected)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the storage module, the store-rehydration wiring, and the availability context that both US1 and US2 depend on.

**⚠️ CRITICAL**: No US1 or US2 work may begin until this phase is complete.

### Tests for Foundational (MANDATORY per Constitution Principle I) ⚠️

> Write these tests FIRST and observe them FAIL before any foundational implementation task starts.

- [X] T002 [P] Author failing Vitest tests for the persistence module covering: `isStorageAvailable()` returns `false` when `localStorage.setItem` throws `SecurityError`; `parseGameRecord` accepts a valid `schemaVersion: 1` payload and rejects unknown schemaVersion, missing fields, bad `GameStatus`, and non-array events; `clearPersistedGame()` removes both keys and is idempotent; `read/writeClockCheckpoint` round-trips; `notifyRecoveryFailed` invokes subscribed callbacks in `packages/web/src/lib/persistence.test.ts`
- [X] T003 [P] Author failing Vitest tests for store rehydration covering: `partialize` excludes `clockSeconds`, `breakSeconds`, and `clockRunning`; `merge` restores all partialized fields, reads the clock checkpoint into `clockSeconds`/`breakSeconds`, and forces `clockRunning: false`; corrupted persisted payload triggers `clearPersistedGame()` and falls back to initial state; `onRehydrateStorage` re-asserts `clockRunning: false` in `packages/web/src/lib/storeRehydration.test.ts`
- [X] T004 [P] Author failing Vitest + Testing Library tests for the storage-availability React context covering: provider exposes `localStorageAvailable` from the persistence probe; subscribes to `notifyRecoveryFailed` and flips `recoveryFailed` to `true`; `dismissRecoveryFailed` flips it back to `false` in `packages/web/src/lib/storageAvailability.test.tsx`

### Implementation for Foundational

- [X] T005 Implement `lib/persistence.ts` per [contracts/persistence-module.md](./contracts/persistence-module.md) — exports `GAME_STORAGE_KEY`, `CLOCK_CHECKPOINT_KEY`, types `PersistedGameRecord` and `ClockCheckpoint`, `isStorageAvailable()`, `parseGameRecord(raw: unknown): PersistedGameRecord | null` (no `as` casts; guard `unknown`), `readClockCheckpoint()`, `writeClockCheckpoint()`, `clearPersistedGame()`, and a tiny pubsub pair `subscribeRecoveryFailed(cb) → unsubscribe` + `notifyRecoveryFailed()` in `packages/web/src/lib/persistence.ts`
- [X] T006 Extract a `createGameStore()` factory in `packages/web/src/lib/store.ts` that returns the unwrapped `subscribeWithSelector` store, and update the existing `packages/web/src/lib/store.test.ts` to use the factory so all current store tests continue to pass without touching `localStorage`
- [X] T007 Wrap the exported `useGameStore` with Zustand's `persist` middleware per [contracts/store-rehydration.md](./contracts/store-rehydration.md): `name: GAME_STORAGE_KEY`, `version: 1`, `storage: createJSONStorage(() => isStorageAvailable() ? localStorage : noopStorage)` with an in-memory Map-backed `noopStorage`, plus `partialize`, `merge` (delegates to `parseGameRecord` and calls `notifyRecoveryFailed()` on parse failure), and `onRehydrateStorage` in `packages/web/src/lib/store.ts`
- [X] T008 Implement the storage-availability React context provider per [data-model.md](./data-model.md) — exports `<StorageAvailabilityProvider>` and `useStorageAvailability()` hook returning `{ localStorageAvailable, recoveryFailed, dismissRecoveryFailed }`; subscribes to `subscribeRecoveryFailed` on mount in `packages/web/src/lib/storageAvailability.tsx`

**Checkpoint**: Foundation ready — US1 and US2 may now proceed in parallel.

---

## Phase 3: User Story 1 - Resume an In-Progress Game After Accidental Refresh (Priority: P1) 🎯 MVP

**Goal**: A refresh during any non-`setup` state (or mid-setup) restores the same game, with the clock and any break countdown paused within 1 second of their pre-refresh values. Storage-unavailable users are warned by a blocking modal; corrupted-record users see a dismissable banner and a clean setup screen.

**Independent Test**: Start a game with seeded rosters, record several plays, refresh the browser, and verify the live view comes back with identical events/score/period/possession/lineup and the clock paused within 1 second of its pre-refresh value. Repeat for timeout, period-break, setup, and finished states. Trigger the storage-unavailable and corrupted-record paths via DevTools to verify the modal and banner.

### Tests for User Story 1 (MANDATORY per Constitution Principle I) ⚠️

> Write these tests FIRST and observe them FAIL before any US1 implementation task.

- [X] T009 [P] [US1] Author failing Vitest tests for the clock-checkpoint hook covering: writes at most once per second while `clockRunning` is true OR status is `timeout`/`period-break`; writes immediately on `visibilitychange: hidden` and on `pagehide`; no writes when the live clock is stopped and not in a break; no writes when `isStorageAvailable()` is false in `packages/web/src/hooks/useClockCheckpoint.test.ts`
- [X] T010 [P] [US1] Author failing Vitest + Testing Library tests for `<StorageUnavailableModal />` per [contracts/storage-unavailable-modal.md](./contracts/storage-unavailable-modal.md): renders nothing when storage is available; renders an `aria-modal="true"` dialog with the title, body, and "Continue without saving" button when unavailable; clicking the button hides the modal; Escape hides it; focus moves to the button on open in `packages/web/src/components/shell/StorageUnavailableModal.test.tsx`
- [X] T011 [P] [US1] Author failing Vitest + Testing Library tests for `<RecoveryFailedBanner />`: renders nothing when `recoveryFailed` is false; renders a dismissable banner when true; clicking dismiss calls `dismissRecoveryFailed` in `packages/web/src/components/shell/RecoveryFailedBanner.test.tsx`
- [X] T012 [US1] Author failing Playwright E2E scenarios in `packages/web/tests/e2e/persistence.spec.ts` for: (A) refresh during live keeps every event/score/possession/lineup and pauses the clock within 1 second; (B) refresh during timeout/period-break keeps state and pauses the break countdown within 1 second; (C) refresh mid-setup keeps the partial roster; (D) refresh of a finished game keeps the finished view; (F) storage-unavailable modal appears and is dismissable; (G) corrupted record (set bad JSON via `page.evaluate`) falls back to empty setup with the recovery banner. Use `tests/e2e/_helpers.ts:seedAndEnterGame` for fixtures and `page.evaluate(() => localStorage.clear())` for isolation

### Implementation for User Story 1

- [X] T013 [P] [US1] Implement `useClockCheckpoint()` hook: subscribes to `clockRunning` + `status` selectors; while running or in a break state, runs a `setInterval` at 1000 ms that calls `writeClockCheckpoint({ schemaVersion: 1, clockSeconds, breakSeconds, savedAt: Date.now() })`; registers `pagehide` and `visibilitychange` listeners that write synchronously on hidden; cleans up listeners and interval on unmount in `packages/web/src/hooks/useClockCheckpoint.ts`
- [X] T014 [P] [US1] Implement `<StorageUnavailableModal />` per [contracts/storage-unavailable-modal.md](./contracts/storage-unavailable-modal.md): reads `localStorageAvailable` from `useStorageAvailability()`; renders a focus-trapped `role="dialog"` overlay with backdrop, title, body copy explaining that saves are disabled, and a single "Continue without saving" primary button; keeps a per-mount `dismissed` state so re-mount during the same page lifetime does not re-show it; Escape key dismisses in `packages/web/src/components/shell/StorageUnavailableModal.tsx`
- [X] T015 [P] [US1] Implement `<RecoveryFailedBanner />`: reads `recoveryFailed` + `dismissRecoveryFailed` from `useStorageAvailability()`; renders a non-blocking dismissable banner above the page content with the message "Your previous game could not be recovered." in `packages/web/src/components/shell/RecoveryFailedBanner.tsx`
- [X] T016 [US1] Mount `useClockCheckpoint()` in the game layout alongside the existing `useGameClock()` in `packages/web/src/app/game/layout.tsx`
- [X] T017 [US1] Wrap the root layout's children with `<StorageAvailabilityProvider>` and render `<StorageUnavailableModal />` and `<RecoveryFailedBanner />` at the top of the provider's children in `packages/web/src/app/layout.tsx`

**Checkpoint**: User Story 1 is independently functional and meets all SC-001/SC-002/SC-003/SC-005 measurable outcomes.

---

## Phase 4: User Story 2 - Start a New Game After a Previous One (Priority: P2)

**Goal**: The home page's "New Game →" entry point wipes the persisted game (both localStorage keys) and resets the in-memory store before navigating to `/setup`, so a subsequent refresh keeps the user on an empty setup screen instead of resurrecting the prior game.

**Independent Test**: Pre-populate `localStorage.thestats.game.v1` with any valid record (or play a partial game), click "New Game →" on the home page, confirm both `thestats.game.v1` and `thestats.clock.v1` are gone and `/setup` is empty; refresh and confirm the empty setup view persists.

### Tests for User Story 2 (MANDATORY per Constitution Principle I) ⚠️

> Write these tests FIRST and observe them FAIL before any US2 implementation task.

- [X] T018 [P] [US2] Author failing Vitest + Testing Library tests for `<NewGameButton />`: clicking the button calls `clearPersistedGame()` (via a spy on the persistence module), then calls the store's `resetAll()`, then calls `router.push("/setup")` — exact ordering verified via mock call order in `packages/web/src/components/home/NewGameButton.test.tsx`
- [X] T019 [US2] Append failing US2 Playwright scenarios to `packages/web/tests/e2e/persistence.spec.ts`: (E1) from a live game, navigate to `/`, click "New Game →", verify both localStorage keys are absent and `/setup` is empty; (E2) immediately refresh and verify `/setup` still empty and localStorage still clear

### Implementation for User Story 2

- [X] T020 [US2] Implement `<NewGameButton />` Client Component (`"use client"`): reuses the existing `<Button>` primitive; onClick calls `clearPersistedGame()` from `lib/persistence`, then `useGameStore.getState().resetAll()`, then `useRouter().push("/setup")` in `packages/web/src/components/home/NewGameButton.tsx`
- [X] T021 [US2] Replace the existing `<Link href="/setup"><Button>New Game →</Button></Link>` block with `<NewGameButton>New Game →</NewGameButton>` in `packages/web/src/app/page.tsx`

**Checkpoint**: User Story 2 is independently functional and meets SC-006.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Verify the aggregate quality gates and walk the manual scenarios from quickstart.

- [X] T022 Run `npm run test:all` from the repo root and confirm `typecheck`, `lint`, `test:coverage` (no coverage regression per Principle I), and `test:e2e` are all green
- [X] T023 Walk through every scenario in [quickstart.md](./quickstart.md) (A–G) on `npm run dev` and confirm the observed behavior matches the description; note any UX polish items as follow-up issues rather than expanding scope

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No prior dependency
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS US1 and US2
- **Phase 3 (US1)**: Depends on Phase 2 — independent of US2
- **Phase 4 (US2)**: Depends on Phase 2 — independent of US1
- **Phase 5 (Polish)**: Depends on the user stories being delivered

### Within Phase 2

- T002, T003, T004 are parallelizable (different files, all failing tests)
- T005 unblocks after T002
- T006 unblocks after T003
- T007 depends on T005 (uses `persistence`) and T006 (uses `createGameStore` factory)
- T008 depends on T004 and T005 (subscribes to `notifyRecoveryFailed`)

### Within Phase 3 (US1)

- T009, T010, T011 are parallelizable (different test files)
- T012 (E2E) can be authored in parallel with T009–T011 — different layer, different file
- T013 unblocks after T009; T014 after T010; T015 after T011
- T016 depends on T013
- T017 depends on T014, T015, and T008 (uses provider)
- All US1 tests (T009–T012) must be observed failing before T013–T017 begin

### Within Phase 4 (US2)

- T018 and T019 are parallelizable (different files)
- T020 depends on T018 (and T005 — uses `clearPersistedGame`)
- T021 depends on T020

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Author all three failing foundational test files in parallel:
Task: T002 — packages/web/src/lib/persistence.test.ts
Task: T003 — packages/web/src/lib/storeRehydration.test.ts
Task: T004 — packages/web/src/lib/storageAvailability.test.tsx
```

## Parallel Example: Phase 3 (US1)

```bash
# Author all four failing US1 test files in parallel:
Task: T009 — packages/web/src/hooks/useClockCheckpoint.test.ts
Task: T010 — packages/web/src/components/shell/StorageUnavailableModal.test.tsx
Task: T011 — packages/web/src/components/shell/RecoveryFailedBanner.test.tsx
Task: T012 — packages/web/tests/e2e/persistence.spec.ts

# Once they all fail and Phase 2 is done, implement the trio in parallel:
Task: T013 — packages/web/src/hooks/useClockCheckpoint.ts
Task: T014 — packages/web/src/components/shell/StorageUnavailableModal.tsx
Task: T015 — packages/web/src/components/shell/RecoveryFailedBanner.tsx
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1 → Phase 2 → Phase 3 → STOP and validate Scenarios A–D + F + G from [quickstart.md](./quickstart.md).
2. Ship. The user can now safely use the app through a full game without losing work on refresh. The "New Game" flow still works via the existing Setup-page Reset button + manual `/setup` navigation as a stopgap.

### Incremental Delivery

1. Foundation (Phase 1 + Phase 2) → no user-visible change yet, but the store now persists.
2. US1 (Phase 3) → refresh recovery + storage-unavailable modal + recovery banner. **Ship MVP here.**
3. US2 (Phase 4) → "New Game" wipes correctly. Ship.
4. Polish (Phase 5) → final gate.

### Solo Strategy (most likely for this project)

Single developer, single branch. Land tasks in numeric order, committing after each (or at logical groups: tests-fail, then tests-green). Use the Phase 2/3 parallel markers to choose what to scaffold next, not to truly parallelize work.

---

## Notes

- The store's existing unit tests (in `packages/web/src/lib/store.test.ts`) must continue to pass after T006 — they use the unwrapped `createGameStore()` factory and are not coupled to `localStorage`.
- Playwright tests must isolate via `page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); })` in a `beforeEach`.
- Do NOT persist the storage-unavailable acknowledgment anywhere — it is per-page-lifetime by design (see [contracts/storage-unavailable-modal.md](./contracts/storage-unavailable-modal.md)).
- Do NOT add wall-clock catch-up of the game clock on rehydrate — it is explicitly Out of Scope in the spec. The 1-Hz checkpoint + `pagehide`/`visibilitychange` final write is the only mechanism.
- Coverage threshold (`vitest.config.ts`) currently sits at 95% for `src/lib/**`. New `lib/persistence.ts` and `lib/storageAvailability.tsx` must clear that bar; budget the tests accordingly.
