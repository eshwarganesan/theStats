# Implementation Plan: Team Actions

**Branch**: `008-team-actions` | **Date**: 2026-07-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-team-actions/spec.md`

## Summary

Add a "Team Actions" control to each team panel (between Sub and Timeout) that opens a
modal for **team-attributed** actions that today have no home in the event model:

1. **Violation turnovers** (8-second, 24-second, 3-second, and a small extensible set)
   recorded against the team as a whole — no player selected.
2. **Additive score adjustments** — award a positive whole number of points to a team
   with an optional free-text reason (e.g. missing-jersey +5, technical-foul +2). Never
   subtractive.

Technical approach: extend the existing event-sourced model with two new `GameEvent`
variants (`team-turnover`, `team-score-adjust`), fold them in `computeStats`, add two
store mutators plus edit/delete/undo support, and build a `TeamActionsModal` from the
existing `ui/Modal` + `ui/Button` primitives. No backend, no new runtime dependencies —
state lives in the existing Zustand store persisted to `localStorage`.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict mode, no escape hatches per Constitution Principle II)
**Primary Dependencies**: Next.js 15 (App Router), React 19, Zustand 5 (with `persist` + `subscribeWithSelector` middleware), Tailwind CSS 3.4, `clsx` + `tailwind-merge` (existing `cn` helper). **No new runtime deps.**
**Storage**: In-memory Zustand store, persisted to browser `localStorage` via the existing `persist` slice (key `thestats.game.v1`). The two new event variants join the already-persisted `events` array; no schema-version bump needed (additive, backward-compatible). No Supabase / server involvement.
**Testing**: Vitest + @testing-library/react for unit/component; Playwright for the end-to-end team-action flow.
**Target Platform**: Web (courtside tablets and phones), responsive from 360px per Constitution Principle IV.
**Project Type**: Web frontend in a monorepo — shared domain in `packages/core`, UI + store in `packages/web`.
**Performance Goals**: Recording a team action reflects in the UI within 100ms (Principle IV). Stats stay derived + memoized; no new heavy work on the main thread.
**Constraints**: Score adjustments are strictly additive positive whole numbers — no code path may reduce a team's score through Team Actions (including via edit). Offline-capable (localStorage only). Turnover recording gated to live/break states; score awards available from `ready` onward.
**Scale/Scope**: Single live game in memory; two new event types; one new modal; ~5 touched files in `packages/web` + 2 in `packages/core`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| I. TDD (NON-NEGOTIABLE) | **PASS (planned)**. Every change is preceded by a failing test: `stats.test.ts` for the two new fold cases, `store.test.ts` for the two mutators + edit/delete/undo + the positive-points guard, component tests for `TeamActionsModal` and the new TeamPanel button, `GameLog.test.tsx` for the new descriptors, and a Playwright e2e for the full flow. Tests written and observed failing before implementation. |
| II. Strict Type Safety | **PASS**. New behavior modeled as discriminated-union `GameEvent` variants and a `TeamTurnoverKind` literal union; new store mutators and component props explicitly typed. No `any`, no casts, no non-null assertions. `EditEventPatch` extended with matching branches. |
| III. Component-Driven Architecture | **PASS**. `TeamActionsModal` is a single-purpose Client Component built from shared `ui/Modal` + `ui/Button` primitives; presentation stays separate from the store mutation it invokes. TeamPanel gains one prop (`onTeamActionsClick`) — no new responsibility mixing. |
| IV. Performant & Responsive UX | **PASS**. Modal + button are light DOM; stats remain derived via the memoized `computeStats` selector. Layout is responsive (mirrors the existing 3-button footer). No bundle additions > 20KB. |
| V. Engineering Discipline | **PASS**. Reuses existing event-sourcing, modal, and edit/delete patterns (DRY); no premature abstraction. Lint/format/typecheck gates apply. |
| VI. Secure & Typed Backend Boundary (NON-NEGOTIABLE) | **N/A**. This feature adds no Route Handler, Server Action, or Supabase schema — it is entirely client-side over the existing in-memory + localStorage store. No RLS, auth, or migration surface is introduced. |

**Result**: PASS. No violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/008-team-actions/
├── plan.md              # This file (/speckit.plan command output)
├── spec.md              # Feature specification (/speckit.specify + /speckit.clarify)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── store-api.md      # Store mutators, event/type shapes, component props
├── checklists/
│   └── requirements.md  # Spec quality checklist (/speckit.specify)
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/core/src/
├── types.ts             # ADD: team-turnover & team-score-adjust GameEvent variants,
│                        #      TeamTurnoverKind union, EditableEvent + EditEventPatch
│                        #      branches, teamTurnovers field on TeamStats
├── constants.ts         # ADD: TEAM_TURNOVER_KINDS list / labels (extensible set)
├── stats.ts             # ADD: fold cases for the two new event types
├── stats.test.ts        # ADD: tests for team turnover count + additive score
└── index.ts             # EXPORT new types/constants as needed

packages/web/src/
├── lib/
│   ├── store.ts              # ADD: recordTeamTurnover, recordTeamScoreAdjust mutators;
│   │                         #      extend editEvent (positive-points guard) + deleteEvent
│   └── store.test.ts         # ADD: mutator + guard + edit/delete/undo tests
├── components/game/
│   ├── TeamPanel.tsx         # ADD: "Team Actions" button between Sub and Timeout;
│   │                         #      display team turnover total (FR-014)
│   ├── TeamPanel.test.tsx    # ADD: button presence/placement + click wiring
│   ├── TeamActionsModal.tsx  # NEW: turnover buttons + score-award form
│   ├── TeamActionsModal.test.tsx  # NEW
│   ├── GameLog.tsx           # ADD: describe() cases for the two new event types
│   ├── GameLog.test.tsx      # ADD: descriptor assertions
│   ├── EditEventModal.tsx    # ADD: editing UI for the two new editable types
│   └── DeleteEventConfirmModal.tsx  # (allowlist already generic via deleteEvent)
└── app/game/page.tsx         # WIRE: teamActionsSide state + <TeamActionsModal/>

tests/ (e2e)
└── e2e/team-actions.spec.ts  # NEW: Playwright flow (turnover + additive award + undo)
```

**Structure Decision**: Existing monorepo web layout. Domain types, constants, and the
pure stats fold live in `packages/core` (shared, framework-free). Store mutators,
components, and the page wiring live in `packages/web`. This mirrors features 004
(edit/delete) and 007 (possession arrow) exactly.

## Complexity Tracking

> No Constitution violations — table intentionally empty.
