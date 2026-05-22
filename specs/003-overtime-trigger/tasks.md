---

description: "Task list for feature 003-overtime-trigger"
---

# Tasks: Overtime Trigger

**Input**: Design documents from `/specs/003-overtime-trigger/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/store-api.md](./contracts/store-api.md), [quickstart.md](./quickstart.md)

**Tests**: MANDATORY per Constitution Principle I (Test-Driven Development, NON-NEGOTIABLE). Every implementation task below has a paired test task that MUST be authored first and observed failing before the implementation begins.

**User constraint (from plan args)**: All UI changes for the OT length input and Overtime On/Off toggle go in the existing **Game Settings** section at the top of the setup page. The toggle reuses the existing `FormatToggle` two-button pattern for consistency. Period labels switch to `OT / 2OT / 3OT / …` in both the scoreboard center column and the play-by-play log via a single change to the shared `formatPeriod` helper.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel — different files, no incomplete-task dependencies.
- **[Story]**: Maps task to its user story (`[US1]`, `[US2]`, `[US3]`). Setup, Foundational, and Polish tasks have no story label.
- All paths are absolute or `packages/web/...` relative-from-repo-root.

## Path Conventions

Web app inside `packages/web/`. All source paths live under `packages/web/src/` and tests live alongside their source files.

---

## Phase 1: Setup

**Purpose**: Confirm the working environment is ready. No project initialization is needed — the repo, dependencies, and tooling all exist.

- [X] T001 Verify the dev environment is ready: branch is `003-overtime-trigger`, run `cd packages/web && npm install`, run `npm test` to confirm a green baseline (320 tests passing after feature 002) and `npm run typecheck` / `npm run lint` are clean.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extend the type system and constants so every user story can compile and reference the new shape. Both tasks are pure additions — no behavior changes.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Extend the `GameSettings` interface with a new explicit `overtimeEnabled: boolean` field (documented as "true → tied-triggers-OT rule active") in `packages/web/src/lib/types.ts`.
- [X] T003 [P] Add `overtimeEnabled` defaults to both formats in `DEFAULT_SETTINGS` (5v5: `true`; 3v3: `false`) AND bump the 3v3 `overtimeSeconds` default from `0` to `5 * 60` so the toggle is meaningful when flipped to On, in `packages/web/src/lib/constants.ts`. Check whether any existing test asserts the 3v3 `overtimeSeconds === 0` and update it as part of this task if so.

**Checkpoint**: Types and defaults are in place. All three user stories can now begin.

---

## Phase 3: User Story 1 — Tied final regulation period routes the game into overtime (Priority: P1) 🎯 MVP

**Goal**: When the scorekeeper ends the final regulation period with a tied score AND overtime is enabled, the game transitions to a `period-break` (so the existing `Start Overtime` button surfaces) instead of `finished`. Untied games or OT-disabled games still finalize.

**Independent Test**: With a seeded 5v5 game in period 4 and the score tied (e.g., 48-48), call `endPeriod()`. Assert `status === "period-break"`. Repeat with score 50-48 and assert `status === "finished"`. Repeat with `overtimeEnabled: false` and tied score, assert `status === "finished"`.

### Tests for User Story 1 (MANDATORY per Constitution Principle I) ⚠️

> Author the test task FIRST and observe failures before any T005 implementation work begins.

- [X] T004 [US1] Add store-level tests for contract **C-001** (`endPeriod` routing on the final regulation period) in `packages/web/src/lib/store.test.ts`: (a) tied + overtimeEnabled + overtimeSeconds > 0 → `period-break` with `breakSeconds === quarterBreakSeconds`; (b) untied + overtimeEnabled + overtimeSeconds > 0 → `finished` with `breakSeconds === 0`; (c) tied + overtimeEnabled: false → `finished`; (d) tied + overtimeSeconds: 0 → `finished`; (e) mid-regulation (period 1 of 4) → `period-break` always (regression). Use `seedRoster` + `recordScore` to set up tied/untied conditions. Run `npm test -- store.test` and confirm RED before proceeding.

### Implementation for User Story 1

- [X] T005 [US1] Modify `endPeriod()` in `packages/web/src/lib/store.ts` to consult `computeStats(...)` and apply the routing predicate from `research.md` R-005 / `data-model.md` §4: `const goToBreak = !isLastRegular || (settings.overtimeEnabled && settings.overtimeSeconds > 0 && stats.home.points === stats.away.points)`. Set `status: goToBreak ? "period-break" : "finished"` and `breakSeconds` accordingly (reuse the existing halftime-vs-quarter seeding logic from feature 002 — OT-boundary is never halftime, so it naturally gets `quarterBreakSeconds`). Import `computeStats` from `./stats`.

**Checkpoint**: Tied regulation routes to OT break, untied regulation finalizes. The `Start Overtime` button (already wired in feature 002's ActionPad) surfaces automatically because `currentPeriod >= settings.periods`. 1OT can now be played.

---

## Phase 4: User Story 2 — Multi-overtime continues until a winner emerges + new label format (Priority: P2)

**Goal**: After any overtime period ends tied, the same routing predicate (now in `endPeriod`) sends the game back to a break, allowing successive OTs. Period labels in the scoreboard and play-by-play log render as `OT, 2OT, 3OT, …` instead of `OT, OT2, OT3, …`.

**Independent Test**: With a seeded game in OT (`currentPeriod=5`, `periods=4`) and tied score, call `endPeriod()`. Assert `status === "period-break"`. Call `startNextPeriod()` and assert `currentPeriod === 6` with clock seeded from `overtimeSeconds`. Render `formatPeriod(6, 4)` and assert `"2OT"`. Repeat once more for 3OT.

### Tests for User Story 2 (MANDATORY per Constitution Principle I) ⚠️

- [X] T006 [P] [US2] Add store-level tests for contract **C-002** (`endPeriod` routing on OT periods) in `packages/web/src/lib/store.test.ts`: (a) 1OT tied → `period-break`; (b) 1OT untied → `finished`; (c) 2OT tied → `period-break` (multi-OT loop). Set up state by calling `startNextPeriod()` from a tied period-break state from T004's scenario, or by directly setting `currentPeriod` for focused tests. Confirm RED.
- [X] T007 [P] [US2] Update the existing OT-label test in `packages/web/src/lib/utils.test.ts` (currently asserts `"OT2"` / `"OT3"` for `formatPeriod(6, 4)` and `(7, 4)` — see contract C-003) to assert the new format `"2OT"` / `"3OT"`. Also add a fresh assertion for `formatPeriod(8, 4)` → `"4OT"` to lock in the third OT in the same shape. Confirm RED.

### Implementation for User Story 2

- [X] T008 [P] [US2] Modify the OT branch of `formatPeriod` in `packages/web/src/lib/utils.ts`: change `return otNum === 1 ? "OT" : \`OT${otNum}\`;` → `return otNum === 1 ? "OT" : \`${otNum}OT\`;`. Pure one-line change. After this, T007 turns GREEN.
- [X] T009 [US2] Verification step (no new code): re-run T006's store tests. They should already pass because T005's `endPeriod` predicate covers `currentPeriod > settings.periods` (OT periods) via the same `isLastRegular` branch (`currentPeriod >= settings.periods`). If any T006 test still fails, the routing predicate in T005 needs adjustment.

**Checkpoint**: Multi-OT loops correctly; scoreboard centre column and play-by-play log render `OT / 2OT / 3OT / 4OT / …` for second-and-later overtimes.

---

## Phase 5: User Story 3 — Configure overtime length and opt-in toggle in setup (Priority: P3)

**Goal**: The Game Settings section of the setup page exposes two new fields — `Overtime length (min)` (integer-minutes input) and `Overtime` (On/Off two-button toggle) — both writing to `settings` via the existing `setSettings` action. Defaults match the data-model: length = 5 for both formats, toggle = On for 5v5 / Off for 3v3.

**Independent Test**: Render `<SetupPage />`. Assert both new inputs are visible inside the Game Settings section, pre-filled with the right defaults. Edit the length to `7`; assert `settings.overtimeSeconds === 420`. Click the `Off` toggle; assert `settings.overtimeEnabled === false`. Click `On`; assert `true`. Switch format to 3v3; assert toggle flips to `Off` highlighted (default).

### Tests for User Story 3 (MANDATORY per Constitution Principle I) ⚠️

- [X] T010 [US3] Extend `packages/web/src/app/setup/page.test.tsx` with contract **C-004** + **C-005** tests: (a) `Overtime length (min)` input renders with the configured default (5 for 5v5), (b) editing the length to "7" dispatches `setSettings({ overtimeSeconds: 420 })`, (c) the length input is visible inside the `Game Settings` section, (d) `Overtime` toggle renders with `On` active for 5v5 default, (e) clicking `Off` dispatches `setSettings({ overtimeEnabled: false })`, (f) clicking `On` (after `Off`) dispatches `setSettings({ overtimeEnabled: true })`. Confirm RED.

### Implementation for User Story 3

- [X] T011 [US3] Modify `packages/web/src/app/setup/page.tsx` to add the two new fields inside the existing `Game Settings` section. Suggested placement: a new row alongside (or below) the existing `grid-cols-1 md:grid-cols-3` row that holds `Timeout (sec)` / `Quarter break (sec)` / `Halftime (sec)`. The length input uses the existing `<Input>` primitive with `type="number"`, `min={0}`, `max={60}`, `value={Math.round(settings.overtimeSeconds / 60)}`, and `onChange` calling `setSettings({ overtimeSeconds: Math.max(0, parseInt(e.target.value) || 0) * 60 })`. The toggle uses the existing `FormatToggle` pattern (two buttons `On` / `Off`) — extract or duplicate the styling from [setup/page.tsx:164-189](packages/web/src/app/setup/page.tsx#L164-L189) into a small inline helper or reuse `FormatToggle` directly with a generic `value` prop if it's already abstract enough. Each button's `onClick` calls `setSettings({ overtimeEnabled: <true|false> })`.

**Checkpoint**: All three duration / overtime fields are configurable in setup. The full feature (US1 + US2 + US3) is complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T012 [P] Run `cd packages/web && npm run typecheck` and confirm clean (no `any`, no escape hatches per Constitution Principle II).
- [X] T013 [P] Run `cd packages/web && npm run lint` and confirm clean.
- [X] T014 Run `cd packages/web && npm test` and confirm all tests green (≥ 320 baseline + new tests from T004, T006, T007, T010). Investigate any unexpected failures — most likely places: existing tests that hard-code `OT2` / `OT3` strings (search `grep -rn "OT2\|OT3" packages/web/src` and update), and any setup-page test that asserts 3v3 `overtimeSeconds === 0`.
- [X] T015 Sweep the e2e test suite for hard-coded `OT2`/`OT3` strings and update them to the new `2OT`/`3OT` format. Run `cd packages/web && npm run test:e2e` if you want browser-level confirmation; otherwise the unit + component tests cover the routing logic comprehensively.
- [ ] T016 Execute the manual verification flow in [quickstart.md](./quickstart.md) sections 1–7 end-to-end in a real browser.
- [X] T017 Review the diff against the constitution checklist: Principle II (no `any` / `as` / non-null assertions / `@ts-ignore` introduced), Principle III (no new component files created — only edits to existing components and helpers), Principle IV (action latency well under 100ms — the added `computeStats` call is sub-millisecond), Principle V (no new runtime dependencies, no skipped hooks, no warnings introduced).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — T001 first.
- **Foundational (Phase 2)**: Depends on Setup. T002 and T003 parallelizable.
- **User Story 1 (Phase 3)**: Depends on Foundational. T004 before T005.
- **User Story 2 (Phase 4)**: Depends on Foundational AND on T005 (US1's `endPeriod` change is what US2's multi-OT tests exercise). T006 and T007 are parallel test-writing; T008 implements the label change; T009 is a verification step.
- **User Story 3 (Phase 5)**: Depends on Foundational only — fully orthogonal to US1 and US2. Can be developed in parallel with either.
- **Polish (Phase 6)**: Depends on US1 + US2 + US3 all complete.

### User Story Dependencies

- **US1** is the keystone — modifies `endPeriod` to add the routing predicate.
- **US2** layers on top: its multi-OT routing tests rely on US1's `endPeriod` work; its `formatPeriod` label change is independent.
- **US3** is fully orthogonal.

### Within Each User Story

- Tests MUST be written and observed failing before any implementation task in the same story.

---

## Parallel Opportunities

### Within Phase 2

```bash
# T002 and T003 touch different files:
Task: T002 — Extend types in packages/web/src/lib/types.ts
Task: T003 — Add overtimeEnabled defaults + bump 3v3 overtimeSeconds in packages/web/src/lib/constants.ts
```

### Within Phase 4 (US2)

```bash
# T006 (store.test.ts) and T007 (utils.test.ts) touch different files:
Task: T006 — store.test.ts multi-OT routing tests
Task: T007 — utils.test.ts formatPeriod tests
```

### Across user stories (after T005 lands)

```bash
# After T005, US2 and US3 can be developed by different people in parallel:
Task: US2 cluster (T006 + T007 + T008 + T009)
Task: US3 cluster (T010 + T011)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. T001 (env), T002–T003 (types + constants), T004–T005 (US1 tests + impl).
2. Stop & validate: in `/game`, fast-forward to period 4 with tied score, end period, confirm `Start Overtime` button appears. (Use DevTools `useGameStore.getState()` if needed.)

This is the deployable MVP — tied regulation games no longer incorrectly finalize.

### Incremental Delivery

1. MVP (US1) → demo.
2. Add US2 (T006–T009) → multi-OT loop + new label format → demo.
3. Add US3 (T010–T011) → setup-page UI → demo.
4. Polish (T012–T017) → final pass.

### Parallel Team Strategy

After T005 lands:

- Developer A: US2 finish (T006–T009).
- Developer B: US3 (T010–T011).

Each developer's work stays in different files — minimal merge conflict surface.

---

## Notes

- **No new component files**: per the constitution. Test files are not components. No new files in `packages/web/src/components/`.
- **TDD invariant**: every implementation task above has an explicit test partner that must be authored first.
- **3v3 overtimeSeconds default change**: T003 bumps it from `0` to `5 * 60`. Search the test suite for any assertion of the old value (`overtimeSeconds: 0` on 3v3) and update during T003.
- **Existing OT2/OT3 string references**: T007 updates the unit test; T015 sweeps e2e tests; T011 inspects whether GameLog component-tests assert OT-period strings (likely fine since they typically use formatPeriod output, but worth a grep).
- **Net test delta** (estimated): +5 store tests (T004), +3 store tests (T006), +1 unit test (T007 adjusts one existing + adds one new), +6 setup-page tests (T010). Net: ~+15 tests, bringing the suite from 320 to ~335.
- **Commit cadence**: commit after each task or each logical group; never commit a red test bundle.
