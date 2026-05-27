# Implementation Plan: Edit and Delete Play-by-Play Events

**Branch**: `004-edit-play-events` | **Date**: 2026-05-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-edit-play-events/spec.md`

## Summary

Add an edit button and a delete button on every play-by-play log row whose underlying event is one of `score`, `foul`, `stat`, or `timeout`. Edit opens a single shared modal whose visible fields adapt to the event's `type` (per FR-004 to FR-008). Delete opens a confirmation modal with a one-line summary of the play. Saving an edit mutates the event in place inside the existing Zustand events array; deleting removes the event. All derived views (scoreboard, team panels, player stats, log) recompute automatically via the existing `computeStats` fold over `events`.

The feature adds two store actions — `editEvent(id, patch)` and `deleteEvent(id)` — to the previously append-only events list, joining the existing `undoLastEvent` as the second and third explicit mutators. Substitution, clock, and period events stay outside this feature's surface; their derived state (on-court lineups, status transitions) makes arbitrary edits unsafe (Spec Assumption).

Two new component files: `EditEventModal.tsx` (shared scaffold with event-type-conditional fields) and `DeleteEventConfirmModal.tsx`. `GameLog.tsx` gains per-row edit/delete trigger buttons only on the four eligible event types. No new runtime dependencies. No new persistence — edits and deletes mutate the in-memory store alongside the existing append and `undoLastEvent` flows (Spec Assumption).

## Technical Context

**Language/Version**: TypeScript 5.6 (strict mode, no escape hatches per Constitution Principle II)
**Primary Dependencies**: Next.js 15 (App Router), React 19, Zustand 5, Tailwind CSS 3.4, `clsx` + `tailwind-merge` (existing `cn` helper)
**Storage**: In-memory Zustand store (existing). No new fields on `GameEvent`, `GameSettings`, or any other type. The events array gains two new explicit mutators (`editEvent`, `deleteEvent`) alongside append and `undoLastEvent`.
**Testing**: Vitest + `@testing-library/react` for unit/component (existing). Playwright for end-to-end (existing).
**Target Platform**: Browser (tablet- and phone-first per Constitution Principle IV).
**Project Type**: Web application (Next.js front-end at `packages/web`).
**Performance Goals**: Edit/delete confirmation → state update + log/scoreboard refresh within 100ms on a mid-tier mobile device (Constitution Principle IV; mirrored by Spec SC-003 "within 1 second", a looser bound).
**Constraints**: The new store mutators MUST keep the event's position in the events array — same index, same identity (`id`, `type`, `period`, `timestamp` preserved per FR-011). Editing/deleting any score, foul, or stat invalidates cached stats; the existing `computeStats` re-fold is the recompute path. The edit modal MUST share the existing `mm:ss` parse path (`parseClock`/`formatClock` in `lib/utils.ts`) so the input behaves identically to the live `ClockEditor` (Clarification Q4).
**Scale/Scope**: Single-device app, one active game at a time. Surface area touched: 2 new store actions, 2 new component files (modal + confirm dialog), 1 modified component (`GameLog`), plus paired tests. No type-shape changes to any existing entity.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Compliance | Notes |
|---|---|---|
| **I. Test-Driven Development** | PASS | Each new behavior (the two store actions, modal field rules per event type, side-change roster reset, `clockAt` parse/range validation, delete confirmation flow, log-row affordance suppression on non-editable types) gets a failing unit/component test first. E2E covers the three user stories. Test plan enumerated in [contracts/store-api.md](./contracts/store-api.md) and [contracts/ui-contracts.md](./contracts/ui-contracts.md). |
| **II. Strict Type Safety** | PASS | The `editEvent` patch is a **discriminated union by `type`** so each event-type's editable subset is statically enforced (e.g., the `score` branch carries `kind: ScoreKind`, the `foul` branch carries `kind: FoulKind`). No `any`, no casts, no non-null assertions. Modal props are explicitly typed. The store's `events` array remains `GameEvent[]` with no widening. |
| **III. Component-Driven Architecture** | PASS | Two new single-purpose components: `EditEventModal` (presentational, owns its own draft state) and `DeleteEventConfirmModal` (purely presentational confirmation). Both consume store actions via the existing `useGameStore` hook — no in-component data-fetching. The per-row trigger buttons live in `GameLog`'s existing `LogRow` to avoid fragmenting a 2-button affordance into its own file. Each new component gets a paired component test. |
| **IV. Performant & Responsive UX** | PASS | Editing and deleting are O(n) over the events array (n ≤ ~500 in a normal game). `computeStats` is already invoked on every store update via Zustand selectors; no extra work added. Modal mount/unmount is local React state. Edit/delete buttons are real `<button>` elements (keyboard-operable, touch-friendly). No hover-only affordances. |
| **V. Engineering Discipline & Industry Standards** | PASS | The two new mutators have narrow, well-named contracts and live in the existing store next to `undoLastEvent`. The edit modal reuses `parseClock`/`formatClock` rather than reinventing a clock input (DRY). No audit trail or "edited" badge is added (YAGNI; explicit Clarification Q2). No new runtime dependencies. The append-only invariant in `store.ts:20-30` is rewritten to reflect the three explicit mutators (append, `editEvent`, `deleteEvent`, `undoLastEvent`); the **derived-stats invariant** is preserved. |

**Gate result**: PASS. No Complexity Tracking entries required.

### Post-design re-check (after Phase 1 artifacts)

Re-evaluated after writing [research.md](./research.md), [data-model.md](./data-model.md), [contracts/store-api.md](./contracts/store-api.md), [contracts/ui-contracts.md](./contracts/ui-contracts.md), and [quickstart.md](./quickstart.md):

- **I. TDD** — Confirmed: [contracts/store-api.md](./contracts/store-api.md) enumerates 14 store-level test cases; [contracts/ui-contracts.md](./contracts/ui-contracts.md) enumerates the modal and log-row component tests. Each implementation task in the upcoming `tasks.md` will have a paired failing-test task.
- **II. Strict Type Safety** — Confirmed: the discriminated `EditEventPatch` union in [data-model.md](./data-model.md) keeps each event type's editable subset narrow. The store action signature is `editEvent: (id: ID, patch: EditEventPatch) => void` with no fallback `any`.
- **III. Component-Driven Architecture** — Confirmed: two new component files, one modified component (`GameLog`), no mixing of data, mutation, and presentation in a single file. The modals are pure clients of store actions.
- **IV. Performant & Responsive UX** — Confirmed: no new asynchronous work, no new selectors, no main-thread blocking. Modal open/save/cancel are within the 100ms tap-to-update budget.
- **V. Engineering Discipline** — Confirmed: no new runtime deps; `parseClock`/`formatClock` reused; the previously-stated append-only invariant comment in `store.ts:20-30` is rewritten in the task list to enumerate the four allowed mutations (`append`, `editEvent`, `deleteEvent`, `undoLastEvent`); the derived-stats invariant is preserved.

No new violations. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/004-edit-play-events/
├── plan.md                  # This file
├── research.md              # Phase 0 output
├── data-model.md            # Phase 1 output — entities + EditEventPatch discriminated union
├── quickstart.md            # Phase 1 output — manual verification flow
├── contracts/
│   ├── store-api.md         # editEvent + deleteEvent contracts (store layer)
│   └── ui-contracts.md      # EditEventModal + DeleteEventConfirmModal + GameLog row affordance
└── checklists/
    └── requirements.md      # Spec quality checklist (already exists from /speckit.specify)
```

### Source Code (repository root)

Next.js web app inside `packages/web`. Two new component files plus modifications to the store, types (helper patch type), and `GameLog`.

```text
packages/web/
├── src/
│   ├── components/
│   │   └── game/
│   │       ├── EditEventModal.tsx              # NEW: shared edit modal, conditional fields by event.type
│   │       ├── EditEventModal.test.tsx         # NEW: component tests (per Spec FR-003 through FR-010a, FR-014)
│   │       ├── DeleteEventConfirmModal.tsx     # NEW: confirmation dialog with summary (per FR-015)
│   │       ├── DeleteEventConfirmModal.test.tsx # NEW: component tests (per FR-015, FR-016)
│   │       ├── GameLog.tsx                     # MODIFY: per-row Edit/Delete buttons only on score/foul/stat/timeout rows; open the modals (per FR-001, FR-002)
│   │       └── GameLog.test.tsx                # MODIFY: assert button visibility per event type, click → modal open
│   └── lib/
│       ├── types.ts                            # MODIFY: add the `EditEventPatch` discriminated union next to `GameEvent`
│       ├── store.ts                            # MODIFY: add `editEvent` and `deleteEvent` actions; rewrite the invariant comment at L20-30 to enumerate the four allowed mutations
│       └── store.test.ts                       # MODIFY: add tests for editEvent (per type) and deleteEvent (per FR-009 to FR-013, FR-016)
└── tests/
    └── e2e/
        └── edit-play-events.spec.ts            # NEW: end-to-end coverage of the three user stories (P1 mis-attribution, P2 delete, P3 clockAt correction)
```

**Structure Decision**: Two new component files (the edit and delete modals), one modified UI component (`GameLog`), and one modified store file. The append-only invariant comment in `store.ts:20-30` is rewritten — not deleted — to reflect the three explicit mutators alongside append. No new dependencies. No type-shape changes on any existing entity; `EditEventPatch` is a new helper union derived from `GameEvent`.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_ | _(none)_ | _(none)_ |
