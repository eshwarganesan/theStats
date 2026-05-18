# Phase 1 Data Model: Timeout & Period-Break Timer

**Feature**: 002-timeout-break-timer
**Date**: 2026-05-16

This document captures the additions and modifications to the existing data model. It is the canonical reference for tasks.

## 1. `GameSettings` (existing, extended)

File: [packages/web/src/lib/types.ts](../../packages/web/src/lib/types.ts) (interface at line 46)

Three new numeric fields are added to the existing `GameSettings` interface. All three are in **seconds**.

```ts
export interface GameSettings {
  // …existing fields unchanged…
  format: GameFormat;
  periods: number;
  periodSeconds: number;
  overtimeSeconds: number;
  bonusFoulThreshold: number;
  timeoutsPerGame: number;
  venue: string;
  competition: string;

  /** Length of a single timeout, in seconds. */
  timeoutSeconds: number;
  /** Length of the break between adjacent periods that do NOT straddle the halftime boundary, in seconds. */
  quarterBreakSeconds: number;
  /** Length of the halftime break (between the first and second half of regulation), in seconds. */
  halftimeBreakSeconds: number;
}
```

### Validation rules

| Field | Min | Max | Notes |
|---|---|---|---|
| `timeoutSeconds` | 0 | 600 | 0 means "instant resume"; cap at 10 minutes to bound rogue input. |
| `quarterBreakSeconds` | 0 | 1800 | Cap at 30 minutes. |
| `halftimeBreakSeconds` | 0 | 1800 | Cap at 30 minutes. |

### Default values (per `DEFAULT_SETTINGS` in [constants.ts](../../packages/web/src/lib/constants.ts))

| Format | `timeoutSeconds` | `quarterBreakSeconds` | `halftimeBreakSeconds` |
|---|---|---|---|
| `5v5` | 60 | 120 | 600 |
| `3v3` | 30 | 60 | 0 *(3v3 has 1 period; halftime is never reached, but a sensible default is still set)* |

### Persistence

The existing Zustand store already persists `settings` via its normal lifecycle (in-memory for the duration of the game). No new persistence layer is introduced.

## 2. `GameStatus` (existing, extended)

File: [packages/web/src/lib/types.ts](../../packages/web/src/lib/types.ts) (line 163-168)

A new literal `"timeout"` is added to the union:

```ts
export type GameStatus =
  | "setup"
  | "ready"
  | "live"
  | "timeout"        // NEW — a timeout is in progress (countdown active)
  | "period-break"
  | "finished";
```

### State transition diagram (additions only)

```
live ──(recordTimeout)──> timeout
timeout ──(endTimeout)──> live
live ──(endPeriod, non-last)──> period-break    [unchanged]
live ──(endPeriod, last regulation)──> finished [unchanged]
period-break ──(startNextPeriod)──> live        [unchanged]
```

Existing transitions are untouched.

## 3. Zustand Store State (existing, extended)

File: [packages/web/src/lib/store.ts](../../packages/web/src/lib/store.ts) (interface at line 30-ish)

One new field on the state, plus one new action on the store interface:

```ts
interface GameState {
  // …existing fields unchanged…
  status: GameStatus;
  clockSeconds: number;
  clockRunning: boolean;

  /** Seconds remaining on the active timeout or period-break countdown.
   *  0 when no break is active. Mutated only by tickClock, adjustClock,
   *  recordTimeout, endPeriod, startNextPeriod, and endTimeout. */
  breakSeconds: number;

  // …existing actions…
  recordTimeout: (side: Side) => void;     // SEMANTICS CHANGED — see contracts
  endPeriod: () => void;                    // SEMANTICS CHANGED — see contracts
  startNextPeriod: () => void;              // SEMANTICS CHANGED — see contracts
  tickClock: (deltaMs: number) => void;     // SEMANTICS CHANGED — see contracts
  adjustClock: (value: number) => void;     // SEMANTICS CHANGED — see contracts

  /** NEW — ends the active timeout. Sets status back to "live", clears
   *  breakSeconds. No-op if status !== "timeout". */
  endTimeout: () => void;
}
```

### Invariants

| ID | Invariant |
|---|---|
| INV-1 | `breakSeconds > 0` only when `status === "timeout"` or `status === "period-break"`. After a break ends, `breakSeconds` is reset to 0. |
| INV-2 | `clockSeconds` is never mutated while `status` is `"timeout"` or `"period-break"`. The live game time is frozen for the duration of the break. |
| INV-3 | `clockRunning === false` whenever `status` is `"timeout"`, `"period-break"`, or `"finished"`. The live clock cannot run during a break. |
| INV-4 | `tickClock(delta)` decrements `breakSeconds` if status is in a break state; otherwise decrements `clockSeconds` (existing behavior). Never both. |
| INV-5 | `adjustClock(value)` mutates `breakSeconds` if status is in a break state; otherwise mutates `clockSeconds`. The clamp range follows the active field's bounds. |

## 4. Derived Values (no new fields, computed inline)

### Halftime boundary

Where computed: in `endPeriod` (to choose which break duration to seed).

```ts
const isHalfBoundary =
  settings.periods % 2 === 0 && currentPeriod === settings.periods / 2;
const seededBreakSeconds = isHalfBoundary
  ? settings.halftimeBreakSeconds
  : settings.quarterBreakSeconds;
```

### ActionPad primary CTA label (derived in render)

```ts
function nextPeriodLabel(currentPeriod: number, periods: number): string {
  if (currentPeriod >= periods) return "Start Overtime";
  if (periods % 2 === 0 && currentPeriod === periods / 2) return "Start Second Half";
  return "Start Next Quarter";
}
```

This is a pure function and lives inline in `ActionPad.tsx` (no new exported helper).

### Clock display source (derived in `GameClock`)

```ts
const display =
  status === "timeout" || status === "period-break"
    ? breakSeconds
    : clockSeconds;
```

## 5. Event Log

**No changes.** Per the clarification session: timeout/break start and end are not recorded as discrete events. The existing `timeout` event emitted by `recordTimeout` is preserved unchanged. The existing `period` event (action: "end" / "start") emitted by `endPeriod` / `startNextPeriod` is preserved unchanged. The new `endTimeout` action emits NO event.

## 6. Removed / Renamed Fields

None. All changes are purely additive.
