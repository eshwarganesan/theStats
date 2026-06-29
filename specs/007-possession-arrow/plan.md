# Implementation Plan: Possession Arrow

**Branch**: `007-possession-arrow` | **Date**: 2026-06-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-possession-arrow/spec.md`

## Summary

Add a tap-to-flip **alternating-possession arrow** indicator beside the live game clock, gated by a new `possessionArrowEnabled` boolean on `GameSettings` (default `true` for 5v5, `false` for 3v3) that is set in the setup screen and frozen at game start. The indicator is a small, reusable presentational component — `<PossessionArrow direction onCycle disabled />` — mounted inside `Scoreboard.tsx`'s center column adjacent to `ClockPanel`. Direction is a literal union `'unset' | 'home' | 'away'` stored on the Zustand game state and persisted through the existing feature-006 `partialize` slice, so refresh restores the arrow exactly where it stood. A single store action `cyclePossessionArrow()` enforces the FR-006 cycle (`unset → home → away → home → away …`, with no path back to `unset` mid-game). The indicator is non-interactive (dimmed via reduced opacity) when `status === 'finished'`. Arrow flips are NOT play-by-play events — they do not interact with `undoLastEvent`, do not appear on the Stats or Scoresheet pages, and have no scoring side-effects. Vitest covers the presentational component, the store action, the format-driven default cascade, and the persist `partialize` round-trip; Playwright covers the four acceptance scenarios end-to-end.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict mode, no escape hatches per Constitution Principle II)
**Primary Dependencies**: Next.js 15 (App Router), React 19, Zustand 5 (existing — already wrapped with `persist` middleware by feature 006), Tailwind CSS 3.4, `clsx` + `tailwind-merge` (existing `cn` helper). **No new runtime deps.**
**Storage**: Browser `localStorage` only, via the existing `persist` slice introduced by feature 006 (key `thestats.game.v1`). The new `possessionArrow` direction joins the existing partialized fields; the new `possessionArrowEnabled` setting flows through `settings`, which is already persisted. No server-side, Supabase, or backend involvement.
**Testing**: Vitest + @testing-library/react + `@testing-library/user-event` for unit/component tests (`<PossessionArrow>`, store action, default-settings cascade, setup-page toggle wiring). Playwright for E2E covering every acceptance scenario from the spec (visible-on-5v5 / hidden-on-3v3, tap-to-cycle, refresh restores direction, finished-game read-only).
**Target Platform**: Browser — Chromium-class engines (Playwright project is Desktop Chrome; production targets tablets and phones courtside per Principle IV).
**Project Type**: Web application — extends the existing `packages/web/` Next.js workspace and the `packages/core` domain-types package. No new packages, no backend changes.
**Performance Goals**: Tap-to-flip reflected in the UI within 100 ms (SC-002, also matches Principle IV's action-to-UI budget). No regression to Scoreboard render time on clock ticks (the new component does not subscribe to `clockSeconds`).
**Constraints**: Minimum touch target 44×44 pt (FR-003 / WCAG 2.1 AA tap-size guidance per Constitution "Accessibility"). Indicator MUST NOT mutate clock / score / period / fouls / timeouts / event log (FR-007, SC-006). Direction render is live-game-screen-only (FR-014); MUST NOT appear in Stats / Scoresheet / summary views (Q2 clarification).
**Scale/Scope**: One in-memory game at a time; the `possessionArrow` field adds one literal-union string to the persisted record. No measurable storage-size impact (≤16 bytes added to the existing serialized blob).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Test-Driven Development (NON-NEGOTIABLE) | PASS | Every task in tasks.md will pair a failing test with the implementation. Vitest covers the component (3 states, cycle, disabled), the store action (FR-006 cycle + no-unset re-entry), the default cascade (`possessionArrowEnabled` follows format toggle), and the `partialize` round-trip. Playwright covers all 4 acceptance scenarios. |
| II. Strict Type Safety | PASS | `possessionArrow` is a literal union `'unset' \| 'home' \| 'away'` — narrowed at every use. `possessionArrowEnabled` is a `boolean` field on the existing typed `GameSettings`. No `any`, no `as`, no `!`, no `@ts-ignore`. The `<PossessionArrow>` props interface is explicit; the store action signature is explicit. |
| III. Component-Driven Architecture | PASS | `<PossessionArrow>` is purely presentational — props only, no Zustand subscriptions, no data-fetching, no side-effects. It lives at `packages/web/src/components/game/PossessionArrow.tsx` and is consumed by `Scoreboard.tsx`, which owns the store-subscription + gating logic. The setup-page toggle reuses the inline two-button pattern established by `OvertimeToggle` (feature 003) for visual consistency. |
| IV. Performant & Responsive UX | PASS | The indicator subscribes only to `settings.possessionArrowEnabled`, `possessionArrow`, and `status === 'finished'` — never to `clockSeconds` — so it does not re-render on the 1 Hz clock tick. The tap path is a single `set()` call. No bundle impact > 20 KB gzipped (one small component, no new deps). Minimum touch target 44×44 pt. |
| V. Engineering Discipline & Industry Standards | PASS | No new runtime deps. The literal-union type avoids stringly-typed magic values. Reuses the existing `cn` helper, the existing `persist` slice, the existing format-default cascade. No secrets. Lint/format/typecheck stay green. |
| VI. Secure & Typed Backend Boundary (NON-NEGOTIABLE) | N/A | Feature is purely client-side. No Route Handler, no Server Action, no Supabase table, no schema migration, no auth boundary. |

No violations to track in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/007-possession-arrow/
├── plan.md              # This file (/speckit.plan output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── possession-arrow-component.md
│   ├── store-cycle-action.md
│   └── settings-default-cascade.md
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

This feature extends the existing `packages/web/` Next.js workspace and the `packages/core` domain-types package. No new packages.

```text
packages/core/
└── src/
    ├── types.ts                                # MODIFIED — add `possessionArrowEnabled: boolean` to GameSettings
    └── constants.ts                            # MODIFIED — add `possessionArrowEnabled: true` (5v5) / `false` (3v3) to DEFAULT_SETTINGS

packages/web/
├── src/
│   ├── lib/
│   │   ├── store.ts                            # MODIFIED — add `possessionArrow: 'unset' | 'home' | 'away'` to GameState; add `cyclePossessionArrow` action; include `possessionArrow` in `partialize`; reset to `'unset'` on `resetAll` / `prepareGame`
│   │   └── store.test.ts                       # MODIFIED — add tests: cycle action (FR-006), no-unset re-entry, partialize round-trip, reset on new game
│   ├── components/
│   │   └── game/
│   │       ├── PossessionArrow.tsx             # NEW — reusable presentational component (3 states, cycle handler, disabled prop)
│   │       ├── PossessionArrow.test.tsx        # NEW — Vitest: renders 3 states, fires onCycle on tap, suppresses onCycle when disabled, 44×44 min target, ARIA label
│   │       └── Scoreboard.tsx                  # MODIFIED — mount <PossessionArrow> inside center column adjacent to <ClockPanel>, gated by settings.possessionArrowEnabled, disabled when status === 'finished'
│   └── app/
│       └── setup/
│           ├── page.tsx                        # MODIFIED — add `PossessionArrowToggle` inline pair beside the existing `OvertimeToggle` in Game Settings; wire to setSettings({ possessionArrowEnabled })
│           └── page.test.tsx                   # MODIFIED OR NEW — Vitest: 5v5 default On, 3v3 default Off, click flips the setting; if no existing page.test.tsx, scope to the new toggle only
└── tests/
    └── e2e/
        └── possession-arrow.spec.ts            # NEW — covers: indicator visible on 5v5 / hidden on 3v3, tap cycles unset→home→away→home, refresh restores direction, finished-game indicator dimmed and non-interactive
```

**Structure Decision**: Extend the existing `packages/web/` Next.js workspace and the `packages/core` domain-types package. The reusable indicator is `<PossessionArrow>` — a pure presentational component (props in, JSX out, no store subscriptions) — placed in the existing `components/game/` directory next to `Scoreboard.tsx`, `ClockPanel.tsx`, and `GameClock.tsx`. The Scoreboard owns the store-subscription / gating logic and passes props down. The setup toggle uses the same inline two-button pattern as `OvertimeToggle` (feature 003) for visual and code consistency; promoting that pattern to a shared `OnOffToggle` primitive is a desirable Principle V cleanup but is **out of scope** for this feature (would touch unrelated code in the same PR and bypass the YAGNI guardrail). The new `possessionArrow` field joins the existing `persist`-middleware `partialize` set introduced by feature 006 — no new persistence layer, no new storage key. No backend changes (Principle VI N/A).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations to justify. Table intentionally omitted.
