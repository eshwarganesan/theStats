# Phase 0 Research: Possession Arrow

**Feature**: 007-possession-arrow
**Date**: 2026-06-28
**Status**: Complete — no NEEDS CLARIFICATION markers remain.

## Purpose

Phase 0 resolves any technical unknowns before Phase 1 design. Most decisions for this feature are constrained by precedent set in features 003 (`overtimeEnabled` toggle pattern) and 006 (Zustand `persist` middleware + `partialize`). The items below are the questions that *could* have produced ambiguity at planning time; each is resolved with a decision, rationale, and the alternatives considered.

---

## Decision 1: Naming — `possessionArrow` vs reuse of existing `possession` field

**Decision**: Introduce a new field `possessionArrow: 'unset' | 'home' | 'away'` on `GameState`. **Do not** reuse the existing `possession: Side | null` field.

**Rationale**: The existing `possession` field on the Zustand store tracks **current ball possession** — it controls the pulsing dot beside the team tag in `Scoreboard.tsx` (lines 109–114). The new feature tracks the **alternating-possession arrow**, a referee-driven indicator for held-ball / jump-ball decisions. These are two semantically distinct concepts in basketball; conflating them would (a) silently change the meaning of `possession` for callers that already read it, (b) collide with the `null` sentinel currently used for "no current possession," and (c) make the FR-006 cycle rule harder to express. A separate field keeps both contracts intact.

**Alternatives considered**:
- *Reuse `possession`* — Rejected: conflates two different concepts; would require renaming or sentinel disambiguation that bleeds into Scoreboard rendering.
- *Name the new field `arrow`* — Rejected: too generic; the codebase has many "arrow"-suggestive UI elements (icons, navigation). `possessionArrow` is the unambiguous basketball term.

---

## Decision 2: Type for direction — literal union vs string vs enum

**Decision**: Literal union `'unset' | 'home' | 'away'` declared in `packages/core/src/types.ts`. Exported as `type PossessionArrowDirection = 'unset' | 'home' | 'away';`.

**Rationale**: Constitution Principle II prohibits `any` and unchecked casts; a literal union gives exhaustive narrowing in switch statements and in the `<PossessionArrow direction />` prop. The codebase already favors literal unions for closed sets (`Side = "home" | "away"`, `GameFormat = "5v5" | "3v3"`, `ScoreKind = "ft" | "2pt" | "3pt"`). A TS enum would diverge from this convention and complicate JSON serialization for `persist`.

**Alternatives considered**:
- *Use `Side | null` with `null = unset`* — Rejected: `null` carries different operational meaning ("no value yet" vs "explicitly unset"). The literal `'unset'` is self-documenting and serializes as a plain string in localStorage.
- *TS enum `PossessionArrowDirection`* — Rejected: enums add runtime baggage and diverge from the codebase's literal-union convention. `as const` plus a literal union is the established idiom.

---

## Decision 3: Store action shape — single cycle vs explicit setters

**Decision**: Single store action `cyclePossessionArrow()` that advances the FR-006 cycle internally (`unset → home → away → home → away …`). Do **not** expose a `setPossessionArrow(direction)` setter.

**Rationale**: Spec FR-006 mandates a fixed cycle and explicitly forbids any mid-game path back to `'unset'`. A single `cyclePossessionArrow()` action encodes that rule inside the store — making it impossible for a caller (or future component) to set the direction to an invalid intermediate value. Components stay dumb (`<PossessionArrow direction onCycle />`), the store stays the single point of truth, and the test surface shrinks to one action with three input states and three output states.

**Alternatives considered**:
- *`setPossessionArrow(direction: PossessionArrowDirection)`* — Rejected: pushes the cycle-rule enforcement to every call site; one bug in Scoreboard or PossessionArrow could set the direction to `'unset'` mid-game, violating FR-006.
- *Two actions: `setPossessionArrow(side: Side)` + `clearPossessionArrow()`* — Rejected: spec disallows mid-game clear (Q1 clarification: "no mid-game path back to **unset**"); the `clear` action would be unreachable code and a footgun.

---

## Decision 4: Indicator placement in the DOM

**Decision**: Mount `<PossessionArrow>` inside `Scoreboard.tsx`'s center column, **directly below** the existing `<ClockPanel>`, inside the same flex container that already wraps the period eyebrow and the clock.

**Rationale**: The spec says "beside the clock," which the existing layout interprets vertically (the center column is `flex-col` with the period eyebrow above the clock). Placing the arrow below the clock keeps the period label dominant at the top, leaves the clock in its current position (no shift on existing screenshots), and uses the natural vertical real estate already in that column. The user's emphasis on a reusable component is honored by the `<PossessionArrow>` API; placement is a Scoreboard concern.

**Alternatives considered**:
- *Horizontally beside the clock (left or right of it)* — Rejected: the center column has tight horizontal space (`min-w-[180px]`) and adding a horizontal sibling would either shrink the clock font or expand the column, shifting the home/away score columns.
- *In the existing team score row near the pulsing-dot possession indicator* — Rejected: visually conflates two distinct concepts (current possession vs. alternating-possession arrow). Spec FR-003 explicitly requires placement "visually adjacent to the live clock."

---

## Decision 5: Toggle UI in setup — reuse vs new inline component

**Decision**: Add a new inline `PossessionArrowToggle` component in `app/setup/page.tsx`, matching the existing `OvertimeToggle` (feature 003) pattern verbatim. Do **not** factor out a shared `OnOffToggle` primitive in this PR.

**Rationale**: The setup page already has two near-duplicate inline toggles (`FormatToggle`, `OvertimeToggle`). Factoring a shared `OnOffToggle` is a desirable DRY cleanup, but it would touch unrelated lines and expand this PR beyond its single-feature scope. YAGNI (Constitution Principle V): defer the abstraction until a third or fourth instance forces the issue. The duplication here is three short toggle pairs in one file — well within the "three-similar-lines is better than a premature abstraction" tolerance from the project guidelines.

**Alternatives considered**:
- *Promote `OnOffToggle` to `components/ui/`* — Rejected for scope reasons (above). Open a follow-up issue if a fourth on/off setting lands.
- *Reuse `TileGroup` or another existing primitive from `components/ui/`* — Rejected: those primitives have different visual contracts; matching `OvertimeToggle` keeps the row visually consistent.

---

## Decision 6: Persistence path for `possessionArrow`

**Decision**: Add `possessionArrow` to the existing `partialize` set in the Zustand `persist` middleware introduced by feature 006 (key `thestats.game.v1`). Do **not** introduce a new storage key, schema version bump, or migration code.

**Rationale**: The existing `partialize` already serializes `homeTeam, awayTeam, settings, status, currentPeriod, events, possession, onCourt`. Adding one literal-union string is a backward-compatible additive change. On a restore from an older payload that lacks the new field, the field is `undefined` and the store's initial value (`'unset'`) prevails — exactly the FR-010 behavior. No schema-version bump is needed; the persist layer already gracefully merges partial payloads.

**Alternatives considered**:
- *New sibling storage key (`thestats.arrow.v1`)* — Rejected: violates "no new persistence layer" (spec Assumptions), and creates a two-key consistency problem the feature does not need.
- *Bump the persist schema version and add a migration* — Rejected: additive fields with safe defaults do not require a version bump under Zustand `persist`'s merge semantics. Reserve version bumps for breaking-shape changes.

---

## Decision 7: Iconography — directional arrow vs split highlight

**Decision**: Directional arrow icon (`◀` for home, `▶` for away) rendered as the visual content of the tap target, with the entire indicator dimmed when `direction === 'unset'`. Implement with a single inline SVG or Unicode glyph; **do not** introduce a new icon library.

**Rationale**: Spec FR-005 leaves iconography to design discretion and lists `◀ HOME — AWAY ▶` as a common pattern. A directional arrow matches basketball-fan mental models (this is literally the "possession arrow" in refereeing). One Unicode glyph plus a flip transform (or two glyphs swapped by direction) is zero-dependency, accessible (via `aria-label`), and crisp on all DPRs. Split-highlight (two halves of an indicator, one lit) was a candidate but reads more like a current-possession affordance and risks confusion with the existing pulsing dot.

**Alternatives considered**:
- *Split highlight (two halves, one highlighted)* — Rejected: visually too similar to the existing `hasPossession` pulsing dot, risking concept confusion (Decision 1).
- *SVG icon from a new icon library (e.g. `lucide-react`)* — Rejected: introduces a new runtime dep for one icon (Principle V: dependencies must be justified). Unicode `◀` / `▶` are sufficient and have full screen-reader support via `aria-hidden` + a sibling `aria-label`.

---

## Decision 8: Accessibility — keyboard, ARIA label, contrast

**Decision**: Render the indicator as a `<button type="button">` so it is keyboard-operable by default (Constitution "Accessibility"). Expose the current direction via `aria-label` (e.g. `"Possession arrow: away"`, `"Possession arrow: unset"`); set `aria-disabled="true"` when `status === 'finished'`. Use accent / muted Tailwind tokens already in the design system to meet WCAG 2.1 AA contrast.

**Rationale**: Constitution Technology & Quality Standards require interactive elements to be keyboard-operable and meet WCAG 2.1 AA contrast. The spec's Assumptions section already calls for accessible text per direction. `<button>` gives focus ring + Enter/Space activation for free, avoiding bespoke `tabindex`/keydown wiring.

**Alternatives considered**:
- *`<div>` with `onClick` only* — Rejected: not keyboard-operable; would violate Constitution accessibility rules.
- *Custom radio group (`role="radiogroup"` with one input per team)* — Rejected: the FR-006 cycle is not a "choose one of N" semantic — it's a stateful toggle. A single button matches the user model.

---

## Open Items

None. All Phase 0 unknowns are resolved with decisions above.
