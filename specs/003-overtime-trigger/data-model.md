# Phase 1 Data Model: Overtime Trigger

**Feature**: 003-overtime-trigger
**Date**: 2026-05-18

This document captures the additions and modifications to the existing data model. It is the canonical reference for tasks.

## 1. `GameSettings` (existing, extended)

File: [packages/web/src/lib/types.ts](../../packages/web/src/lib/types.ts) (interface at line 46)

One new boolean field is added. The existing `overtimeSeconds` field is reused.

```ts
export interface GameSettings {
  // …existing fields unchanged…
  format: GameFormat;
  periods: number;
  periodSeconds: number;
  overtimeSeconds: number;        // existing — now exposed in setup UI
  bonusFoulThreshold: number;
  timeoutsPerGame: number;
  timeoutSeconds: number;
  quarterBreakSeconds: number;
  halftimeBreakSeconds: number;
  venue: string;
  competition: string;

  /** When true, a tied score at the end of the final regulation period
   *  (or any subsequent overtime period) routes the game into a break
   *  with `Start Overtime`. When false, tied results finalize the game
   *  as-is. Combined with `overtimeSeconds > 0` for the effective gate. */
  overtimeEnabled: boolean;
}
```

### Validation rules

| Field | Validation | Notes |
|---|---|---|
| `overtimeEnabled` | boolean | No additional validation; the setup-page toggle constrains values to `true` / `false`. |
| `overtimeSeconds` | unchanged | The existing field's clamping (≥ 0) still applies. UI input is in minutes (multiply by 60 before storing). |

### Default values (per `DEFAULT_SETTINGS` in [constants.ts](../../packages/web/src/lib/constants.ts))

| Format | `overtimeSeconds` (existing — may change) | `overtimeEnabled` (NEW) |
|---|---|---|
| `5v5` | `5 * 60` (5 min) — unchanged | `true` |
| `3v3` | `5 * 60` (5 min) — **CHANGED** from `0` so the toggle is meaningful | `false` |

The 3v3 default `overtimeEnabled: false` reflects that FIBA 3x3 uses sudden-death first-to-2 in OT (modeled separately, out of scope for this feature). The 3v3 `overtimeSeconds` default is bumped from `0` to `5 * 60` so a scorekeeper who flips the toggle to `On` gets a working 5-minute OT clock without also having to edit the length input. Existing tests that assert the old `overtimeSeconds: 0` for 3v3 will need to be updated.

## 2. `GameStatus` (existing, unchanged)

No changes. The decision is made at `endPeriod` time and the existing `period-break` / `finished` literals continue to capture the resulting state.

## 3. Zustand Store State (existing, unchanged shape)

File: [packages/web/src/lib/store.ts](../../packages/web/src/lib/store.ts)

No new state fields. The only behavioral change is to the `endPeriod` action body (see §5).

### Invariants

| ID | Invariant |
|---|---|
| INV-1 | When `endPeriod` is called from `status === "live"` and `currentPeriod >= settings.periods` (final regulation or OT period): the next status is `"period-break"` if `settings.overtimeEnabled === true AND settings.overtimeSeconds > 0 AND home.points === away.points`; otherwise `"finished"`. |
| INV-2 | When `endPeriod` is called from `status === "live"` and `currentPeriod < settings.periods` (a regular non-final period): the next status is always `"period-break"` (unchanged from existing behavior). |
| INV-3 | The score comparison uses `computeStats(events, homeTeam, awayTeam, settings, currentPeriod).{home,away}.points` evaluated at the moment of the `endPeriod` call. |
| INV-4 | Multi-OT is unbounded: each tied OT routes back to `period-break`, allowing successive `startNextPeriod` invocations to create periods 5, 6, 7, … with `clockSeconds` seeded from `settings.overtimeSeconds` on each. |
| INV-5 | Once `status === "finished"`, further `endPeriod` calls are no-ops (existing guard). Undo to scoring events does not retroactively re-route a finalized game (per spec clarification). |

## 4. Derived Values (no new fields, computed inline)

### Routing decision in `endPeriod`

Computed inline at action call time (see [contracts/store-api.md](./contracts/store-api.md) for the full pseudocode):

```ts
const isLastRegular = currentPeriod >= settings.periods;
const otGate = settings.overtimeEnabled && settings.overtimeSeconds > 0;
const stats = computeStats(events, homeTeam, awayTeam, settings, currentPeriod);
const isTied = stats.home.points === stats.away.points;
const goToBreak = !isLastRegular || (otGate && isTied);
const nextStatus = goToBreak ? "period-break" : "finished";
```

### Period label format (in `formatPeriod`)

```ts
const otNum = period - regularPeriods;
return otNum === 1 ? "OT" : `${otNum}OT`;   // was: `OT${otNum}`
```

Examples:
- `formatPeriod(5, 4)` → `"OT"` (unchanged)
- `formatPeriod(6, 4)` → `"2OT"` (was `"OT2"`)
- `formatPeriod(7, 4)` → `"3OT"` (was `"OT3"`)
- `formatPeriod(3, 4)` → `"3rd"` (unchanged — regulation period)

## 5. Event Log

**No changes.** The existing `period` events with `action: "end"` and `"start"` already capture every transition. No new event variants are introduced, consistent with the project's "event log = source of truth" principle and feature 002's clarification that breaks themselves are transient state.

## 6. Removed / Renamed Fields

None. The `formatPeriod` output format changes for the second-and-later OT labels — this is a string-output change, not a field rename. Downstream consumers (`Scoreboard`, `GameLog`) treat the return as opaque display text.
