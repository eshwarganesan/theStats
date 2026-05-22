# Phase 0 Research: Overtime Trigger

**Feature**: 003-overtime-trigger
**Date**: 2026-05-18

Every Technical Context unknown was tractable from existing code and the clarified spec. No `NEEDS CLARIFICATION` markers were carried in. This document captures the decisions made during planning so the implementation phase has a single grounded reference.

## R-001: Where the tied-vs-untied decision lives

**Decision**: Modify the existing `endPeriod` action in [packages/web/src/lib/store.ts](../../packages/web/src/lib/store.ts) to call `computeStats(s.events, s.homeTeam, s.awayTeam, s.settings, s.currentPeriod)` at decision time, compare `stats.home.points === stats.away.points`, and gate the existing "`finished` vs `period-break`" branch on the tied-and-overtime-enabled combination.

**Rationale**:
- `endPeriod` is already the single source of truth for "what state do we land in after a period ends." Adding the score check there keeps the routing logic in one place.
- `computeStats` is a pure function over `events` already used by `Scoreboard` and the stats page. Re-using it guarantees the trigger sees exactly the same totals the scoreboard shows at the moment of the buzzer.
- No new event variants are needed (per the spec clarification: breaks are transient UI/state).

**Alternatives considered**:
- *Cache a `tied: boolean` derived value in store state and read it in `endPeriod`* — rejected because it duplicates information already available via `computeStats` and would need invalidation on every score/foul event.
- *Move the decision to a separate `decideEndPeriodRouting` selector* — rejected because the decision is intrinsic to the `endPeriod` mutation and splitting it adds indirection with no payoff.

## R-002: Shape of the new opt-in toggle

**Decision**: Add a single `overtimeEnabled: boolean` field to `GameSettings`. The combined gate for the tied-triggers-OT rule is `overtimeEnabled === true && overtimeSeconds > 0`. Defaults: `overtimeEnabled: true` for 5v5, `false` for 3v3. The setup-page UI exposes the toggle using the existing `FormatToggle`-style two-button pattern (`On` / `Off`) for visual consistency with the existing `5v5` / `3v3` toggle.

**Rationale**:
- A boolean flag is the smallest possible addition. It cleanly separates "is OT enabled at all" from "what's the OT length" — needed for the FIBA 3x3 sudden-death use case where a scorekeeper may still want to track a 3v3 game with the timed-OT trigger disabled.
- Both gates kept in tandem (`enabled === true && seconds > 0`) protects against the "enabled but length zero" misconfiguration — falling back to "OT disabled" is more conservative than letting a zero-length OT clock start.
- The `FormatToggle` pattern is already a primitive in [setup/page.tsx:164-189](../../packages/web/src/app/setup/page.tsx#L164-L189) (the 5v5 / 3v3 picker). Reuse keeps the visual language consistent and avoids creating a new toggle component.

**Alternatives considered**:
- *Single gate on `overtimeSeconds > 0` (no new field)* — rejected because there's no way to say "I want length=5 but no automatic trigger" with one field, which the FIBA 3x3 use case explicitly requires.
- *Three-state enum (`enabled | sudden-death | disabled`)* — rejected as scope creep. Sudden-death modeling is a separate feature; for v1 we just disable the timed trigger and let the scorekeeper handle sudden-death manually.
- *Checkbox instead of two-button toggle* — rejected for visual consistency with the existing toggle pattern.

## R-003: Period-label format change

**Decision**: Modify `formatPeriod` in [packages/web/src/lib/utils.ts:100](../../packages/web/src/lib/utils.ts#L100) so the OT branch returns `"OT"` for the first OT (unchanged) and `"<n>OT"` for the second and beyond (e.g., `"2OT"`, `"3OT"`). One-line change: `return otNum === 1 ? "OT" : \`${otNum}OT\`;` (was `\`OT${otNum}\``).

**Rationale**:
- The user explicitly requested the `OT, 2OT, 3OT, …` format ("on top of the game clock and the play-by-play logs"). One change in `formatPeriod` propagates everywhere since both `Scoreboard` and `GameLog` call it.
- The first-OT label `"OT"` (without "1") is conventional in basketball broadcast graphics — keeps backward compatibility for the single-OT case.

**Alternatives considered**:
- *Always label `<n>OT` (so first OT becomes `"1OT"` for consistency)* — rejected because the user specified `OT, 2OT, 3OT` explicitly. The conventional broadcast format also drops the `1` from the first OT.
- *Use periods/regularPeriods names in a new helper rather than modifying `formatPeriod`* — rejected because the existing helper already centralizes period naming; modifying it in-place is the minimum-diff path.

## R-004: Setup-page placement

**Decision**: Both new fields (Overtime length input and Overtime On/Off toggle) live in the existing **Game Settings** section at the top of [setup/page.tsx](../../packages/web/src/app/setup/page.tsx), placed in a new row below the existing five-column grid alongside the Timeout/Quarter break/Halftime fields added in feature 002. Suggested layout: `[Overtime On/Off toggle][Overtime length (min)][Timeout (sec)][Quarter break (sec)][Halftime (sec)]` in a single responsive flex/grid row, OR a separate row matching the existing pattern.

**Rationale**:
- User directive: *"Add the overtime length setting on the top section (game settings) of setup page."* Top section = Game Settings panel. Same enclosing `<section>` keeps all duration-related controls grouped.
- The opt-in toggle reads more naturally adjacent to its corresponding length input — a scorekeeper toggling Overtime to `Off` should immediately see that the length input is now irrelevant.

**Alternatives considered**:
- *Put the toggle in a separate panel below Game Settings* — rejected as visual fragmentation; the user explicitly said "top section."
- *Disable (gray out) the Overtime length input when toggle is Off* — sound UX but adds conditional disabled-state logic. Out of scope for v1; the input remains editable so the configured length is preserved when the user toggles back to On.

## R-005: How `endPeriod` selects the next state

**Decision**: Replace the existing `isLastRegular ? "finished" : "period-break"` ternary with:

```ts
const isLastRegular = currentPeriod >= settings.periods;
const otGate = settings.overtimeEnabled && settings.overtimeSeconds > 0;
const stats = computeStats(s.events, s.homeTeam, s.awayTeam, s.settings, s.currentPeriod);
const isTied = stats.home.points === stats.away.points;
// Continue (period-break) if:
//   (a) it's not the last regulation period (existing behavior), OR
//   (b) it IS the last regulation/OT period, OT is enabled, and the score is tied.
const goToBreak = !isLastRegular || (otGate && isTied);
const nextStatus = goToBreak ? "period-break" : "finished";
```

**Rationale**:
- The `goToBreak` predicate cleanly unifies both regulation and OT cases. For regulation periods 1..periods-1 it's always `true` (no behavior change). For period N == periods it falls back to the OT-enabled-and-tied check. For OT periods (currentPeriod > periods) it uses the same OT-enabled-and-tied check.
- Reuses the existing `seededBreakSeconds` halftime/quarter logic from feature 002 unchanged — OT transitions are not halftime, so they always use the quarter-break duration (the existing rule already gives the right answer here since `currentPeriod === settings.periods / 2` is false when `currentPeriod > settings.periods`).

**Alternatives considered**:
- *Compute `isTied` lazily only when `isLastRegular` is true* — could be a micro-optimization but adds branching complexity. `computeStats` is fast enough that the always-compute path is acceptable.

## R-006: How `startNextPeriod` handles multi-OT

**Decision**: `startNextPeriod` requires NO CHANGES. The existing logic already does:

```ts
const isOT = currentPeriod >= settings.periods;
const nextLength = isOT ? settings.overtimeSeconds : settings.periodSeconds;
```

For 2OT (currentPeriod=5 going to 6), `currentPeriod=5 >= settings.periods=4` → `isOT=true` → `nextLength=overtimeSeconds`. ✓
For 3OT (currentPeriod=6 going to 7) → same path. ✓
Period number increments unconditionally. `formatPeriod(6, 4)` will render `"2OT"` (after the R-003 change). ✓

**Rationale**: Confirms the existing infrastructure already supports unbounded OT. The plan's only contribution here is the label format change in R-003.

**Alternatives considered**: None — this is a verification step.

## R-007: ActionPad button label during multi-OT breaks

**Decision**: `ActionPad`'s `nextPeriodLabel(currentPeriod, periods)` helper at [ActionPad.tsx:18-24](../../packages/web/src/components/game/ActionPad.tsx#L18-L24) already returns `"Start Overtime"` whenever `currentPeriod >= periods` (including all OT-to-OT transitions). No change required.

**Rationale**:
- Same button label for 1OT-start, 2OT-start, 3OT-start, … is acceptable broadcast convention.
- If the user later wants distinct labels ("Start 2OT", "Start 3OT", …), that's a one-line tweak to the helper to derive from `currentPeriod - periods + 1`. Out of scope for v1.

**Alternatives considered**:
- *Label as "Start <n>OT" using the formatPeriod helper* — rejected as scope creep; not requested by the user.

## R-008: Test surface and what changes vs stays the same

**Decision**: Test surface delta:

| Test file | Change | Reason |
|---|---|---|
| `store.test.ts` | + ~8 new tests | Four routing branches × two contexts (final regulation, OT-to-OT). Plus a multi-OT loop test (2OT → 3OT → final). |
| `utils.test.ts` | Modify 1 existing test (lines 100-102 — "numbers further overtimes OT2, OT3, …") | Update asserted strings from `"OT2" / "OT3"` to `"2OT" / "3OT"`. The `formatPeriod(5, 4)` → `"OT"` test stays as-is. |
| `setup/page.test.tsx` | + 4 new tests | Default values for both new fields per format; setSettings dispatched on each edit; toggle pair behaves correctly (clicking On flips to On, etc.); both fields visible in the Game Settings section. |
| `ActionPad.test.tsx` | UNCHANGED | The `"Start Overtime"` label test from feature 002 still passes verbatim; no new ActionPad behavior. |
| `GameLog.test.tsx` | Potentially update existing tests if any assert OT-period log entries with the old `OT2` format. To be checked during implementation. |

**Rationale**:
- TDD per Principle I: each change has a paired failing test before implementation.
- Existing tests are touched only when their assertions need updating for the new label format.

**Alternatives considered**: None.
