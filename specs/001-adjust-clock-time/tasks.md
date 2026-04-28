---

description: "Tasks for feature 001-adjust-clock-time — Adjust Clock Time When Paused"
---

# Tasks: Adjust Clock Time When Paused

**Input**: Design documents from `/specs/001-adjust-clock-time/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/store-action.md](contracts/store-action.md), [contracts/component-contract.md](contracts/component-contract.md), [quickstart.md](quickstart.md)

**Tests**: MANDATORY per Constitution Principle I (TDD, NON-NEGOTIABLE). Every test task in this list MUST be authored and observed failing before its corresponding implementation task is started.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested, and demoed independently. The MVP is User Story 1 (Phase 3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file, no dependency on an incomplete task in this phase — safe to run in parallel.
- **[Story]**: `[US1]`, `[US2]`, or `[US3]` for tasks belonging to a specific user story. Setup, Foundational, and Polish phases carry no story label.
- File paths are absolute relative to the repo root (`packages/web/...`).

## Path Conventions

This is a single-package web app. All source lives under `packages/web/src/`; unit/component tests are co-located alongside their source under the same `src/` tree (e.g., `store.test.ts` next to `store.ts`); end-to-end tests live under `packages/web/tests/e2e/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the working tree is on the feature branch and the existing test suite is green so we have a clean baseline to TDD against.

- [X] T001 Verify working tree is on branch `001-adjust-clock-time` and that the baseline `npm run typecheck && npm test` from `packages/web/` passes with no failing tests; if any baseline test fails, fix or revert before any other task begins.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Type and store-action changes that every user story depends on. The store action's full contract (gating, period-aware clamp, event emission, no-op short-circuit) is implemented here so that US1, US2, and US3 can all consume the same single source of truth.

**⚠️ CRITICAL**: No user-story tasks may begin until Phase 2 is complete.

- [X] T002 [P] Add the 12 `adjustClock` store tests from [contracts/store-action.md](contracts/store-action.md#test-surface-vitest-in-storetests) to [packages/web/src/lib/store.test.ts](../../packages/web/src/lib/store.test.ts); run `npm test store` and confirm all 12 fail before proceeding.
- [X] T003 Extend the `GameEvent` `clock` variant in [packages/web/src/lib/types.ts](../../packages/web/src/lib/types.ts) by adding a second union member with `action: "adjust"` plus `from: number` and `to: number` fields per [data-model.md](data-model.md#gameevent--clock-variant); leave the existing `start | stop | reset` member intact.
- [X] T004 Reimplement `adjustClock` in [packages/web/src/lib/store.ts](../../packages/web/src/lib/store.ts) per [contracts/store-action.md](contracts/store-action.md): no-op when `status !== "live"` or `clockRunning === true`; clamp `seconds` into `[0, currentPeriodMax]` where `currentPeriodMax` is `overtimeSeconds` in OT and `periodSeconds` otherwise; no-op when `to === from`; otherwise update `clockSeconds` and append a single `{type:"clock", action:"adjust", from, to, clockAt: from, period, id, timestamp}` event. Run `npm test store` and confirm T002 turns green.

**Checkpoint**: Type system and store action are in place. The 12 store tests are green. User-story phases can now start in parallel (subject to file-level overlap noted below).

---

## Phase 3: User Story 1 — Correct the clock to match the official game clock (Priority: P1) 🎯 MVP

**Goal**: A scorekeeper can pause the clock, tap the displayed time, type a new `mm:ss` value, confirm with Enter or blur, and see the clock update immediately. Resuming counts down from the new value. This phase delivers the core motivating use case and is independently shippable as the MVP.

**Independent Test**: From a tipped-off 5v5 game, pause the clock at any value, tap the clock digits, type `5:00`, press Enter, and verify the displayed clock shows `5:00`, the clock remains paused, and pressing Play resumes counting down from `5:00`.

### Tests for User Story 1 (MANDATORY per Constitution Principle I) ⚠️

> Write each of these and observe failure before any US1 implementation task starts.

- [X] T005 [P] [US1] Add the `parseClock` unit-test cases from [data-model.md](data-model.md#parseclockinput-string-number--null) (10+ rows: `"7:42"`, `"07:42"`, `"0:00"`, `"42"`, `"700"`, `"7:60"`, `"-1:00"`, `""`, `"abc"`, `":30"`) to [packages/web/src/lib/utils.test.ts](../../packages/web/src/lib/utils.test.ts) and confirm they fail.
- [X] T006 [P] [US1] Create [packages/web/src/components/game/ClockAdjuster.test.tsx](../../packages/web/src/components/game/ClockAdjuster.test.tsx) with the visibility-gating and typed-editor cases #1–#8 plus the a11y case #15 from [contracts/component-contract.md](contracts/component-contract.md#test-surface-vitest--testing-library-in-clockadjustertesttsx); confirm all fail (the component does not yet exist).
- [X] T007 [P] [US1] Update [packages/web/src/components/game/GameClock.test.tsx](../../packages/web/src/components/game/GameClock.test.tsx) to assert that `GameClock` renders a `ClockAdjuster` child (e.g., by `data-testid` or accessible role); confirm it fails.

### Implementation for User Story 1

- [X] T008 [P] [US1] Implement `export function parseClock(input: string): number | null` in [packages/web/src/lib/utils.ts](../../packages/web/src/lib/utils.ts) per [data-model.md](data-model.md#parseclockinput-string-number--null); accepts `mm:ss`, `m:ss`, and pure-second forms; returns `null` for empty, non-numeric, missing-minutes, negative, or out-of-range-seconds inputs. Turns T005 green.
- [X] T009 [US1] Create [packages/web/src/components/game/ClockAdjuster.tsx](../../packages/web/src/components/game/ClockAdjuster.tsx) implementing only the typed-editor + visibility-gating slice of [contracts/component-contract.md](contracts/component-contract.md): renders `null` when `status !== "live"` or `clockRunning === true`; otherwise renders the clock digits as a tap target that swaps to a controlled `<input type="text" inputMode="numeric" pattern="[0-9:]*" maxLength={5}>` on click; commits via `parseClock` + `adjustClock` on Enter or blur; discards on Escape or any out-of-control mount unmount. Use Zustand selector subscriptions for `status` and `clockRunning` so the component does not re-render on clock ticks. Add an `aria-label="Clock time, minutes and seconds"` on the input. Turns T006 green. (Depends on T003, T004, T008.)
- [X] T010 [US1] Modify [packages/web/src/components/game/GameClock.tsx](../../packages/web/src/components/game/GameClock.tsx) to compose `ClockAdjuster` (the gating lives in the child; `GameClock` simply renders it next to or in place of its current `<span>`); preserve the existing `formatClock`, `text-clock`, `tabular`, and `critical` styling so display-only behavior is unchanged. Turns T007 green. (Depends on T009.)

**Checkpoint**: User Story 1 is fully functional and independently testable. The MVP can be demoed: pause the clock, tap, type, see the new value. Adjust events are already being recorded by the store (per Phase 2) but are not yet surfaced in the play-by-play log — that is User Story 3's slice. Stop here for the MVP cut.

---

## Phase 4: User Story 2 — Quickly nudge the clock by a few seconds (Priority: P2)

**Goal**: Add `−1s` and `+1s` controls next to the clock display so the most-common 1–3-second corrections take a single tap each, with the rapid-tap session collapsed into one play-by-play event when the user settles.

**Independent Test**: With the clock paused at any value, tap `+1s` three times in under 2 seconds; verify the displayed clock has incremented by 3 seconds, the clock is still paused, and after a brief idle exactly one `clock`/`adjust` event has been appended (with `to === from + 3`).

### Tests for User Story 2 (MANDATORY per Constitution Principle I) ⚠️

- [X] T011 [US2] Append the nudge + coalescing cases #9, #10, #11, #12, #13, #14, and #16 from [contracts/component-contract.md](contracts/component-contract.md#test-surface-vitest--testing-library-in-clockadjustertesttsx) to [packages/web/src/components/game/ClockAdjuster.test.tsx](../../packages/web/src/components/game/ClockAdjuster.test.tsx); use `vi.useFakeTimers()` to drive the 1500 ms debounce. Confirm all 7 fail.

### Implementation for User Story 2

- [X] T012 [US2] Extend [packages/web/src/components/game/ClockAdjuster.tsx](../../packages/web/src/components/game/ClockAdjuster.tsx) with two `<button>` controls labeled `−1s` and `+1s`. Hold an optimistic in-flight session value in component state during a nudge sequence; reset a 1500 ms debounce timer on every tap; commit the session via a single `adjustClock(currentSessionValue)` call when the timer fires, when the user opens the typed editor, when `clockRunning` transitions to `true`, or on unmount. Disable `+1s` at `currentPeriodMax` and `−1s` at `0`. Make the controls reachable in the natural tab order (digits → −1s → +1s) and operable via Space/Enter. Turns T011 green. (Depends on T009.)

**Checkpoint**: User Stories 1 AND 2 are independently functional. The scorekeeper now has both precise edit and quick-nudge paths.

---

## Phase 5: User Story 3 — The adjustment is preserved in the play-by-play record (Priority: P3)

**Goal**: Render the `clock`/`adjust` events that Phase 2 already produces as a visually distinguishable line in the play-by-play view, so a reviewer can see what the clock was changed from, what to, in which period, and at what wall-clock moment.

**Independent Test**: Make any clock adjustment (typed or nudge) during a paused live game, open the play-by-play log, and verify a clock-adjustment entry is present showing both the before and after times, the period, and visually distinct from clock start/stop entries.

### Tests for User Story 3 (MANDATORY per Constitution Principle I) ⚠️

- [X] T013 [US3] Add a snapshot/assertion test for the `action: "adjust"` render branch to [packages/web/src/components/game/GameLog.test.tsx](../../packages/web/src/components/game/GameLog.test.tsx): construct a store state containing one `clock`/`adjust` event (e.g., `from: 462, to: 465, period: 2`), render `<GameLog />`, and assert that (a) the entry is present with both formatted times visible, (b) the period number is shown, and (c) the entry's accessible label or icon distinguishes it from a `clock`/`start` or `clock`/`stop` entry. Confirm it fails.

### Implementation for User Story 3

- [X] T014 [US3] Add a render branch in [packages/web/src/components/game/GameLog.tsx](../../packages/web/src/components/game/GameLog.tsx) for `event.type === "clock" && event.action === "adjust"` that renders `Clock adjusted   {formatClock(from)} → {formatClock(to)}   (P{period})` with a label or icon distinct from start/stop. Use the existing `formatClock` helper. Turns T013 green. (Depends on T003, T004.)

**Checkpoint**: All three user stories are independently functional. The audit trail is complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end verification, performance/bundle gates, manual smoke, and the constitution's `npm run test:all` gate.

- [X] T015 [P] Create [packages/web/tests/e2e/adjust-clock.spec.ts](../../packages/web/tests/e2e/adjust-clock.spec.ts) covering the full pause→typed-edit→resume flow (US1 acceptance scenario 1), the rapid-nudge coalescing flow (US2 acceptance scenario 1), the buzzer-recovery flow (spec Edge Case "Buzzer state" + FR-013: tick to 0:00, adjust to 0:08, assert the "End Period" CTA disappears and the period continues), and the play-by-play assertion (US3 acceptance scenario 1). Use existing helpers from [packages/web/tests/e2e/_helpers.ts](../../packages/web/tests/e2e/_helpers.ts). Run `npm run test:e2e -- adjust-clock` and confirm green.
- [X] T016 Run `npm run size` from `packages/web/` and confirm the route bundle delta from this feature is under 1 KB gzipped (per [plan.md](plan.md) Constitution Check, Principle IV); investigate and trim if exceeded.
- [X] T017 Manually walk through the 8-step smoke checklist in [quickstart.md](quickstart.md#5-manual-smoke-per-constitution-iv--test-the-ui) on an actual browser (mobile viewport at ≥360px width) and verify every step; capture and fix any UX regressions before opening the PR.
- [X] T018 Run `npm run test:all` from `packages/web/` and confirm all four constitution gates are green (`typecheck`, `lint`, `test:coverage` with coverage on `store.ts`/`utils.ts`/`ClockAdjuster.tsx` ≥ baseline, `test:e2e`).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)** → no dependencies; must be done first.
- **Phase 2 (Foundational)** → depends on Phase 1; BLOCKS every user-story phase.
- **Phase 3 (US1)** → depends on Phase 2; can start as soon as T004 is green.
- **Phase 4 (US2)** → depends on Phase 2 AND on T009 (US2's implementation extends the file `ClockAdjuster.tsx` created by US1).
- **Phase 5 (US3)** → depends on Phase 2 only; CAN run in parallel with US1 and US2 because it touches different files (`GameLog.tsx` / `GameLog.test.tsx`).
- **Phase 6 (Polish)** → e2e spec (T015) depends on US1, US2, and US3 implementation being complete; the other polish tasks depend on T015.

### Within-Story Dependencies

- Tests are written and observed failing BEFORE the implementation tasks they target (Constitution I).
- US1: T005, T006, T007 are independent tests across three files (parallel-safe). Implementation order: T008 (`parseClock`) → T009 (`ClockAdjuster`) → T010 (`GameClock` composition).
- US2: T011 (single test file) → T012 (single impl file).
- US3: T013 (single test file) → T014 (single impl file).

### File-Overlap Notes

- T009 (US1 impl) and T012 (US2 impl) both write to `ClockAdjuster.tsx` → US2 cannot start its implementation until T009 has merged.
- T006 (US1 tests) and T011 (US2 tests) both write to `ClockAdjuster.test.tsx` → US2's tests should be appended after US1's tests are in place.

### Parallel Opportunities

- **Within Phase 2**: T002 (test) is `[P]` because it touches `store.test.ts`; it can be authored alongside T003 (`types.ts`) which is also a different file. Order matters for *passing* (T003 + T004 turn T002 green) but not for *authoring*.
- **Within Phase 3 (US1)**: T005, T006, T007 are all `[P]` (three different test files). T008 is `[P]` (different impl file from T009 and T010).
- **Across phases 3 and 5**: US1 and US3 touch disjoint files except for the foundational types/store; both can be progressed in parallel by two developers once Phase 2 is done.
- **Within Phase 6**: T015 must complete before T016/T017/T018; T016 and T017 are independent of each other and can be done in parallel once T015 is green.

---

## Parallel Example: User Story 1 Tests (after Phase 2)

```bash
# Three test files, three independent failing test sets — author together:
Task: "Add parseClock unit tests in packages/web/src/lib/utils.test.ts"
Task: "Add ClockAdjuster typed-editor + visibility tests in packages/web/src/components/game/ClockAdjuster.test.tsx"
Task: "Update GameClock.test.tsx to assert ClockAdjuster composition"
```

## Parallel Example: Two-developer split after Phase 2

```bash
# Developer A: full US1 stack (typed editor MVP)
T005, T006, T007 in parallel → T008, T009, T010 in order

# Developer B: full US3 stack (play-by-play rendering) at the same time
T013 → T014

# Then the developer who finishes US1 picks up US2:
T011 → T012
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 (T001) — baseline green.
2. Phase 2 (T002 → T003 → T004) — types + store action with full contract.
3. Phase 3 (T005, T006, T007 in parallel → T008 → T009 → T010) — typed editor + composition.
4. **STOP and validate**: pause-edit-resume works in the browser; the MVP is shippable.

### Incremental Delivery

1. After MVP: ship US2 (T011 → T012) — adds nudge + coalescing.
2. After US2: ship US3 (T013 → T014) — adds the play-by-play surface.
3. Wrap with Phase 6 (T015 → T016/T017/T018 in parallel) before opening the PR.

### Two-Developer Split

After Phase 2:
- Developer A: US1 (Phase 3) → US2 (Phase 4)
- Developer B: US3 (Phase 5) — independent file set
- Both: meet at Phase 6 for e2e + final gates

---

## Notes

- `[P]` strictly means "different file, no dependency on an incomplete task in this phase." Same-file overlaps are called out in the File-Overlap Notes above.
- Verify each test fails before its implementation task begins (Constitution I). `npm test -- --run path/to/file` is the fast feedback loop.
- Commit after each task or each test-then-impl pair. Avoid bundling multiple stories into one commit so reverts stay surgical.
- The latent OT-cap defect in the current `adjustClock` (regulation `periodSeconds` cap during overtime) is fixed in T004; the regression test for it is row #5 of the store-action contract test surface.
- Bundle delta target (< 1 KB gzipped) is enforced by T016. If `parseClock` or `ClockAdjuster` push beyond the budget, prefer trimming to widening the budget.
