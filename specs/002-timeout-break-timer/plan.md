# Implementation Plan: Timeout & Period-Break Timer

**Branch**: `002-timeout-break-timer` | **Date**: 2026-05-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-timeout-break-timer/spec.md`

## Summary

Add a visible countdown timer for timeouts and between-period breaks, plus a single primary-action button in the existing `ActionPad` that ends the current break early. The clock area reuses the existing display/edit/nudge surface; while a break is in progress the action pad shows only the "End Timeout" / "Start Next Quarter" / "Start Second Half" / "Start Overtime" button and hides every other control. Three new configurable durations (timeout, between-quarter break, halftime break) live in the existing Game Settings section of the setup page.

**Strong scope constraint from user (plan args)**: *"Do not create any new components."* — every change is made by editing existing files. No new files in `packages/web/src/components/**`. The only new files in this feature are the spec deliverables under `specs/002-timeout-break-timer/` and any newly added test files for behaviors that previously had no coverage surface.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict mode, no escape hatches per Constitution Principle II)
**Primary Dependencies**: Next.js 15 (App Router), React 19, Zustand 5 (game state), Tailwind CSS 3.4, `clsx` + `tailwind-merge` (existing `cn` helper)
**Storage**: In-memory Zustand store (existing). `GameSettings` is currently frozen for the game's duration; this feature extends it with three new numeric fields. No new persistence layer.
**Testing**: Vitest + `@testing-library/react` for unit/component coverage (existing). Playwright is configured but not required for this feature's logic-heavy changes; component-level tests are sufficient.
**Target Platform**: Browser (tablet- and phone-first per Constitution Principle IV). Same target as the rest of the web app.
**Project Type**: Web application (Next.js front-end at `packages/web`).
**Performance Goals**: Action-button tap → state update reflected within 100ms (Constitution Principle IV, mirrored by SC-004). Countdown ticks once per visible second; under-the-hood it uses the existing `requestAnimationFrame` loop in [useGameClock.ts](../../packages/web/src/hooks/useGameClock.ts).
**Constraints**: No new React components (user directive). Reuse `GameClock`, `ClockPanel`, `ClockEditor`, `ClockNudge`, `ActionPad`, `useGameClock`, and the setup page as-is in file count; modify their internals only. WCAG 2.1 AA contrast + keyboard operability preserved (Constitution Tech & Quality Standards).
**Scale/Scope**: Single-device app, one active game at a time. Surface area touched: ~3 store actions modified + 1 new (`endTimeout`), 4 component files modified, 1 hook modified, 1 setup page modified, ~6 new tests added.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Compliance | Notes |
|---|---|---|
| **I. Test-Driven Development** | PASS | Every new behavior (status transition into `timeout`, break-seconds field, ActionPad gating, setup inputs, halftime detection) gets a failing test first. Test list enumerated in `tasks` phase. |
| **II. Strict Type Safety** | PASS | `GameSettings` extended with three explicit `number` fields; `GameStatus` union extended with the literal `"timeout"`. No `any`, no casts. The store action `endTimeout` is added to the explicit store interface (line 77 area of `store.ts`). |
| **III. Component-Driven Architecture** | PASS — with deliberate non-creation | User directive *"do not create any new components"* aligns with the principle by *reusing* existing single-purpose components rather than spawning new ones. `GameClock` stays display-only (now also reads `breakSeconds` when in a break state); `ClockEditor`/`ClockNudge` continue to handle their respective interactions; `ActionPad` gains a new render branch but keeps the same responsibility (central control column). No mixing of new concerns. |
| **IV. Performant & Responsive UX** | PASS | Tap-to-end-break uses the same Zustand action pattern as existing CTAs (synchronous set; <16ms). The countdown shares the existing RAF loop in `useGameClock`, so adding break ticking costs zero additional timers. Responsive layout: setup-page input row inherits the existing `grid-cols-2 md:grid-cols-5` pattern so the three new inputs flow into a second row on small screens. |
| **V. Engineering Discipline & Industry Standards** | PASS | Store/state changes are additive (no breaking renames). Tests stay deterministic by re-using the existing `seedReadyGame` helper. No new runtime dependencies added. |

**Gate result**: PASS. No Complexity Tracking entries required.

### Post-design re-check (after Phase 1 artifacts)

After producing [research.md](./research.md), [data-model.md](./data-model.md), [contracts/store-api.md](./contracts/store-api.md), and [quickstart.md](./quickstart.md), each principle was re-evaluated against the concrete design:

- **I. TDD** — Confirmed: [contracts/store-api.md](./contracts/store-api.md) enumerates 25 specific store-level tests; the plan's Project Structure section identifies the component test files that gain coverage. Each is a Red → Green target before the matching implementation task.
- **II. Strict Type Safety** — Confirmed: every new field has an explicit type, `GameStatus` is extended via literal union (no widening), `endTimeout` joins the explicit store interface. No `any`, no casts.
- **III. Component-Driven Architecture** — Confirmed: no new component files. `GameClock`/`ClockEditor`/`ClockNudge`/`ClockPanel` keep their single responsibilities; `ActionPad` gains a new render branch but the responsibility is unchanged. Hooks (`useGameClock`) and store actions are extended, not split.
- **IV. Performant & Responsive UX** — Confirmed: single RAF loop, synchronous Zustand state changes, responsive setup-page grid via existing Tailwind columns.
- **V. Engineering Discipline** — Confirmed: purely additive surface changes, zero new runtime deps, no breaking renames. Defaults populated in both 5v5 and 3v3 presets so no consumer code reads `undefined`.

No new violations introduced by the design. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/002-timeout-break-timer/
├── plan.md                # This file
├── research.md            # Phase 0 output
├── data-model.md          # Phase 1 output
├── quickstart.md          # Phase 1 output (manual verification flow)
├── contracts/
│   └── store-api.md       # Store action signatures + invariants
└── checklists/
    └── requirements.md    # Spec quality checklist (already exists from /speckit.specify)
```

### Source Code (repository root)

This is a Next.js web app inside a `packages/web` workspace. **No new files** in `packages/web/src/components/` per user directive. Test files alongside existing components are extended; one new test file may be added for the setup-page durations if no existing setup-page test exists.

```text
packages/web/
├── src/
│   ├── app/
│   │   └── setup/
│   │       └── page.tsx                       # MODIFY: add three duration inputs to the existing Game Settings grid
│   ├── components/
│   │   └── game/
│   │       ├── ActionPad.tsx                  # MODIFY: new render branch for `status === "timeout"`; hide undo/end-period during timeout AND period-break
│   │       ├── ActionPad.test.tsx             # MODIFY: cover timeout-state rendering and gating
│   │       ├── ClockPanel.tsx                 # MODIFY: include `status === "timeout" | "period-break"` in the editable surface gate
│   │       ├── ClockPanel.test.tsx            # MODIFY: cover timeout/break editor surface
│   │       ├── GameClock.tsx                  # MODIFY: read `breakSeconds` (instead of `clockSeconds`) when in timeout / period-break
│   │       ├── GameClock.test.tsx             # MODIFY: cover the new render path
│   │       ├── ClockEditor.tsx                # MODIFY: route commit to `adjustClock` which is now status-aware (no signature change here)
│   │       └── ClockNudge.tsx                 # MODIFY: bounds for break states (no upper cap on +1m during break, lower cap at 0)
│   ├── hooks/
│   │   ├── useGameClock.ts                    # MODIFY: trigger the RAF loop when status is "timeout" or "period-break" (not only when clockRunning)
│   │   └── useGameClock.test.ts               # MODIFY: cover break-state ticking
│   └── lib/
│       ├── types.ts                           # MODIFY: extend `GameStatus` with "timeout"; extend `GameSettings` with three new fields
│       ├── constants.ts                       # MODIFY: add defaults (60s / 120s / 600s) to both 5v5 and 3v3 presets
│       ├── store.ts                           # MODIFY: add `breakSeconds`; new `endTimeout()`; update `recordTimeout`, `endPeriod`, `startNextPeriod`, `tickClock`, `adjustClock`
│       └── store.test.ts                      # MODIFY: cover the new state transitions and the halftime-vs-quarter-break selection logic
```

**Structure Decision**: Modify-only inside `packages/web/src/`. No new component files. The plan keeps the constitution's component-driven architecture by extending existing single-purpose components rather than creating new ones. Test files alongside each modified source file gain new coverage.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_ | _(none)_ | _(none)_ |

No principle violations. The "no new components" constraint is consistent with the constitution and is being applied as a deliberate scope-tightener.
