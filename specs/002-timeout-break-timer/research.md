# Phase 0 Research: Timeout & Period-Break Timer

**Feature**: 002-timeout-break-timer
**Date**: 2026-05-16

Every Technical Context unknown was tractable from existing code and the clarified spec. No `NEEDS CLARIFICATION` markers were carried in. This document captures the decisions made during planning so the implementation phase has a single grounded reference.

## R-001: Where to store the break countdown

**Decision**: Add a single new field `breakSeconds: number` to the Zustand store. It is `0` when no break is active. Existing `clockSeconds` continues to hold the live game time and is **not** mutated during a break.

**Rationale**:
- Preserves the live game clock so play resumes from the exact second the timeout / period-end occurred (currently `recordTimeout` and `endPeriod` already leave `clockSeconds` intact — this matches that behavior).
- Keeps the data model orthogonal: "what time is on the game clock" and "how long until the break ends" are different concepts that should not share storage.
- Allows `useGameClock`'s existing RAF loop to drive both fields without race conditions — only one is decremented per tick, based on `status`.

**Alternatives considered**:
- *Reuse `clockSeconds`, snapshot/restore on break boundaries* — rejected because it requires a "stashed" field anyway and adds two extra mutations per break (snapshot in, restore out). Net more state, not less.
- *Add `breakSeconds: number | null`* — rejected because `null` invites optional-chaining noise across consumers and TypeScript discrimination doesn't help here. A `0` sentinel is fine and matches how `clockSeconds` already conveys "no time remaining."

## R-002: Where to drive the countdown tick

**Decision**: Extend [useGameClock.ts](../../packages/web/src/hooks/useGameClock.ts) so its RAF loop runs whenever EITHER the live clock is running (`clockRunning === true`) OR the game is in a break state (`status === "timeout"` or `"period-break"`). The store's `tickClock(delta)` action becomes status-aware and decrements `breakSeconds` during a break, `clockSeconds` during live play.

**Rationale**:
- Single source of truth for "is anything ticking right now" — no second RAF loop, no race between two timer hooks.
- Honours the constitution's component-driven principle: `useGameClock` already owns the responsibility of pacing the clock; we're not creating a parallel hook.
- The existing `tickClock` signature stays the same (`tick(delta: number)`), so no consumer-side breakage.

**Alternatives considered**:
- *Separate `useBreakClock` hook* — rejected because the user directive bars new components, and the hook would duplicate the RAF lifecycle code in `useGameClock` for no semantic gain.
- *Use `setInterval` with 1000ms* — rejected because it drifts versus the page repaint, which is exactly why `useGameClock` uses RAF today (per the comment in the hook). Consistency matters here.

## R-003: How to choose between quarter-break and halftime-break duration

**Decision**: When `endPeriod` transitions into `status === "period-break"`, compute the break duration deterministically from `settings.periods` and the *just-ended* period number:

```ts
const isHalfBoundary =
  settings.periods % 2 === 0 && currentPeriod === settings.periods / 2;
const breakSeconds = isHalfBoundary
  ? settings.halftimeBreakSeconds
  : settings.quarterBreakSeconds;
```

For a 4-period game (`settings.periods === 4`), halftime falls between periods 2 and 3. For a 2-period game (some leagues), halftime falls between periods 1 and 2. Odd-period games (uncommon) never trigger a halftime break — every transition uses the quarter-break duration.

**Rationale**:
- Spec amendment from clarification: *"Halftime applies between the first half and the second half of regulation; the between-quarter break applies between all other adjacent periods."* Computing from `settings.periods / 2` makes the rule explicit and league-agnostic.
- No new state field needed — the boundary is derivable.

**Alternatives considered**:
- *Hard-code halftime to "between periods 2 and 3"* — rejected because the app already supports configurable `settings.periods` (3v3 games have 1 period). Hard-coding would break 3v3 and any non-4-period format.
- *Store `currentBreakKind: "timeout" | "quarter" | "halftime"`* — rejected because the kind is derivable from `status` + period numbers; storing it duplicates information that can drift.

## R-004: How the ActionPad gates its controls during a break

**Decision**: ActionPad already has a `renderClockCTA()` branch for `status === "period-break"`. Add a parallel branch for `status === "timeout"`. Wrap the secondary-controls row (`Undo` + `End Period`) in a conditional: render it only when `status === "live"` (or `"ready"` / `"finished"`, where their disabled states naturally communicate availability). During `status === "timeout"` and `status === "period-break"`, the action pad shows ONLY the primary CTA and the hint text.

**Rationale**:
- Minimises diff to ActionPad — one new render branch, one conditional wrapping the secondary row.
- Existing hint text (`status === "period-break" && "Break — review and continue."`) is preserved; a new line is added for `status === "timeout"`.
- Matches user directive: *"the other buttons should disappear during this time."*

**Alternatives considered**:
- *Disable the secondary buttons instead of hiding them* — rejected because the user explicitly said "disappear," and hidden controls reduce visual noise during the break.

## R-005: Label for the primary action button during a between-period break

**Decision**: Derive the button label from the *next* period:
- If the next period is the start of the second half (i.e., the just-ended period was at the half boundary): `"Start Second Half"`.
- If the next period is overtime (i.e., the just-ended period was the final regulation period and OT is configured): `"Start Overtime"`.
- Otherwise: `"Start Next Quarter"` (matches user phrasing) — internally the same action as today's `"Start Next Period"`.

The existing `ActionPad.tsx` currently shows `"Start Next Period"` for any `period-break` state. We replace that single literal with a small label-derivation helper inline in the render function.

**Rationale**:
- The user's plan args explicitly said "Start Next Quarter" / "End Timeout" — using the period-appropriate label communicates context to the scorekeeper.
- No new state needed — derivable from `currentPeriod` + `settings.periods`.

**Alternatives considered**:
- *Keep `"Start Next Period"` for everything* — rejected because the user named the button differently in their plan input.
- *Per-league preset labels* — rejected as out-of-scope.

## R-006: Bounds for the existing ±1m/±1s nudge controls during a break

**Decision**: Generalise the `periodMax` derivation in `ClockNudge.tsx`. When `status` is `"timeout"` or `"period-break"`, the upper bound for `+1m`/`+1s` becomes a generous cap (`30 * 60` seconds = 30 minutes) since break times are loosely bounded by referee discretion. The lower bound stays at 0 (no change). When `status` is `"live"`, the existing periodMax logic (per-period or overtime cap) remains.

**Rationale**:
- Real-world need: an extra minute granted by the referee, or a shortened halftime. Hard-clamping to the configured break duration would prevent these legitimate adjustments.
- 30-minute cap is high enough to never bite in practice and low enough to bound rogue inputs.

**Alternatives considered**:
- *Cap at the configured break duration* — rejected as too rigid (cannot extend a break).
- *No upper cap at all* — rejected because the existing pattern enforces a cap (so disabling it is inconsistent with the live-clock controls) and unbounded numeric input invites overflow bugs.

## R-007: Unit shown in the setup-page inputs (seconds vs minutes)

**Decision**: All three new inputs accept **seconds**, matching the spec's FR-009 wording. Labels make the unit explicit: `"Timeout (sec)"`, `"Quarter break (sec)"`, `"Halftime (sec)"`. The existing `"Period length (min)"` input keeps its minute convention since it's already established and changing it would be unrelated churn.

**Rationale**:
- Spec is explicit: "accepting values in seconds." Minimum-divergence path.
- Timeouts are sub-minute by convention (20s / 60s), so seconds is the natural unit for at least one of the three. Keeping all three consistent reads better than mixing seconds and minutes within the same row.

**Alternatives considered**:
- *Minutes for break/halftime, seconds for timeout* — rejected for inconsistent unit-presentation in one form.
- *Add a unit toggle* — rejected as scope creep.

## R-008: Whether `recordTimeout` should change `status` to `"timeout"`

**Decision**: Yes. The current `recordTimeout(side)` action sets `clockRunning: false` and appends a `timeout` event, but leaves `status === "live"`. This is fine for the current UI (the clock just stops), but breaks the new feature's gating (we can't distinguish "timeout in progress" from "clock paused mid-play"). Modify `recordTimeout` to additionally set `status: "timeout"` and `breakSeconds: settings.timeoutSeconds`.

**Rationale**:
- The new feature needs a clear "we're in a timeout" state for ActionPad gating, ClockPanel display routing, and the new `endTimeout` action.
- Pure additive change to the action — existing callers (the timeout UI in TeamPanel or wherever it lives) don't need to change their call signature.
- Existing `timeout` event in the event log is unchanged, so `computeStats` and downstream consumers see no difference.

**Alternatives considered**:
- *Introduce a separate `startTimeout()` action distinct from `recordTimeout()`* — rejected because callers would have to call both in sequence, and the natural meaning of "record a timeout" is "the team called timeout, now we're in a timeout." Combining them is cleaner.

## R-009: How `adjustClock` distinguishes break-edit from game-edit

**Decision**: Make `adjustClock(value: number)` status-aware: if `status` is `"timeout"` or `"period-break"`, it mutates `breakSeconds`; otherwise it mutates `clockSeconds`. The clamp bounds use the corresponding cap (live: per-period max; break: 30-minute generous cap per R-006).

**Rationale**:
- ClockEditor and ClockNudge call `adjustClock(value)` without knowing which clock is being shown. Centralising the routing in the action keeps the consumer components dumb (per Constitution Principle III).
- No new action surface to learn or test.

**Alternatives considered**:
- *Add `adjustBreak(value)`* — rejected because ClockEditor would then need status-awareness, which leaks the state machine into a presentational component.
