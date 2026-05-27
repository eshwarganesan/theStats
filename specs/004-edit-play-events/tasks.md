---
description: "Task list for feature 004-edit-play-events"
---

# Tasks: Edit and Delete Play-by-Play Events

**Input**: Design documents from `/specs/004-edit-play-events/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/store-api.md](./contracts/store-api.md), [contracts/ui-contracts.md](./contracts/ui-contracts.md), [quickstart.md](./quickstart.md)

**Tests**: MANDATORY per Constitution Principle I (Test-Driven Development, NON-NEGOTIABLE). Every implementation task has a paired failing-test task ordered immediately before it.

**Organization**: Tasks are grouped by user story (US1 → US2 → US3, in priority order). The two store actions and the discriminated `EditEventPatch` type are foundational because all three user stories depend on them. Each user story phase introduces (or extends) one component and one E2E spec block — at any checkpoint, the previous stories remain independently functional.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Every task includes an absolute-style file path inside `packages/web/`

## Path Conventions

This is the existing Next.js web app at `packages/web/`. All source paths are relative to the repo root.

- Source: `packages/web/src/`
- Unit/component tests: `*.test.ts` / `*.test.tsx` colocated next to the file under test
- E2E tests: `packages/web/tests/e2e/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm dev environment and baseline test suite are green before any new work begins.

- [X] T001 Verify baseline: run `npm run test:all` from `packages/web/` and confirm typecheck, lint, unit, and E2E suites are green on `main` before starting the feature

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Type definitions and store actions that all three user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Add the `EditEventPatch` discriminated union (one branch per editable event type — `score` / `foul` / `stat` / `timeout`, each listing only its editable fields) to `packages/web/src/lib/types.ts`, exported alongside `GameEvent`, exactly matching the shape specified in [data-model.md § New helper type](./data-model.md#new-helper-type-editeventpatch)
- [X] T003 In `packages/web/src/lib/store.test.ts`, write failing unit tests for `editEvent` covering the 12 cases in [contracts/store-api.md § editEvent tests](./contracts/store-api.md#editevent-tests): score playerId-only edit, score side+playerId together, score kind 2pt→3pt, score made true→false, foul kind personal→technical, stat kind steal→block, timeout side flip, clockAt within range, clockAt out of range, playerId not on roster, type mismatch, non-existent id; each test MUST also assert that `computeStats` re-derives correctly from the post-mutation events
- [X] T004 Implement the `editEvent: (id: ID, patch: EditEventPatch) => void` action on the Zustand store in `packages/web/src/lib/store.ts`, including the five precondition checks from [contracts/store-api.md § editEvent](./contracts/store-api.md#editeventid-patch) (id exists, type matches, playerId on roster, side change requires playerId, clockAt in `[0, periodLength]`); silent no-op on any failure with dev-only `console.warn`; make T003 tests pass
- [X] T005 In `packages/web/src/lib/store.test.ts`, write failing unit tests for `deleteEvent` covering the 3 cases in [contracts/store-api.md § deleteEvent tests](./contracts/store-api.md#deleteevent-tests): delete a score in the middle (later events stay intact, scoreboard recomputes), defense-in-depth rejection of a substitution-type id, no-op on non-existent id
- [X] T006 Implement the `deleteEvent: (id: ID) => void` action on the Zustand store in `packages/web/src/lib/store.ts` (filter `events` by id, no-op when the event is missing or not in `{"score","foul","stat","timeout"}`); make T005 tests pass
- [X] T007 Rewrite the events-array invariant comment block at `packages/web/src/lib/store.ts:20-30` so it enumerates the four allowed mutations (append via `record*`, `editEvent`, `deleteEvent`, `undoLastEvent` pop) and re-states the preserved derived-stats invariant — replacing the prior "append-only during normal play" wording per [data-model.md § What the events array's set of mutators becomes](./data-model.md#what-the-events-arrays-set-of-mutators-becomes)

**Checkpoint**: Foundation ready — `editEvent`, `deleteEvent`, and `EditEventPatch` exist and are fully tested. User story implementation can now begin.

---

## Phase 3: User Story 1 — Correct a Mis-Attributed Play (Priority: P1) 🎯 MVP

**Goal**: A scorekeeper can change a recorded play's `side` and `playerId` from the play-by-play log via an edit modal, with all derived views updating immediately.

**Independent Test**: Record a 2pt score for Home #10, open the row's edit modal, switch side to Away and select Away #7, save. Confirm the log row, scoreboard, and per-player point totals reflect the correction (matches the spec's `US1` Independent Test).

### Tests for User Story 1 (MANDATORY per Constitution Principle I) ⚠️

> Write these tests FIRST and observe them FAIL before any implementation task in this story is started.

- [X] T008 [US1] In `packages/web/src/components/game/EditEventModal.test.tsx` (new file), write failing component tests covering items 1-11 of [contracts/ui-contracts.md § EditEventModal Tests](./contracts/ui-contracts.md#tests-paired-with-implementation--constitution-principle-i): score renders all five fields pre-filled; foul renders without `made`; stat renders without `made` with current-roster player list; timeout renders only `clockAt` + `side`; side change resets player selector and disables Save; player list lists ALL current rostered players of selected side (no on-court filtering); `clockAt` invalid format → inline error + Save disabled; `clockAt` out of range → inline error + Save disabled; Save calls `editEvent` with only the changed fields; Cancel does not call `editEvent`; Escape key closes without persisting
- [X] T009 [US1] In `packages/web/src/components/game/GameLog.test.tsx` (modify existing), add failing tests covering items 16, 17, 18, 19 (Edit button rendered on score/foul/stat/timeout rows), item 20 (Edit button NOT rendered on substitution rows), items 21, 22 (Edit button NOT rendered on clock/period rows), and item 23 (clicking Edit on a score row opens `EditEventModal` pre-filled with that event) from [contracts/ui-contracts.md § GameLog Tests](./contracts/ui-contracts.md#tests-modifications-to-existing-gamelogtesttsx)
- [X] T010 [US1] In `packages/web/tests/e2e/edit-play-events.spec.ts` (new file), write a failing E2E test for the US1 mis-attribution flow per [quickstart.md § US1](./quickstart.md#us1-p1--correct-a-mis-attributed-play): set up game with rosters, record a 2pt score for Home #10, click row's Edit button, change side to Away and pick Away #7 in the modal, click Save, then assert the log row content, scoreboard home/away totals, and team-panel per-player points reflect the side flip

### Implementation for User Story 1

- [X] T011 [US1] Implement `packages/web/src/components/game/EditEventModal.tsx` — accepts the `EditEventModalProps` from [contracts/ui-contracts.md § EditEventModal Props](./contracts/ui-contracts.md#editeventmodaltsx-new), reads home/away rosters and `settings` from `useGameStore`, owns local draft state, renders the event-type-conditional fields per the table in [contracts/ui-contracts.md § EditEventModal Behavior](./contracts/ui-contracts.md#behavior); parses `clockAt` using the existing `parseClock` / `formatClock` from `packages/web/src/lib/utils.ts` (do NOT reuse the `ClockEditor` component itself, per [research.md § Decision 5](./research.md#decision-5-clock-time-input--reuse-clockeditor-directly-vs-a-new-clock-input)); side change resets the player selector; Save builds an `EditEventPatch` containing only changed fields and calls `editEvent(event.id, patch)`; Cancel / Escape / backdrop call `onClose()` without persisting; make T008 tests pass
- [X] T012 [US1] Modify `packages/web/src/components/game/GameLog.tsx` — inside the existing `LogRow`, add an `Edit` `<button>` (with `aria-label="Edit play"`) ONLY for events whose `type` is one of `"score" | "foul" | "stat" | "timeout"` (per Spec FR-001 and FR-002, [contracts/ui-contracts.md § GameLog Behavior changes](./contracts/ui-contracts.md#behavior-changes)); in the parent `GameLog` component, add local state `editing: EditableEvent | null`; on Edit button click, set `editing = event`; mount `<EditEventModal event={editing} onClose={() => setEditing(null)} />` at the component root; make T009 tests pass
- [X] T013 [US1] Verify the US1 E2E test (T010) now passes against the implementation

**Checkpoint**: User Story 1 (mis-attribution correction) is fully functional and testable independently. The MVP slice is complete and could be shipped.

---

## Phase 4: User Story 2 — Delete an Accidental Play (Priority: P2)

**Goal**: A scorekeeper can permanently remove a single past event from the play-by-play log via a confirmation dialog, with all later events preserved and stats recomputed.

**Independent Test**: Record a stat event, then several subsequent events, then click Delete on the stat row and confirm. Verify only that event is removed and all subsequent events remain (matches the spec's US2 Independent Test).

### Tests for User Story 2 (MANDATORY per Constitution Principle I) ⚠️

- [X] T014 [US2] In `packages/web/src/components/game/DeleteEventConfirmModal.test.tsx` (new file), write failing component tests covering items 12-15 of [contracts/ui-contracts.md § DeleteEventConfirmModal Tests](./contracts/ui-contracts.md#tests): renders the play summary for a given event; Cancel does NOT call `deleteEvent`; Delete calls `deleteEvent(event.id)` and dismisses; Escape key closes without deleting
- [X] T015 [US2] In `packages/web/src/components/game/GameLog.test.tsx` (modify existing), add failing tests covering item 24 (clicking Delete on a foul row opens `DeleteEventConfirmModal` pre-filled with that foul event), Delete-button visibility on score/foul/stat/timeout rows, and Delete-button absence on substitution/clock/period rows
- [X] T016 [US2] Append a failing E2E test block to `packages/web/tests/e2e/edit-play-events.spec.ts` for the US2 delete flow per [quickstart.md § US2](./quickstart.md#us2-p2--delete-an-accidental-play): record a stat, record two more events, click Delete on the stat row, click Delete in the confirm modal, assert the stat row is gone and the later rows remain; then repeat and click Cancel instead, asserting nothing changes

### Implementation for User Story 2

- [X] T017 [US2] Implement `packages/web/src/components/game/DeleteEventConfirmModal.tsx` — accepts the `DeleteEventConfirmModalProps` from [contracts/ui-contracts.md § DeleteEventConfirmModal Props](./contracts/ui-contracts.md#deleteeventconfirmmodaltsx-new); renders a one-line summary identifying the play (reuse or duplicate the existing `describe()` helper from `GameLog.tsx` to keep wording consistent); two buttons — `Cancel` (no-op + close) and `Delete` (danger-styled, calls `deleteEvent(event.id)` then close); Escape / backdrop / Cancel do NOT call `deleteEvent`; make T014 tests pass
- [X] T018 [US2] Modify `packages/web/src/components/game/GameLog.tsx` — add a `Delete` `<button>` (with `aria-label="Delete play"`) next to the Edit button inside the existing `LogRow` (gated on the same four event types as Edit); in the parent `GameLog`, add local state `deleting: EditableEvent | null`; on Delete button click, set `deleting = event`; mount `<DeleteEventConfirmModal event={deleting} onClose={() => setDeleting(null)} />` at the component root; make T015 tests pass
- [X] T019 [US2] Verify the US2 E2E test (T016) now passes against the implementation

**Checkpoint**: User Stories 1 AND 2 both work independently. Mis-attribution edits and accidental-play deletion are both deliverable.

---

## Phase 5: User Story 3 — Correct the Game-Clock Time of a Past Play (Priority: P3)

**Goal**: A scorekeeper can adjust a recorded event's `clockAt` to the correct time within its period via the existing edit modal, with the log row reflecting the change and out-of-range entries rejected.

**Independent Test**: Record a foul, then edit the row's `clockAt` to another valid value in the same period and save. The log row's displayed clock updates; no other state changes. Re-attempt with a value greater than the period length and verify the modal blocks save (matches the spec's US3 Independent Test).

> **Note**: US3 reuses the `EditEventModal` (introduced in US1) and the existing `editEvent` action (introduced in Phase 2). There are no new component files for this story; its acceptance is verified by an additional E2E block plus the `clockAt`-specific cases already covered by T008 (modal-level) and T003 (store-level).

### Tests for User Story 3 (MANDATORY per Constitution Principle I) ⚠️

- [X] T020 [US3] Append a failing E2E test block to `packages/web/tests/e2e/edit-play-events.spec.ts` for the US3 clockAt correction per [quickstart.md § US3](./quickstart.md#us3-p3--correct-the-game-clock-time-of-a-past-play): record a foul at a known clock value, open the row's edit modal, change `clockAt` to another valid in-range value (e.g., `4:18` → `4:23`), save, assert the row's displayed clock updates and no other field changes; then re-open and enter an out-of-range value (`25:00` in a 10-minute period), assert the inline error appears and Save is disabled

### Implementation for User Story 3

- [X] T021 [US3] Verify the US3 E2E test (T020) passes against the existing implementation. No new application code is expected; if a gap surfaces (e.g., the out-of-range message wording was not asserted at the modal level), fix it in `packages/web/src/components/game/EditEventModal.tsx` and re-run T008 + T020

**Checkpoint**: All three user stories are independently functional. The full feature surface is in place.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Accessibility verification, manual quickstart confirmation, and full-suite green check before merge.

- [X] T022 [P] Accessibility audit: verify `EditEventModal` and `DeleteEventConfirmModal` trap focus when open, restore focus to the triggering Edit/Delete button on close, respond to Escape and Enter as specified, expose discernible `aria-label`s on icon buttons, and meet WCAG 2.1 AA contrast on the new affordances (Constitution Principle IV); add or extend tests in `EditEventModal.test.tsx`, `DeleteEventConfirmModal.test.tsx`, and `GameLog.test.tsx` as needed so the assertions are automated rather than manual
- [X] T023 Run the manual verification flow in [quickstart.md](./quickstart.md) end-to-end (all three primary blocks plus the edge-case spot checks: side change without selecting a new player; stat-deletion impact on stats; per-row affordance visibility for each event type; post-game edit) and confirm every Expected outcome matches
- [X] T024 Run `npm run test:all` from `packages/web/` and confirm typecheck, lint, unit/component, and E2E suites are all green; resolve any regressions in existing tests caused by the new behavior (Constitution Principle V — warnings introduced by a PR MUST be resolved, not suppressed)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories. `EditEventPatch` must exist before any modal references it; `editEvent` and `deleteEvent` must exist before any UI invokes them.
- **User Stories (Phases 3-5)**: All depend on Foundational completion. Within each, tests precede implementation (Constitution Principle I).
- **Polish (Phase 6)**: Depends on all user-story phases completing.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 2. Introduces the `EditEventModal` and the per-row Edit button in `GameLog`. No dependency on US2 or US3.
- **User Story 2 (P2)**: Can start after Phase 2. Introduces the `DeleteEventConfirmModal` and the per-row Delete button in `GameLog`. **Note**: T018 modifies `GameLog.tsx`, which T012 (US1) also modifies. If US1 and US2 are worked in parallel by different developers, they must coordinate on the `GameLog.tsx` and `GameLog.test.tsx` edits to avoid merge conflicts; otherwise functionally independent.
- **User Story 3 (P3)**: Depends on US1 (reuses `EditEventModal`). Can start once T011 (modal implementation) is complete. The story adds only an E2E block (T020) plus verification (T021).

### Within Each User Story

- Tests (T-numbers ending in tests, e.g., T008, T009, T010) MUST be written and FAIL before implementation tasks (T011, T012, T013) begin (Constitution Principle I).
- Component implementation before integration into `GameLog`.
- Store changes (Phase 2) before any UI change.

### Parallel Opportunities

- **Within Phase 2**: Tasks share `store.ts` and `store.test.ts` — sequential within the phase. T002 (`types.ts`) is technically [P] with the others but T003 onward imports `EditEventPatch`, so T002 should land first for tests to fail for the right reason.
- **Across stories**: With multiple developers, US1 and US2 can be worked in parallel after Phase 2, coordinating on the shared `GameLog.tsx` edits. US3 must wait for US1's modal to land.
- **Within Polish**: T022 (a11y audit + tests) can run in parallel with the manual T023; T024 gates on all of them.

---

## Parallel Example: After Phase 2 completes

With two developers and Phase 2 merged:

```bash
# Developer A — drives User Story 1 (the MVP)
T008 → T009 → T010 → T011 → T012 → T013

# Developer B — drives User Story 2 (in parallel)
T014 → T015 → T016 → T017 → T018 → T019

# Both developers coordinate on the shared file:
# - packages/web/src/components/game/GameLog.tsx
# - packages/web/src/components/game/GameLog.test.tsx
# Suggested: land US1's GameLog changes first; US2 rebases on top.

# After Developer A's MVP lands:
# Developer C (or Developer A) — User Story 3 (E2E only)
T020 → T021
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001).
2. Complete Phase 2: Foundational (T002 → T007).
3. Complete Phase 3: User Story 1 (T008 → T013).
4. **STOP and VALIDATE**: run the US1 portion of [quickstart.md](./quickstart.md). If it passes, this slice can ship as the MVP — scorekeepers gain the most-needed correction (mis-attribution).

### Incremental Delivery

1. Setup + Foundational → Foundation ready.
2. Add User Story 1 → MVP (mis-attribution edits).
3. Add User Story 2 → Delete accidental plays.
4. Add User Story 3 → Clock-time corrections (E2E proof; no new code).
5. Polish (Phase 6) → ship.

Each story adds value without breaking the previous ones.

### Solo Strategy (one developer)

Execute strictly in order T001 → T024. Commit after each task or logical group (e.g., after each Test/Implementation pair). Take the MVP checkpoint after T013 as a deploy/demo opportunity.

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks.
- `[Story]` label maps task to specific user story for traceability.
- Each user story phase is independently completable and testable; US3 reuses US1's modal by design (and is therefore the thinnest phase).
- Verify tests fail before implementing — TDD per Constitution Principle I is non-negotiable.
- Commit after each task or logical group; never amend a published commit on this branch.
- Stop at any checkpoint to validate a story independently.
- Avoid: vague task descriptions, two parallel tasks touching the same file, cross-story dependencies that prevent independent test runs.
