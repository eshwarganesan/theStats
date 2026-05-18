---

description: "Task list for feature 002-timeout-break-timer"
---

# Tasks: Timeout & Period-Break Timer

**Input**: Design documents from `/specs/002-timeout-break-timer/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/store-api.md](./contracts/store-api.md), [quickstart.md](./quickstart.md)

**Tests**: MANDATORY per Constitution Principle I (Test-Driven Development, NON-NEGOTIABLE). Every implementation task below has a paired test task that MUST be authored first and observed failing before the implementation begins.

**User constraint (from plan args)**: *Do not create any new components.* All UI changes happen by editing existing files in `packages/web/src/components/`, `packages/web/src/hooks/`, `packages/web/src/lib/`, and `packages/web/src/app/setup/`. The only new file in this feature is the setup-page test file (test files are not components and the setup page currently has no test file).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel — different files, no incomplete-task dependencies.
- **[Story]**: Maps task to its user story (`[US1]`, `[US2]`, `[US3]`). Setup, Foundational, and Polish tasks have no story label.
- All paths are absolute or `packages/web/...` relative-from-repo-root.

## Path Conventions

This is a web app inside `packages/web/`. All source paths live under `packages/web/src/` and tests live alongside their source files (Vitest convention).

---

## Phase 1: Setup

**Purpose**: Confirm the working environment is ready. No project initialization is needed — the repo, dependencies, and tooling all exist.

- [X] T001 Verify the dev environment is ready: branch is `002-timeout-break-timer`, run `cd packages/web && npm install`, run `npm test` to confirm a green baseline (267 tests passing before this feature) and `npm run typecheck` / `npm run lint` are clean.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extend the type system and constants so every user story can compile and reference the new shape. All three tasks are pure additions — no behavior changes.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Extend `GameStatus` union with the literal `"timeout"` and extend the `GameSettings` interface with three new explicit numeric fields (`timeoutSeconds`, `quarterBreakSeconds`, `halftimeBreakSeconds`, each documented as seconds) in `packages/web/src/lib/types.ts`.
- [X] T003 [P] Add the three new duration defaults to both formats in `DEFAULT_SETTINGS` (5v5: 60 / 120 / 600; 3v3: 30 / 60 / 0) in `packages/web/src/lib/constants.ts`.
- [X] T004 Add `breakSeconds: number` to the store state shape with initial value `0`, and add the action signature `endTimeout: () => void` to the store interface (no implementation yet — the action body lands in US1 under TDD). File: `packages/web/src/lib/store.ts`. Depends on T002.

**Checkpoint**: Types, defaults, and state field are in place. All three user stories can now begin in parallel.

---

## Phase 3: User Story 1 — See the timeout/break countdown on the clock (Priority: P1) 🎯 MVP

**Goal**: When a timeout is called or a period ends (non-final), the game-clock area shows a visible countdown for the configured break duration and ticks down once per second. The countdown is editable via the existing tap-to-edit input and ±1m / ±1s nudge buttons.

**Independent Test**: With the store seeded to a live game, call `recordTimeout("home")` and assert (a) `status === "timeout"`, (b) `breakSeconds === settings.timeoutSeconds`, (c) the rendered `GameClock` shows the formatted break time. End the second period of a 4-period game and assert `breakSeconds === settings.halftimeBreakSeconds`; end the first period and assert it equals `quarterBreakSeconds`.

### Tests for User Story 1 (MANDATORY per Constitution Principle I) ⚠️

> Author all four test tasks below FIRST and observe them FAIL before any T010-T014 implementation task is started.

- [X] T005 [P] [US1] Add store-level tests covering contracts **C-001 (recordTimeout sets `status: "timeout"` and seeds `breakSeconds` from settings; preserves `clockSeconds`; preserves the existing `timeout` event)**, **C-002 (`endTimeout` returns to live, clears `breakSeconds`, does not auto-start clock, emits no event, is a no-op when not in timeout)**, **C-003 (`endPeriod` seeds `breakSeconds` with halftime vs. quarter logic across periods 1/2/3/4 of a 4-period 5v5 game; 3v3 single-period game transitions to `finished` with `breakSeconds === 0`; last-regulation-to-OT uses quarter-break)**, **C-004 (`startNextPeriod` clears `breakSeconds`)**, **C-005 (`tickClock` routes to `breakSeconds` during timeout/period-break, to `clockSeconds` during live; clamps at 0)**, and **C-006 (`adjustClock` routes correctly and clamps to the 30-minute generous cap during break)** in `packages/web/src/lib/store.test.ts`. Run `npm test -- store.test` and confirm RED before proceeding.
- [X] T006 [P] [US1] Add hook tests asserting that `useGameClock` drives the RAF loop when `status === "timeout"` or `status === "period-break"` (not only when `clockRunning === true`), and that the loop stops when status returns to `"live"` with `clockRunning === false`. File: `packages/web/src/hooks/useGameClock.test.ts`. RED.
- [X] T007 [P] [US1] Add component tests asserting that `GameClock` renders `formatClock(breakSeconds)` when `status` is `"timeout"` or `"period-break"`, and `formatClock(clockSeconds)` otherwise (preserves the existing critical/muted/ink color logic). File: `packages/web/src/components/game/GameClock.test.tsx`. RED.
- [X] T008 [P] [US1] Add component tests asserting that `ClockPanel` surfaces the editor + nudge interactive surface during `status === "timeout"` and `status === "period-break"` (not just during live + paused), and that `ClockNudge` derives a generous 30-minute upper bound during break states (per `research.md` R-006). Files: `packages/web/src/components/game/ClockPanel.test.tsx` and `packages/web/src/components/game/ClockNudge.test.tsx`. RED.

### Implementation for User Story 1

> Implement only after T005–T008 are RED. Each implementation task should turn its paired tests GREEN without breaking any of the existing 267 tests.

- [X] T009 [US1] Implement store changes for contracts C-001 through C-006 in `packages/web/src/lib/store.ts`: (a) modify `recordTimeout(side)` to set `status: "timeout"`, seed `breakSeconds = settings.timeoutSeconds`, keep `clockRunning: false` and the existing event emission; (b) implement the new `endTimeout()` body — no-op unless `status === "timeout"`, otherwise set `status: "live"`, `breakSeconds: 0`, leave `clockSeconds` and `clockRunning` untouched, emit no event; (c) modify `endPeriod()` to compute `seededBreakSeconds` per `research.md` R-003 (halftime vs. quarter) and set `breakSeconds` when transitioning to `"period-break"` (set to 0 when transitioning to `"finished"`); (d) modify `startNextPeriod()` to clear `breakSeconds: 0`; (e) modify `tickClock(delta)` to decrement `breakSeconds` (clamped at 0) when `status` is `"timeout"` or `"period-break"`, otherwise preserve the existing `clockSeconds` decrement; (f) modify `adjustClock(value)` to route the clamp+set to `breakSeconds` (cap 0–1800 per R-006) during a break, otherwise preserve the existing `clockSeconds` behavior.
- [X] T010 [P] [US1] Modify `useGameClock` so the RAF loop runs when EITHER `clockRunning === true` OR `status` is `"timeout"` or `"period-break"`. File: `packages/web/src/hooks/useGameClock.ts`.
- [X] T011 [P] [US1] Modify `GameClock` to read `breakSeconds` when `status` is `"timeout"` or `"period-break"`, otherwise read `clockSeconds` (single-line ternary at the existing `formatClock(...)` site). Preserve the existing `critical` / `text-ink` / `text-ink-muted` color logic — the `critical` flag should derive from whichever value is being displayed. File: `packages/web/src/components/game/GameClock.tsx`.
- [X] T012 [P] [US1] Modify `ClockPanel` to include `status === "timeout"` and `status === "period-break"` in the `editable` predicate (currently `status === "live" && !clockRunning`). The clock area should expose the editor + nudge surface during breaks. File: `packages/web/src/components/game/ClockPanel.tsx`.
- [X] T013 [P] [US1] Modify `ClockNudge` so its `periodMax` derivation uses a 30-minute generous cap when `status` is `"timeout"` or `"period-break"`; otherwise preserve the existing per-period / overtime cap. File: `packages/web/src/components/game/ClockNudge.tsx`.

**Checkpoint**: The countdown is visible on the clock during both timeouts and period breaks, ticks down correctly, freezes at 0:00, and is editable via the existing tap-to-edit / nudge surface. The ActionPad is not yet aware of the new status — that lands in US2.

---

## Phase 4: User Story 2 — End the timeout or start the next quarter with one tap (Priority: P2)

**Goal**: While a timeout or break is in progress, the `ActionPad` shows a single primary-action button — labeled per state — that advances the game. All other ActionPad controls are hidden during the break.

**Independent Test**: Render the `ActionPad` with `status === "timeout"` and assert (a) the "End Timeout" button is the only visible button (Undo and End Period are not rendered), (b) clicking it calls `endTimeout`. Render with `status === "period-break"` at three boundaries (after period 1, after period 2, after period 4 with OT configured) and assert the button label is, respectively, `"Start Next Quarter"`, `"Start Second Half"`, `"Start Overtime"`. Verify the hint text adapts.

### Tests for User Story 2 (MANDATORY per Constitution Principle I) ⚠️

- [X] T014 [US2] Extend the existing `ActionPad` test file with cases for: timeout-state rendering (only "End Timeout" visible, tapping it invokes `endTimeout`), period-break label variants (`"Start Next Quarter"` / `"Start Second Half"` / `"Start Overtime"` based on `currentPeriod` and `settings.periods`), and the hiding of the secondary controls row (Undo + End Period) when `status` is `"timeout"` or `"period-break"`. Also update any existing assertion that hard-codes `"Start Next Period"` to use the new period-appropriate label. File: `packages/web/src/components/game/ActionPad.test.tsx`. Run and confirm RED.

### Implementation for User Story 2

- [X] T015 [US2] Modify `ActionPad` per `research.md` R-004 and R-005: (a) add a new branch in `renderClockCTA()` for `status === "timeout"` returning a primary `"End Timeout"` button wired to a new `onEndTimeout` callback (or directly to `useGameStore.getState().endTimeout` if no callback is preferred), (b) replace the hard-coded `"Start Next Period"` label in the `period-break` branch with a derived label using the inline helper `nextPeriodLabel(currentPeriod, periods)` per `data-model.md` §4, (c) wrap the secondary-controls row (`Undo` + `End Period`) so it renders only when `status` is NOT `"timeout"` or `"period-break"`, (d) add a hint-text line for `status === "timeout"` (e.g., `"Timeout — tap End Timeout to resume."`). File: `packages/web/src/components/game/ActionPad.tsx`. If a new `onEndTimeout` prop is added, also update the single caller in the game layout/page to pass it.

**Checkpoint**: The ActionPad shows a single contextual action button during timeouts and breaks. All other ActionPad controls are hidden during these states. Users can now fully exit a break through the UI.

---

## Phase 5: User Story 3 — Configure timeout and break durations in setup (Priority: P3)

**Goal**: The Game Settings section of the setup page exposes three numeric inputs (`Timeout (sec)`, `Quarter break (sec)`, `Halftime (sec)`) wired to the same `setSettings` action used by the existing fields. Pre-filled with defaults, editable, persistent for the duration of the game.

**Independent Test**: Open `/setup`, change each of the three new inputs to a non-default value, navigate to `/game`, trigger a timeout, and assert the countdown begins at the configured value (not the default). Confirmed by the existing `useGameStore` selectors in `GameClock`.

### Tests for User Story 3 (MANDATORY per Constitution Principle I) ⚠️

- [X] T016 [US3] Create a new test file at `packages/web/src/app/setup/page.test.tsx` (no existing test file for this page) and add three tests: (a) the three new inputs render with the configured default values from `DEFAULT_SETTINGS["5v5"]`, (b) editing each input dispatches `setSettings` with the new value (e.g., typing `45` in `"Timeout (sec)"` results in `settings.timeoutSeconds === 45`), (c) the three inputs are visible inside the existing `Game Settings` section (asserted by walking up from the input element and finding the section's `label-eyebrow` heading). Confirm RED.

### Implementation for User Story 3

- [X] T017 [US3] Modify the setup page to add the three numeric inputs to the existing `Game Settings` section. Suggested placement: a new row below the existing 5-column grid (or extend that grid to a 3-column row using the same `Input` component pattern as `Period length (min)`). Labels: `"Timeout (sec)"`, `"Quarter break (sec)"`, `"Halftime (sec)"`. Each `onChange` calls `setSettings({ <fieldName>: Math.max(0, parseInt(e.target.value) || 0) })`. File: `packages/web/src/app/setup/page.tsx`.

**Checkpoint**: All three durations are configurable in setup. Stories 1–3 together deliver the full feature.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Tighten the loop after the three stories land — make sure nothing regressed, run the manual verification, and confirm constitution compliance.

- [X] T018 [P] Run `cd packages/web && npm run typecheck` and confirm clean (no `any`, no escape hatches per Constitution Principle II).
- [X] T019 [P] Run `cd packages/web && npm run lint` and confirm clean.
- [X] T020 Run `cd packages/web && npm test` and confirm all tests green (≥ 267 baseline + new tests from T005–T008, T014, T016). If `npm run test:coverage` is part of CI, run that too and confirm coverage does not regress (Constitution Principle I).
- [ ] T021 Execute the manual verification flow in [quickstart.md](./quickstart.md) sections 1–6 end-to-end in a real browser; capture any UI rough edges as follow-up issues rather than scope-creeping into this feature.
- [X] T022 Review the diff one last time against the constitution checklist: Principle II (no `any` / `as` / non-null assertions / `@ts-ignore` introduced), Principle III (no new component files created — only edits to existing components), Principle IV (action latency stays under 100ms — verify by tapping `End Timeout` in dev mode and watching the React DevTools profiler), Principle V (no new runtime dependencies, no skipped hooks, no warnings introduced).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — T001 first.
- **Foundational (Phase 2)**: Depends on Setup. T002 and T003 parallelizable; T004 depends on T002.
- **User Story 1 (Phase 3)**: Depends on Foundational. Tests (T005–T008) first, then implementation (T009–T013).
- **User Story 2 (Phase 4)**: Depends on Foundational and on T009 (needs `endTimeout` action implemented for the ActionPad to call it). T014 before T015.
- **User Story 3 (Phase 5)**: Depends on Foundational only. T016 before T017. Independent of US1 and US2 — can be done in parallel with either.
- **Polish (Phase 6)**: Depends on US1 + US2 + US3 all complete.

### User Story Dependencies

- **US1** stands alone in terms of the data + display layer. It's the MVP and the most valuable single story.
- **US2** requires US1's `endTimeout` action to exist in the store (T009 specifically). If `endTimeout` is split out of T009 and shipped earlier, US2 can start sooner — for the current plan, US2 starts after T009 lands.
- **US3** is fully orthogonal to US1 and US2 (the settings field exist after Phase 2 regardless of whether the durations are exposed in the UI).

### Within Each User Story

- Tests MUST be written and observed failing before any implementation task in the same story.
- Within US1's implementation cluster: T009 (store) is the keystone — T010–T013 depend on T009 only for end-to-end correctness; their unit tests pass independently because each test directly sets the store state.

---

## Parallel Opportunities

### Within Phase 2

```bash
# T002 and T003 can run in parallel (different files, no shared edits):
Task: T002 — Extend types in packages/web/src/lib/types.ts
Task: T003 — Add defaults in packages/web/src/lib/constants.ts
# Then T004 (sequential — same file as T009 later, and depends on T002's type)
```

### Within Phase 3 (US1)

```bash
# All four test tasks touch different files — fully parallel:
Task: T005 — store.test.ts
Task: T006 — useGameClock.test.ts
Task: T007 — GameClock.test.tsx
Task: T008 — ClockPanel.test.tsx + ClockNudge.test.tsx

# After tests are RED, the four non-store impl tasks are parallel; T009 is sequential:
Task: T009 — store.ts (sequential, multi-action change)
Task: T010 [P] — useGameClock.ts
Task: T011 [P] — GameClock.tsx
Task: T012 [P] — ClockPanel.tsx
Task: T013 [P] — ClockNudge.tsx
```

### Across user stories (after T009 lands)

```bash
# US2 and US3 can be developed by different people in parallel after T009:
Task: T014 + T015 — ActionPad.tsx and ActionPad.test.tsx
Task: T016 + T017 — setup/page.tsx and setup/page.test.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: T001 (verify env).
2. Complete Phase 2: T002–T004 (types, constants, state field).
3. Complete Phase 3: T005–T013 (US1 tests + impl).
4. **Stop & validate**: open `/game`, call a timeout from a team panel, confirm the countdown appears and ticks. Exit timeout via dev tools (`useGameStore.getState().endTimeout()`) until US2 lands.

This is the deployable MVP — the core "see the countdown" value is delivered. Users can still resume play via direct store action; the UI button is a UX refinement.

### Incremental Delivery

1. MVP (US1 above) → demo / deploy.
2. Add US2 (T014–T015) → exit-the-break button visible in ActionPad → demo / deploy.
3. Add US3 (T016–T017) → setup-page configurability → demo / deploy.
4. Polish (T018–T022) → final pass.

### Parallel Team Strategy

After T009 (the store keystone) lands:

- Developer A: US1 finish (T010–T013).
- Developer B: US2 (T014–T015).
- Developer C: US3 (T016–T017).

Each developer's work stays in its own file(s) — minimal merge conflict surface.

---

## Notes

- **No new component files**: per user directive. Test files are not components; the one new file in this feature is `packages/web/src/app/setup/page.test.tsx` (test file, not a React component).
- **TDD invariant**: every implementation task above has an explicit test partner that must be authored first and observed failing. The Constitution Principle I gate is binding.
- **Existing tests**: T005 may break a handful of existing `recordTimeout` / `endPeriod` assertions if those tests assumed `status === "live"` post-call. Update them as part of T005 to assert the new status — this is in-scope.
- **Test counts** after completion (estimated): 25 new store-test cases (T005), 1–2 new hook-test cases (T006), 1–2 new GameClock cases (T007), 2–3 new ClockPanel/Nudge cases (T008), 3–4 new ActionPad cases (T014) + label-update of existing cases, 3 new setup-page cases (T016). Net delta: ~35 tests, bringing the suite from 267 to ~300.
- **Commit cadence**: commit after each task or each logical group; never commit a red test bundle (run `npm test -- <file>` and confirm the new failures before committing the test task).
