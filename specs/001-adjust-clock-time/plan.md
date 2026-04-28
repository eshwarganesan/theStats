# Implementation Plan: Adjust Clock Time When Paused

**Branch**: `001-adjust-clock-time` | **Date**: 2026-04-28 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-adjust-clock-time/spec.md`

## Summary

Surface a manual clock-correction affordance on the existing `GameClock` display so that a courtside scorekeeper can re-align the app's countdown clock with the official scorer's-table clock during a stoppage. The feature exposes (a) a tap-to-edit `mm:ss` field on the clock digits and (b) two ±1s nudge controls, both visible only when the game is `live` and the clock is paused. Confirmed adjustments record a `clock` event of `action: "adjust"` (carrying the previous and new values) into the existing event-sourced play-by-play log; rapid nudge sessions coalesce into a single event when the user settles. Adjusting the clock up from `0:00` clears the implicit "End Period" CTA naturally because that CTA is already derived from `clockSeconds === 0`.

The store already has a private `adjustClock(seconds)` action that is *not* surfaced in the UI and that has two latent defects this feature corrects: it caps at `settings.periodSeconds` rather than the *current* period's length (wrong for overtime), and it does not append a play-by-play event. The plan renames/extends this into a fully-modeled action and wires it through a new presentation component without redesigning the clock model.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict mode, no escape hatches per Constitution Principle II)
**Primary Dependencies**: Next.js 15 (App Router), React 19, Zustand 5, Tailwind CSS 3.4, `clsx` + `tailwind-merge` (existing `cn` helper)
**Storage**: In-memory Zustand store (event-sourced; `GameEvent[]` is the source of truth). No persistence layer added by this feature.
**Testing**: Vitest 2.1 + `@testing-library/react` 16 + `@testing-library/user-event` 14 for unit/component; Playwright 1.48 for end-to-end. Coverage via `@vitest/coverage-v8`.
**Target Platform**: Modern evergreen browsers on courtside tablets (iPad / Android tablets, ≥360px width) and desktop. Mobile-first input (numeric on-screen keypad must surface for the typed time field).
**Project Type**: Single-package web app (`packages/web`); no backend yet (constitution flags this as a follow-up; this feature does not introduce a backend dependency).
**Performance Goals**: Tap → committed clock value visible within one frame (≤16 ms on a mid-tier tablet); meets the constitution's 100 ms interaction budget with margin. No effect on the existing `requestAnimationFrame` clock loop (the loop only runs while `clockRunning === true`, which is by definition false when this feature is in use).
**Constraints**: No new runtime dependency added (constitution justification gate). All adjustment paths must clamp into `[0, currentPeriodMax]` server-side (i.e., inside the store action), not only at the input layer, to satisfy SC-003 even if a future caller bypasses the UI. The `GameClock` component must remain a pure presentational read of the store; the new editing affordance is a child/sibling.
**Scale/Scope**: One concurrent game per device; an adjustment session typically ≤ 10 events per game. No multi-user concerns.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` v1.0.0:

| Principle | Check | Status |
|-----------|-------|--------|
| **I. Test-Driven Development (NON-NEGOTIABLE)** | Each store change and each component behavior gets a failing Vitest test first. The store action's clamping, period-aware max, and event emission each get a unit test in `store.test.ts`. The component gets a `GameClock.test.tsx` (or sibling) test for visibility gating, edit commit, nudge, cancel, and accessibility. An end-to-end Playwright spec exercises the full pause-edit-resume loop and verifies the play-by-play entry. Coverage on `store.ts` and the affected component must not regress. | ✅ PASS |
| **II. Strict Type Safety** | The `GameEvent` `clock` variant gains an `"adjust"` action with new `from: number` and `to: number` fields (typed at the union-member level, not as optional `?` on the existing variant — see [data-model.md](data-model.md)). All store-action signatures and component props are explicitly typed. No `any`, no non-null assertions. The mm:ss parse helper returns `number \| null` (no sentinel). | ✅ PASS |
| **III. Component-Driven Architecture** | The current `GameClock` is purely presentational (reads three store fields, renders a span). The editing affordance is a *separate* small component (`ClockAdjuster`) co-located in `packages/web/src/components/game/`. The mm:ss parse/format helper goes in `lib/utils.ts` next to the existing `formatClock`. No mixing of data-fetching, state, and presentation. | ✅ PASS |
| **IV. Performant & Responsive UX** | Operates entirely on paused-clock state, so it never competes with the rAF tick loop. The numeric keypad surfaces via `<input inputMode="numeric" pattern="[0-9:]*">` — no JavaScript keyboard component, no bundle growth. Layout is responsive from 360px (the nudge buttons stack below the clock on narrow viewports). Bundle delta target: < 1 KB gzipped (the only new code is one helper, one component, and one store action). | ✅ PASS |
| **V. Engineering Discipline & Industry Standards** | No new runtime dependency. Coalescing logic lives in one place (the store) rather than being duplicated in the component. The mm:ss parser is a pure function and unit-tested. PR description will note (a) the latent `adjustClock` cap bug and (b) the rationale for the union-member redesign of the clock event variant. | ✅ PASS |

**Result**: All gates pass. No entries in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-adjust-clock-time/
├── plan.md              # This file (/speckit.plan command output)
├── spec.md              # Authoritative requirements (already exists)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── store-action.md      # Public surface of `adjustClock`
│   └── component-contract.md # Visibility, props, events, a11y of `ClockAdjuster`
├── checklists/
│   └── requirements.md  # /speckit.specify output (already exists)
└── tasks.md             # /speckit.tasks output (NOT created by /speckit.plan)
```

### Source Code (repository root)

This is a single-package web application. The frontend lives in `packages/web` and there is currently no backend package (the constitution flags this as a follow-up but this feature does not introduce one).

```text
packages/web/
├── src/
│   ├── app/                              # Next.js App Router routes (no changes)
│   ├── components/
│   │   ├── game/
│   │   │   ├── GameClock.tsx             # MODIFIED: composes new ClockAdjuster
│   │   │   ├── GameClock.test.tsx        # MODIFIED: gating + composition tests
│   │   │   ├── ClockAdjuster.tsx         # NEW: edit field + ±1s nudge buttons
│   │   │   ├── ClockAdjuster.test.tsx    # NEW: unit/component tests
│   │   │   ├── GameLog.tsx               # MODIFIED: render the new "adjust" event
│   │   │   ├── GameLog.test.tsx          # MODIFIED: snapshot of new entry
│   │   │   └── (other game components, unchanged)
│   │   └── ui/                           # No additions; using existing primitives
│   ├── hooks/
│   │   └── useGameClock.ts               # No change (only runs while running)
│   └── lib/
│       ├── store.ts                      # MODIFIED: adjustClock semantics + event emission
│       ├── store.test.ts                 # MODIFIED: clamping, OT max, event emission, coalesce
│       ├── types.ts                      # MODIFIED: `clock` event variant gains "adjust" action with from/to
│       ├── utils.ts                      # MODIFIED: add `parseClock(input: string): number | null`
│       └── utils.test.ts                 # MODIFIED: parseClock tests
└── tests/
    └── e2e/
        └── adjust-clock.spec.ts          # NEW: full pause → edit → resume → log assertion
```

**Structure Decision**: Single-package web layout (`packages/web` only). Confirmed by inspection: only `packages/web` exists; no `backend/`, `api/`, `ios/`, or `android/` packages are present. The feature is entirely client-side because the game state is held in the in-memory Zustand store; persistence and any future server sync are out of scope per Assumptions in the spec.

## Complexity Tracking

> No constitution violations. Section intentionally empty.
