# Implementation Plan: Overtime Trigger

**Branch**: `003-overtime-trigger` | **Date**: 2026-05-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-overtime-trigger/spec.md`

## Summary

When the scorekeeper ends the final regulation period (or any subsequent overtime period), the system inspects the live score and routes the game into either a `period-break` (tied → next OT) or `finished` (winner → final). Tied games loop through unlimited overtimes until a winner emerges. The scorekeeper can opt out of the timed-OT trigger entirely via a new `Overtime` toggle in setup (e.g., for FIBA 3x3 sudden-death rules) and can configure the OT length via a new `Overtime length (min)` input. Period labels in the scoreboard and play-by-play log change from `OT, OT2, OT3, …` to `OT, 2OT, 3OT, …`.

This feature leverages substantial existing infrastructure: `settings.overtimeSeconds` already exists, `startNextPeriod` already uses it for OT period length, and the `ActionPad` already labels the primary break button `"Start Overtime"` when `currentPeriod >= settings.periods`. The genuinely new surface is concentrated in three places: the `endPeriod` routing decision (now consults the score), two new setup-page inputs (Overtime length + Overtime On/Off toggle), and a one-line label-format change in `formatPeriod`.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict mode, no escape hatches per Constitution Principle II)
**Primary Dependencies**: Next.js 15 (App Router), React 19, Zustand 5, Tailwind CSS 3.4, `clsx` + `tailwind-merge` (existing `cn` helper)
**Storage**: In-memory Zustand store (existing). `GameSettings` gains one new boolean field (`overtimeEnabled`). The existing `overtimeSeconds` field is reused with no shape change.
**Testing**: Vitest + `@testing-library/react` for unit/component (existing). Playwright for end-to-end (existing).
**Target Platform**: Browser (tablet- and phone-first per Constitution Principle IV).
**Project Type**: Web application (Next.js front-end at `packages/web`).
**Performance Goals**: Action-button tap → state update within 100ms (Constitution Principle IV, mirrored by SC-006). The `endPeriod` routing decision adds a single synchronous `computeStats` call to the existing action.
**Constraints**: `endPeriod` is the single hot path that needs the score check; everything else is additive. No new event variants required (the existing `period` events with `action: "end"` / `"start"` continue to capture the transitions). Per Constitution Principle III the changes reuse existing components (`ActionPad`, setup `page.tsx`, `GameLog`) and add no new ones — the feature is a behavior change on existing surfaces.
**Scale/Scope**: Single-device app, one active game at a time. Surface area touched: ~1 store action modified (`endPeriod`), ~1 helper modified (`formatPeriod`), `GameSettings` interface extended with one boolean field, `DEFAULT_SETTINGS` extended with two field values per format, setup page gains 2 new inputs, ~10 new tests added.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Compliance | Notes |
|---|---|---|
| **I. Test-Driven Development** | PASS | Each new behavior (endPeriod tied/untied routing for both regulation and OT, multi-OT loop, formatPeriod new labels, overtimeEnabled gate, setup-page inputs) gets a failing test first per Principle I. Test plan enumerated in the contracts. |
| **II. Strict Type Safety** | PASS | `overtimeEnabled: boolean` added to the explicit `GameSettings` interface; defaults added to both formats. No `any`, no casts. |
| **III. Component-Driven Architecture** | PASS | Zero new component files. Each change edits an existing file. `ActionPad` already has the `nextPeriodLabel` derivation; no logic added. Setup page gets two more `Input`/toggle entries using existing primitives. |
| **IV. Performant & Responsive UX** | PASS | `endPeriod` now invokes `computeStats(events, ...)` once per call. `computeStats` is a pure synchronous fold over events — typical game ≤ 500 events, well under 1ms. No additional renders or async work introduced. |
| **V. Engineering Discipline & Industry Standards** | PASS | Purely additive changes (one new settings field, one new helper output format, two new setup inputs). No new runtime deps. `formatPeriod` label change is a small breaking-format change for downstream consumers, but the function is project-private and only consumed by `Scoreboard` and `GameLog`. |

**Gate result**: PASS. No Complexity Tracking entries required.

### Post-design re-check (after Phase 1 artifacts)

Re-evaluated after writing [research.md](./research.md), [data-model.md](./data-model.md), [contracts/store-api.md](./contracts/store-api.md), and [quickstart.md](./quickstart.md):

- **I. TDD** — Confirmed: [contracts/store-api.md](./contracts/store-api.md) enumerates the 12 specific test cases. Each implementation task has a paired test task.
- **II. Strict Type Safety** — Confirmed: `overtimeEnabled` is a strict `boolean`, no widening; `formatPeriod`'s return type is unchanged.
- **III. Component-Driven Architecture** — Confirmed: zero new component files. The opt-in toggle reuses the existing `FormatToggle` pattern from the setup page (5v5 / 3v3) and the existing `Input` primitive.
- **IV. Performant & Responsive UX** — Confirmed: `endPeriod` adds one synchronous `computeStats` call; tap-to-CTA latency well under the 100ms budget.
- **V. Engineering Discipline** — Confirmed: additive changes only; no deps; the `formatPeriod` label change has narrow blast radius (covered by existing tests, which will be updated as part of the format change).

No new violations. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/003-overtime-trigger/
├── plan.md                # This file
├── research.md            # Phase 0 output
├── data-model.md          # Phase 1 output
├── quickstart.md          # Phase 1 output (manual verification flow)
├── contracts/
│   └── store-api.md       # endPeriod routing contract + UI contracts
└── checklists/
    └── requirements.md    # Spec quality checklist (already exists from /speckit.specify)
```

### Source Code (repository root)

Next.js web app inside `packages/web`. **No new component files** — the feature is purely additive to existing files and helpers. The setup page gains two new inputs that reuse the existing `Input` and `FormatToggle` patterns.

```text
packages/web/
├── src/
│   ├── app/
│   │   └── setup/
│   │       ├── page.tsx                   # MODIFY: add Overtime length (min) input + Overtime On/Off toggle in the Game Settings section
│   │       └── page.test.tsx              # MODIFY: add tests for the two new setup-page inputs
│   ├── components/
│   │   └── game/
│   │       ├── ActionPad.tsx              # UNCHANGED — `nextPeriodLabel` already returns "Start Overtime" when currentPeriod >= settings.periods
│   │       ├── Scoreboard.tsx             # UNCHANGED — already calls formatPeriod for the period label
│   │       └── GameLog.tsx                # UNCHANGED — already calls formatPeriod for play-by-play period rendering
│   └── lib/
│       ├── types.ts                       # MODIFY: extend GameSettings with `overtimeEnabled: boolean`
│       ├── constants.ts                   # MODIFY: add `overtimeEnabled` defaults (true for 5v5, false for 3v3)
│       ├── utils.ts                       # MODIFY: change `formatPeriod` so subsequent OTs render `<n>OT` instead of `OT<n>`
│       ├── utils.test.ts                  # MODIFY: update the existing OT-numbering test to assert the new format
│       ├── store.ts                       # MODIFY: `endPeriod` consults `computeStats(...)` and gates on `overtimeEnabled && overtimeSeconds > 0`
│       └── store.test.ts                  # MODIFY: add tests covering the four routing branches (tied + enabled, tied + disabled, untied + enabled, untied + disabled) for both final regulation and OT periods
```

**Structure Decision**: Modify-only inside `packages/web/src/`. No new files. Existing test files alongside each modified source file gain new coverage.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_ | _(none)_ | _(none)_ |
