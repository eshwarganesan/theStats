# Tasks: Team Actions

**Input**: Design documents from `/specs/008-team-actions/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/store-api.md](./contracts/store-api.md)

**Tests**: MANDATORY per Constitution Principle I (TDD, NON-NEGOTIABLE). Every story writes its failing tests **before** the implementation tasks in that story, and observes them fail (Red) before making them pass (Green).

**Organization**: Tasks are grouped by user story. US1 and US2 are both P1 (the two core actions); US3 is P2 (the panel entry point that surfaces them).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 — omitted for Setup, Foundational, Polish

## Path Conventions

Monorepo web layout (per plan.md): shared domain in `packages/core/src/`, UI + store in `packages/web/src/`, e2e in `packages/web/tests/e2e/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the workspace; no new runtime dependencies are introduced (plan.md).

- [X] T001 Confirm branch `008-team-actions` is checked out and `npm run typecheck && npm run lint && npm test` are green on the baseline before starting (no new dependencies to install per plan.md Technical Context).

**Checkpoint**: Clean baseline confirmed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared type + constant scaffolding that BOTH US1 and US2 build on. Because `GameEvent` is a discriminated union folded by an exhaustive `switch`, the two new variants and the `TeamStats` field must exist before either story's store/stats/log code will compile.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Add failing test in `packages/core/src/stats.test.ts` asserting `computeStats([], home, away, settings, 1)` returns `home.teamTurnovers === 0` and `away.teamTurnovers === 0` (new derived field defaults). Observe FAIL.
- [X] T003 Add `TeamTurnoverKind` literal union (`"8-second" | "24-second" | "3-second" | "5-second" | "backcourt"`) and both new `GameEvent` variants (`team-turnover` with `side`+`kind`; `team-score-adjust` with `side`+`points`+`reason`) to `packages/core/src/types.ts`; extend `EditableEvent` and `EditEventPatch` with matching branches per [data-model.md](./data-model.md).
- [X] T004 Add `teamTurnovers: number` to the `TeamStats` interface in `packages/core/src/types.ts`.
- [X] T005 [P] Add `TEAM_TURNOVER_KINDS` (ordered list of `{ kind, label }`, e.g. "8-Second Violation", "24-Second Violation", "3-Second Violation", "5-Second Violation", "Backcourt") to `packages/core/src/constants.ts` as the single source of truth for the union + labels.
- [X] T006 Initialize `teamTurnovers: 0` in the `make(...)` team factory inside `computeStats` in `packages/core/src/stats.ts` (satisfies T002; the two fold cases are added per-story). Run T002 → GREEN.
- [X] T007 [P] Export the new types/constants (`TeamTurnoverKind`, `TEAM_TURNOVER_KINDS`) from `packages/core/src/index.ts` so `packages/web` can consume them.
- [X] T007a Scaffold both new variants in `describe()` in `packages/web/src/components/game/GameLog.tsx` with correct labels (from `TEAM_TURNOVER_KINDS`; `TO` tag for turnovers, `+PTS` for awards) so `packages/web` typechecks after Phase 2 — the `describe()` switch returns a non-nullable `Descriptor` and will not compile until both variants are handled. Also confirm `EditEventModal.tsx` still compiles against the widened `EditableEvent` union (add minimal editors if its switch is exhaustive).

**Checkpoint**: Types compile; `teamTurnovers` defaults to 0. US1 and US2 can now proceed (they share `types.ts`, `stats.ts`, `store.ts`, `GameLog.tsx`, `TeamActionsModal.tsx`, so cross-story tasks touching those files are NOT parallel).

---

## Phase 3: User Story 1 — Record a team turnover from a violation (Priority: P1) 🎯 MVP

**Goal**: Record a team-attributed violation turnover (8/24/3-second, …) that increments the team's turnover total without touching any player.

**Independent Test**: Via `store.test.ts` + `stats.test.ts` — call `recordTeamTurnover("home", "24-second")` and assert `computeStats(...).home.teamTurnovers === 1`, no player turnover changed; and render `TeamActionsModal` (open) to confirm a turnover button records + closes.

### Tests for User Story 1 (write first, observe FAIL) ⚠️

- [X] T008 [P] [US1] Add fold test in `packages/core/src/stats.test.ts`: a `team-turnover` event increments only the charged side's `teamTurnovers` by 1 and leaves every player's `turnovers` at 0.
- [X] T009 [P] [US1] Add store test in `packages/web/src/lib/store.test.ts` for `recordTeamTurnover`: appends exactly one `team-turnover` event with given `side`/`kind`; honors `clockAt` override and falls back to `clockSeconds`; derived `teamTurnovers` increments; undo restores it.
- [X] T010 [P] [US1] Add `GameLog.test.tsx` assertion that a `team-turnover` event renders a team-attributed descriptor (team tag + violation label + `TO` tag, no player name).
- [X] T011 [P] [US1] Add `TeamActionsModal.test.tsx`: rendering with `open` + a `side` shows a button per `TEAM_TURNOVER_KINDS`; clicking one calls `recordTeamTurnover` and closes; the turnover section is disabled when `status` is `ready` (live/break only, FR-016).
- [X] T012 [P] [US1] Add `TeamPanel.test.tsx` assertion that the panel header shows the team's turnover total sourced from `teamTurnovers`.

### Implementation for User Story 1

- [X] T013 [US1] Add `case "team-turnover"` to the `computeStats` switch in `packages/core/src/stats.ts` → `stats[ev.side].teamTurnovers += 1`. (T008 GREEN)
- [X] T014 [US1] Add `recordTeamTurnover(side, kind, clockAt?)` to the store body and its type to the `GameState` interface in `packages/web/src/lib/store.ts` (append-only; mirrors `recordStat`). (T009 GREEN)
- [X] T015 [US1] Verify/refine the `team-turnover` descriptor scaffolded in T007a in `packages/web/src/components/game/GameLog.tsx` (team tag + label from `TEAM_TURNOVER_KINDS`, `tag: "TO"`, side-colored, muted) and confirm `GameLog.test.tsx` (T010) passes.
- [X] T016 [US1] Create `packages/web/src/components/game/TeamActionsModal.tsx` with the **turnover section**: props `{ open, onClose, side, capturedClockAt }`, one button per `TEAM_TURNOVER_KINDS` calling `recordTeamTurnover(side, kind, capturedClockAt ?? undefined)` then `onClose`; disable the section unless `status ∈ {live, timeout, period-break}`; reset on reopen (mirror `SubstitutionModal`). (T011 GREEN)
- [X] T017 [US1] Display the team turnover total in the `TeamPanel.tsx` header alongside "Team fouls", reading `teamStats.teamTurnovers`. (T012 GREEN)

**Checkpoint**: Team turnovers can be recorded (via store/modal), counted, logged, undone, and shown in the header — independently of US2/US3.

---

## Phase 4: User Story 2 — Apply an additive score adjustment (Priority: P1)

**Goal**: Award a positive whole number of points to a team with an optional free-text reason; never subtract, including on edit.

**Independent Test**: Via `store.test.ts` + `stats.test.ts` — `recordTeamScoreAdjust("home", 5, "missing jersey")` raises `home.points` by 5, no player points change; `recordTeamScoreAdjust("home", 0/-3/2.5, …)` is a no-op; render `TeamActionsModal` to confirm the award form disables Confirm for non-positive input.

### Tests for User Story 2 (write first, observe FAIL) ⚠️

- [X] T018 [P] [US2] Add fold test in `packages/core/src/stats.test.ts`: a `team-score-adjust` event adds its `points` to the charged side's `points` and leaves all player `points` unchanged.
- [X] T019 [P] [US2] Add store tests in `packages/web/src/lib/store.test.ts` for `recordTeamScoreAdjust`: valid positive integer appends one event and raises derived `points`; `0`, negative, and non-integer are no-ops (no event, score unchanged); blank `reason` preserved; `clockAt` override honored; undo restores score.
- [X] T020 [P] [US2] Add store test in `packages/web/src/lib/store.test.ts` for `editEvent` on `team-score-adjust`: editing `points` to a smaller positive value updates the score; editing to `0`/negative/non-integer is rejected (no-op) — additive-only preserved on edit (FR-015, SC-003).
- [X] T021 [P] [US2] Add `GameLog.test.tsx` assertions that a `team-score-adjust` renders `TAG +N` with the reason appended when present and omitted when blank (`+PTS` tag, accent/emphasized).
- [X] T022 [P] [US2] Add `TeamActionsModal.test.tsx` for the award section: Confirm is disabled for empty / `0` / negative / non-integer amounts; a valid amount + reason calls `recordTeamScoreAdjust` and closes; cancel/backdrop makes no store mutation (FR-012).

### Implementation for User Story 2

- [X] T023 [US2] Add `case "team-score-adjust"` to `computeStats` in `packages/core/src/stats.ts` → `stats[ev.side].points += ev.points`. (T018 GREEN)
- [X] T024 [US2] Add `recordTeamScoreAdjust(side, points, reason, clockAt?)` to the store body + `GameState` interface in `packages/web/src/lib/store.ts` with the guard `Number.isInteger(points) && points > 0` (else no-op). (T019 GREEN)
- [X] T025 [US2] Extend `editEvent` in `packages/web/src/lib/store.ts` to handle `team-turnover` (kind/side/clockAt) and `team-score-adjust` (points/reason/side/clockAt) patches, rejecting any resolved non-positive/non-integer `points` as a no-op. (T020 GREEN)
- [X] T026 [US2] Verify/refine the `team-score-adjust` descriptor scaffolded in T007a in `packages/web/src/components/game/GameLog.tsx` (`TAG +N`, reason appended when non-empty, `tag: "+PTS"`, accent) and confirm `GameLog.test.tsx` (T021) passes.
- [X] T027 [US2] Add the **score-award section** to `packages/web/src/components/game/TeamActionsModal.tsx`: a positive-integer amount input + free-text reason input + Confirm (disabled unless the amount parses to a positive integer); on confirm call `recordTeamScoreAdjust(side, points, reason, capturedClockAt ?? undefined)` then `onClose`; section enabled whenever the modal is open (from `ready` onward). (T022 GREEN)

**Checkpoint**: Additive score awards work end-to-end at the store/modal level, are logged, undoable, editable-but-never-negative — independently of US1/US3.

---

## Phase 5: User Story 3 — Access Team Actions from the team panel (Priority: P2)

**Goal**: A "Team Actions" button between Sub and Timeout opens the (US1+US2) modal, scoped to that team, with correct state gating and full play-by-play edit/delete integration.

**Independent Test**: Render `TeamPanel` and assert a "Team Actions" control sits between Sub and Timeout and calls `onTeamActionsClick`; run the Playwright flow to open the modal, record a turnover and an award, and edit/delete them from the log.

### Tests for User Story 3 (write first, observe FAIL) ⚠️

- [X] T028 [P] [US3] Add `TeamPanel.test.tsx` assertions: a "Team Actions" button exists, sits **between** Sub and Timeout in DOM order, calls `onTeamActionsClick` on click, and is disabled in `setup`/`finished` (enabled from `ready` onward).
- [X] T029 [P] [US3] Add `store.test.ts` assertion that `deleteEvent` removes a `team-turnover` and a `team-score-adjust` (allowlist widened) and stats/score re-derive.
- [X] T030 [P] [US3] Add `EditEventModal.test.tsx` coverage that the edit UI supports editing a `team-turnover` (kind picker) and a `team-score-adjust` (points + reason, non-positive rejected on submit), and assert in `GameLog.test.tsx` that a `team-turnover` row and a `team-score-adjust` row each render the edit and delete buttons (they do not today, since `isEditable()` returns false for them).
- [X] T031 [P] [US3] Add Playwright e2e `packages/web/tests/e2e/team-actions.spec.ts` covering: button placement, recording a violation turnover (header total + log entry), a pre-tip `+5` missing-jersey award (score + log), Confirm disabled for `0`/negative, and undo restoring state (maps to quickstart.md steps 1–6).

### Implementation for User Story 3

- [X] T032 [US3] Add `onTeamActionsClick: () => void` to `TeamPanelProps` and render the "Team Actions" button between the Sub and Timeout buttons in `packages/web/src/components/game/TeamPanel.tsx`, matching sibling styling and enabled from `ready` onward. (T028 GREEN)
- [X] T033 [US3] Widen the `deleteEvent` allowlist in `packages/web/src/lib/store.ts` to include `team-turnover` and `team-score-adjust`. (T029 GREEN)
- [X] T034 [US3] Extend `EditEventModal.tsx` (and any editable-type mapping it uses) in `packages/web/src/components/game/` to render editors for the two new editable types, reusing the existing modal shell; enforce positive-integer points on submit; AND add `team-turnover` and `team-score-adjust` to the `isEditable()` predicate in `packages/web/src/components/game/GameLog.tsx` so the play-by-play renders edit/delete controls for team actions (FR-015). (T030 GREEN)
- [X] T035 [US3] Wire the modal in `packages/web/src/app/game/page.tsx`: add `teamActionsSide` transient state, capture `clockAt` at button tap (mirror `handlePlayerTap`), pass `onTeamActionsClick` to both `TeamPanel`s, and render one `<TeamActionsModal open side capturedClockAt onClose />`. (contributes to T031 GREEN)

**Checkpoint**: The full feature is reachable from the UI: button → modal → turnover/award → play-by-play → edit/delete/undo.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T036 Run `packages/web` Playwright + Vitest suites and `npm run typecheck && npm run lint` at repo root; confirm coverage does not regress (Constitution Principle I) and the exhaustive `computeStats` switch has no unhandled-variant warnings.
- [X] T037 [P] Execute the [quickstart.md](./quickstart.md) manual verification (all 8 steps, including the persistence refresh check) on a real game session.
- [X] T038 [P] Verify accessibility of `TeamActionsModal` and the new TeamPanel button (keyboard operable, focus trap via `ui/Modal`, WCAG AA contrast) per Constitution Principle IV.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none — start immediately.
- **Foundational (Phase 2)**: depends on Setup. **BLOCKS US1, US2, US3.**
- **US1 (Phase 3)** and **US2 (Phase 4)**: both depend only on Foundational. They are logically independent but **share files** (`types.ts`, `stats.ts`, `store.ts`, `GameLog.tsx`, `TeamActionsModal.tsx`) — do NOT run US1 and US2 tasks that touch the same file in parallel; sequence them (P1 order: US1 then US2 recommended).
- **US3 (Phase 5)**: depends on Foundational; its modal-wiring (T035) and e2e (T031) are most meaningful after US1 **and** US2 modal sections exist. `editEvent` handling for both variants (T025, US2) should land before `EditEventModal` UI (T034, US3).
- **Polish (Phase 6)**: after all desired stories.

### Within Each User Story

- Tests (Red) precede implementation (Green) — Constitution Principle I.
- Core types (Foundational) → stats fold → store mutator → log descriptor → modal section → panel/page wiring.

### Parallel Opportunities

- **Foundational**: T002, T005, T007 are `[P]` (distinct files); T003/T004 share `types.ts` and T006 depends on them.
- **Within a story**: the test tasks marked `[P]` target distinct files and can be authored together (e.g. US1: T008–T012; US2: T018–T022; US3: T028–T031).
- **Across stories**: US1 and US2 implementation tasks are NOT parallel where they touch the same file (stats.ts, store.ts, GameLog.tsx, TeamActionsModal.tsx).

---

## Parallel Example: User Story 1 tests

```bash
# Author these failing tests together (distinct files):
Task: "T008 fold test in packages/core/src/stats.test.ts"
Task: "T009 recordTeamTurnover test in packages/web/src/lib/store.test.ts"
Task: "T010 GameLog descriptor test in packages/web/src/components/game/GameLog.test.tsx"
Task: "T011 TeamActionsModal turnover-section test in packages/web/src/components/game/TeamActionsModal.test.tsx"
Task: "T012 TeamPanel turnover-total test in packages/web/src/components/game/TeamPanel.test.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → Phase 2 Foundational (CRITICAL, blocks everything).
2. Phase 3 US1 — recording/counting/logging team violation turnovers.
3. **STOP and VALIDATE**: US1 testable via store + modal render. This is the smallest shippable slice.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 (turnovers) → test → demo.
3. US2 (additive awards) → test → demo.
4. US3 (panel button + page wiring + edit/delete + e2e) → the feature is fully reachable in-app.
5. Polish.

### Notes

- `[P]` = different files, no incomplete dependencies.
- `GameLog.describe()` is an exhaustive return-switch, so `packages/web` typechecks only after T007a handles both variants — account for this at any partial-build checkpoint before US1/US2 finish.
- The two new event variants ride the existing persisted `events` array — no migration, no `schemaVersion` bump (data-model.md).
- Constitution VI (backend boundary) is N/A — client-only over Zustand + localStorage.
- Commit after each task or logical group; verify each test fails before implementing.
