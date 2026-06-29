---

description: "Task list for feature 007-possession-arrow"

---

# Tasks: Possession Arrow

**Input**: Design documents from `/specs/007-possession-arrow/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: MANDATORY per Constitution Principle I (Test-Driven Development, NON-NEGOTIABLE). Every story phase below includes failing-tests tasks that MUST be authored AND observed failing BEFORE any implementation task in that phase is started. Coverage MUST NOT regress on `main`.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested, demoed, and shipped independently. The MVP is User Story 1 alone — the toggle (US2) and the persistence wiring (US3) layer in additional value but the P1 interaction is fully demoable without them.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: Which user story this task belongs to (`[US1]`, `[US2]`, `[US3]`)
- Each task description includes the exact file path to touch

## Path Conventions

This feature lives in two existing packages of the monorepo:

- **Domain types & constants**: `packages/core/src/`
- **Web app (Next.js, components, store, tests)**: `packages/web/src/` and `packages/web/tests/`

No new packages are introduced.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the working environment. No new dependencies, no new tooling — the project is already initialized.

- [X] T001 Confirm working tree is clean and branch is `007-possession-arrow` by running `git status` and `git branch --show-current` from the repo root.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core type and store-shape changes that **every** user story depends on. The literal-union type, the new `GameSettings` field, the new `GameState` field, and the format-driven defaults all live here. No story-specific behavior is delivered in this phase.

**⚠️ CRITICAL**: No user-story phase below can begin until this phase is complete and `npm run typecheck` is green.

### Tests for Foundational layer (MANDATORY per Constitution Principle I) ⚠️

> **NOTE: Write these tests FIRST and observe them FAIL before any implementation task in this phase.**

- [X] T002 [P] Author failing Vitest assertions that `DEFAULT_SETTINGS['5v5'].possessionArrowEnabled === true` and `DEFAULT_SETTINGS['3v3'].possessionArrowEnabled === false` in a new file `packages/core/src/constants.test.ts` (use the same import + Vitest patterns as `packages/core/src/stats.test.ts`).
- [X] T003 [P] Extend `packages/web/src/lib/store.test.ts` with failing assertions that the store's initial state has `possessionArrow === 'unset'`, and that `resetAll()` and `prepareGame()` each reset `possessionArrow` to `'unset'` after it has been set to `'home'`/`'away'`. Use the unwrapped `createGameStore()` factory the existing test suite already uses to bypass the `persist` middleware.

### Implementation for Foundational layer

- [X] T004 Add the `PossessionArrowDirection` literal-union type (`'unset' | 'home' | 'away'`) AND the new `possessionArrowEnabled: boolean` field on the `GameSettings` interface in `packages/core/src/types.ts` (next to the existing `overtimeEnabled` field; include the JSDoc described in [data-model.md](./data-model.md)). Re-export `PossessionArrowDirection` from `packages/core/src/index.ts`.
- [X] T005 Update `DEFAULT_SETTINGS` in `packages/core/src/constants.ts`: set `possessionArrowEnabled: true` inside the `"5v5"` block and `possessionArrowEnabled: false` inside the `"3v3"` block (see [contracts/settings-default-cascade.md](./contracts/settings-default-cascade.md)). This makes T002 pass.
- [X] T006 Extend the Zustand `GameState` interface in `packages/web/src/lib/store.ts` with `possessionArrow: PossessionArrowDirection`. Initialize the field to `'unset'` in (a) the initial state literal, (b) the `resetAll()` action body, and (c) the `prepareGame()` action body. Import `PossessionArrowDirection` from `@thestats/core`. This makes T003 pass.
- [X] T007 [P] Run `npm run typecheck` and update every other `GameSettings` construction site (test fixtures, mock factories, `Storybook` stories, etc.) discovered by the compiler to include the new `possessionArrowEnabled` field. Most call sites already cascade from `DEFAULT_SETTINGS` and need no change — this task is the explicit sweep so no shape error leaks into later phases.

**Checkpoint**: `npm run typecheck` is green; `npm run test --workspace packages/core` and `npm run test --workspace packages/web -- store.test` are green for the foundational tests. All three user stories can now be worked on in parallel (if staffed).

---

## Phase 3: User Story 1 - Scorekeeper sees and flips the possession arrow during the game (Priority: P1) 🎯 MVP

**Goal**: With the toggle ON (the 5v5 default established in Phase 2), the live game screen renders a tap-to-flip alternating-possession arrow indicator beside the clock. Taps cycle `unset → home → away → home → away …`. The clock, score, period, fouls, timeouts, and play-by-play log are unaffected. When the game is `finished`, the indicator is dimmed and non-interactive.

**Independent Test**: Start a 5v5 game with default settings. Confirm the indicator is visible beside the clock in the unset state. Tap three times and verify the direction cycle `unset → home → away → home`. Drive the game to `finished` and confirm the indicator dims and ignores taps. (Story is demoable without US2 because the default is ON, and without US3 because the in-memory state is sufficient for a no-refresh demo.)

### Tests for User Story 1 (MANDATORY per Constitution Principle I) ⚠️

> **NOTE: Write these tests FIRST and observe them FAIL before any implementation task in this story is started.**

- [X] T008 [P] [US1] Author failing component tests in `packages/web/src/components/game/PossessionArrow.test.tsx` covering all 8 cases from [contracts/possession-arrow-component.md](./contracts/possession-arrow-component.md) — three rendered states (`unset`/`home`/`away`) with correct `aria-label` and visual class signal; `onCycle` fires on click, Enter, and Space; `disabled` suppresses `onCycle` and sets `aria-disabled="true"` with reduced-opacity class; minimum 44×44 touch target; `className` prop merges into root. Use `@testing-library/react` + `@testing-library/user-event` consistent with `Button.test.tsx`.
- [X] T009 [P] [US1] Extend `packages/web/src/lib/store.test.ts` with the 6 cyclePossessionArrow assertions from [contracts/store-cycle-action.md](./contracts/store-cycle-action.md) — `unset → home`, `home → away`, `away → home`, exhaustive 10-tap test never returns to `'unset'`, and a "no other field mutates" snapshot assertion. Use `createGameStore()` (unwrapped). These tests will fail because the action does not exist yet.
- [X] T010 [P] [US1] Author a new failing Playwright E2E `packages/web/tests/e2e/possession-arrow.spec.ts` covering US1 acceptance scenarios: (a) after starting a default 5v5 game via the existing `seedAndEnterGame` helper, the indicator with `aria-label="Possession arrow: unset"` is visible; (b) clicking it cycles the `aria-label` through `home`, `away`, `home`; (c) the visible clock value, scoreboard, and play-by-play row count are unchanged across the cycle. Follow the patterns in `live-scoring.spec.ts`.

### Implementation for User Story 1

- [X] T011 [P] [US1] Implement the reusable `<PossessionArrow>` component in `packages/web/src/components/game/PossessionArrow.tsx` per [contracts/possession-arrow-component.md](./contracts/possession-arrow-component.md). Props in / JSX out — no Zustand subscriptions, no side-effects beyond invoking `onCycle`. Use Unicode `◀`/`▶` glyphs, Tailwind tokens already in the design system, and the existing `cn` helper. Native `<button type="button">` for keyboard support. This makes T008 pass.
- [X] T012 [US1] Implement the `cyclePossessionArrow` action on the Zustand store in `packages/web/src/lib/store.ts` per [contracts/store-cycle-action.md](./contracts/store-cycle-action.md). Single `set()` call that branches on the current `possessionArrow` value per the FR-006 cycle table; touches no other field. Export the action through the existing store-actions interface. This makes T009 pass.
- [X] T013 [US1] Mount `<PossessionArrow>` inside the center column of `packages/web/src/components/game/Scoreboard.tsx`, directly below `<ClockPanel />` (inside the same `flex-col` container as the period eyebrow and the clock). Subscribe to `settings.possessionArrowEnabled`, `possessionArrow`, and `status` from the store. Render only when `settings.possessionArrowEnabled === true`. Wire `direction={possessionArrow}`, `onCycle={cyclePossessionArrow}`, and `disabled={status === 'finished'}`. This makes T010 pass.

**Checkpoint**: User Story 1 is fully functional and independently testable. The MVP can be demoed: start a 5v5 game → tap the indicator → see the direction cycle. `npm run test --workspace packages/web -- PossessionArrow store` and `npm run test:e2e -- possession-arrow` are green.

---

## Phase 4: User Story 2 - Scorekeeper toggles the feature on or off at game setup (Priority: P2)

**Goal**: The setup page exposes a `Possession arrow` On/Off toggle in the Game Settings row, defaulted On for 5v5 and Off for 3v3 (already wired in Phase 2). The toggle is the same two-button inline pattern as `OvertimeToggle` (feature 003). Setting Off hides the indicator on the live screen; setting On (re-)shows it.

**Independent Test**: From setup, with format 5v5, confirm `On` is the active button in the Possession arrow row. Switch format to 3v3 and confirm the active button flips to `Off`. Manually click `On` while in 3v3 and confirm the live screen renders the indicator after Start Game. Reverse: click `Off` in 5v5, confirm the live screen renders without the indicator.

### Tests for User Story 2 (MANDATORY per Constitution Principle I) ⚠️

> **NOTE: Write these tests FIRST and observe them FAIL before any implementation task in this story is started.**

- [X] T014 [P] [US2] Extend `packages/web/src/app/setup/page.test.tsx` with the 5 assertions from [contracts/settings-default-cascade.md](./contracts/settings-default-cascade.md) — 5v5 default renders `On` `aria-pressed="true"`; 3v3 default renders `Off` `aria-pressed="true"`; clicking `Off` in 5v5 flips `settings.possessionArrowEnabled` to `false`; clicking `On` in 3v3 flips it to `true`; format-cascade test (5v5 → 3v3 → 5v5) restores the default. Use the existing test setup patterns from the file.
- [X] T015 [P] [US2] Extend `packages/web/tests/e2e/possession-arrow.spec.ts` with US2 acceptance scenarios: (a) seeding a 5v5 game shows the indicator on the live screen; (b) seeding a 3v3 game with the default does NOT render any element matching `aria-label^="Possession arrow"`; (c) flipping the toggle to `On` in 3v3 setup and continuing renders the indicator.

### Implementation for User Story 2

- [X] T016 [US2] Add a `PossessionArrowToggle` inline component (modeled exactly after `OvertimeToggle` at `setup/page.tsx:258-285`) plus a Game Settings row labeled `Possession arrow` in `packages/web/src/app/setup/page.tsx`. Place the row immediately after the existing `Overtime` row for visual continuity. Wire each button's `onClick` to `setSettings({ possessionArrowEnabled: true })` / `setSettings({ possessionArrowEnabled: false })`. This makes T014 and T015 pass.

**Checkpoint**: User Stories 1 AND 2 work independently. Scorekeeper can opt in/out at setup; the live indicator honors the choice.

---

## Phase 5: User Story 3 - Possession-arrow state persists with the rest of the game (Priority: P3)

**Goal**: A refresh of the browser during an in-progress game with the toggle on restores the possession-arrow direction to the exact value it held at the time of the last state save. Navigation away and back also preserves the direction. New games start with `'unset'` regardless of prior state. This layers on top of the feature-006 persistence machinery — the only change is including `possessionArrow` in the existing `partialize` selection.

**Independent Test**: With US1 (and ideally US2) in place, start a game, flip the arrow to `away`, refresh the page, and verify the indicator restores pointing `away`. Then start a fresh game and verify the indicator is back to `unset`.

### Tests for User Story 3 (MANDATORY per Constitution Principle I) ⚠️

> **NOTE: Write these tests FIRST and observe them FAIL before any implementation task in this story is started.**

- [X] T017 [P] [US3] Extend `packages/web/src/lib/store.test.ts` with: (a) a partialize round-trip test that sets `possessionArrow` to `'away'`, runs the persist selector, parses the JSON, and asserts the key is present with the correct value; (b) a rehydration test that hands the store a payload **without** the `possessionArrow` key and asserts the restored state has `possessionArrow === 'unset'` (per Decision 6 in [research.md](./research.md)).
- [X] T018 [P] [US3] Extend `packages/web/tests/e2e/possession-arrow.spec.ts` with a refresh scenario: in a 5v5 game, tap the indicator twice to land on `away`, call `page.reload()`, wait for the live screen to restore, assert `aria-label="Possession arrow: away"`. Follow the refresh patterns established by `tests/e2e/persistence.spec.ts`.

### Implementation for User Story 3

- [X] T019 [US3] Add `'possessionArrow'` to the `partialize` selection in the `persist` middleware setup in `packages/web/src/lib/store.ts` (the array currently includes `homeTeam, awayTeam, settings, status, currentPeriod, events, possession, onCourt`). No version bump — this is a backward-compatible additive field per Decision 6. This makes T017 and T018 pass.

**Checkpoint**: All three user stories are independently functional. Full feature is shippable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Constitution gates and final verification across all stories.

- [X] T020 [P] Run `npm run typecheck` from repo root; resolve any remaining shape errors. Required to pass Constitution Principle II.
- [X] T021 [P] Run `npm run lint` from repo root; resolve warnings without suppressing them. Required to pass Constitution Principle V.
- [X] T022 [P] Run `npm run test` (Vitest) from repo root; all suites green and coverage non-regressing. Required to pass Constitution Principle I.
- [X] T023 [P] Run `npm run test:e2e` (Playwright) from repo root; the new `possession-arrow.spec.ts` suite plus all existing suites pass. Required to pass Constitution Principle I.
- [ ] T024 Walk the [quickstart.md](./quickstart.md) manual verification flow end-to-end (scenarios 1–5) in a local dev server (`npm run dev --workspace packages/web`). Confirm: 5v5 visible + cycle, 3v3 hidden by default, refresh restores direction, finished-game dims correctly, Stats / Scoresheet pages do NOT show the arrow (FR-014).
- [ ] T025 Capture a single mobile-width (375 px) screenshot of the live scoreboard with the indicator visible (for the PR description). Confirm the 44×44 pt touch target remains comfortably tappable per Constitution Principle IV.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies; can start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1. **Blocks all three user-story phases**.
- **Phase 3 (US1, P1)**: Depends on Phase 2.
- **Phase 4 (US2, P2)**: Depends on Phase 2. Independent of US1 — can be staffed in parallel with US1 once Phase 2 ships.
- **Phase 5 (US3, P3)**: Depends on Phase 2. Independent of US1/US2 at the data layer; manual demo of US3 reads better once US1 is in place but is not blocked on it.
- **Phase 6 (Polish)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Independent — relies only on Foundational. Demoable as the MVP.
- **US2 (P2)**: Independent — relies only on Foundational. Adds the setup toggle on top of the default-driven gating.
- **US3 (P3)**: Independent — relies only on Foundational. Adds one line to `partialize`.

### Within Each User Story

- Per Constitution Principle I (TDD, NON-NEGOTIABLE): every test task MUST be authored AND observed failing BEFORE the corresponding implementation task in the same phase begins.
- Within a phase: parallel `[P]` tasks may run concurrently; non-`[P]` tasks must follow the tasks they implicitly depend on (the test tasks, or a foundational sibling task in the same file).

### Parallel Opportunities

- T002 + T003 (foundational tests in different files) → parallel.
- T007 sweep runs after T004/T005/T006 land.
- T008 + T009 + T010 (US1 tests, three different files) → parallel.
- T011 (component) + T012 (store action) → parallel (different files, no shared mutation).
- T014 + T015 (US2 tests, different files) → parallel.
- T017 + T018 (US3 tests, different files) → parallel.
- T020 + T021 + T022 + T023 (independent quality gates) → parallel.

---

## Parallel Example: User Story 1

```bash
# After Phase 2 is green, author all three US1 failing tests in parallel:
Task: "Author <PossessionArrow> component tests in packages/web/src/components/game/PossessionArrow.test.tsx"
Task: "Extend store.test.ts with cyclePossessionArrow assertions in packages/web/src/lib/store.test.ts"
Task: "Author Playwright E2E for tap cycle in packages/web/tests/e2e/possession-arrow.spec.ts"

# Confirm all three fail, then implement the two parallel parts:
Task: "Implement <PossessionArrow> in packages/web/src/components/game/PossessionArrow.tsx"
Task: "Implement cyclePossessionArrow action in packages/web/src/lib/store.ts"

# Finally, the Scoreboard integration (depends on both above):
Task: "Mount <PossessionArrow> in packages/web/src/components/game/Scoreboard.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (`git status` confirmation).
2. Complete Phase 2: Foundational — types, defaults, store field, sweep typecheck.
3. Complete Phase 3: User Story 1 — failing tests → component → store action → Scoreboard mount.
4. **STOP and VALIDATE**: Tap-to-cycle works in a default 5v5 game. Demo to stakeholders.
5. Ship MVP or continue.

### Incremental Delivery

1. Phase 1 + Phase 2 → Foundation green.
2. Phase 3 (US1) → Tap-to-flip works → Demo / Ship MVP.
3. Phase 4 (US2) → Setup toggle works → Demo / Ship.
4. Phase 5 (US3) → Refresh-survives works → Demo / Ship.
5. Phase 6 (Polish) → Constitution gates + quickstart walk → PR open.

### Parallel Team Strategy

With multiple developers post-Phase 2:

- Dev A: US1 (the largest single chunk — component, store action, Scoreboard).
- Dev B: US2 (small — one inline component plus row wiring on the setup page).
- Dev C: US3 (tiny — one entry into the persist selector plus two tests).

Phase 6 polish is a single-PR sweep that merges after all three stories land.

---

## Notes

- `[P]` tasks = different files, no incomplete dependencies.
- `[Story]` label maps each task to its user story for traceability and easy independent verification.
- Every test task in this file is MANDATORY — Constitution Principle I has no opt-out.
- Verify each test fails BEFORE writing the implementation — that observation is the evidence the test actually exercises the new behavior.
- Commit after each task or each logically tight pair (test → implementation). Use a descriptive commit message tied to the task ID.
- Stop at any phase checkpoint to validate the story works independently before moving on.
- Avoid: implementing before the failing test exists; mixing US2 toggle changes into US1 commits; changing the persist schema version (Decision 6 — additive only).
