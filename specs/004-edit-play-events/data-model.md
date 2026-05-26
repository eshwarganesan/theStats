# Data Model: Edit and Delete Play-by-Play Events

**Feature**: 004-edit-play-events  
**Date**: 2026-05-26

## Overview

This feature introduces **no new persisted entities** and **no shape changes to existing entities**. The events array (`GameState.events: GameEvent[]`) is the only data structure mutated. A new helper type, `EditEventPatch`, is added to `lib/types.ts` to type the input to the new `editEvent` store action. This document specifies that helper type and re-states the immutability rules that bind it.

## Entities (re-stated for reference)

### `GameEvent` (existing — unchanged)

Defined at [packages/web/src/lib/types.ts:96-173](../../packages/web/src/lib/types.ts#L96-L173). A discriminated union over the seven event variants: `score`, `foul`, `stat`, `substitution`, `timeout`, `clock` (with `action: "start" | "stop" | "reset"` or `action: "adjust"`), and `period`.

Every variant carries: `id: ID`, `timestamp: number`, `period: number`, `clockAt: number`.

This feature operates on four variants — `score`, `foul`, `stat`, `timeout` — and ignores the other three.

### Identity attributes (immutable through this feature, per FR-011)

For every event, this feature MUST NOT modify:

- `id`
- `type`
- `period`
- `timestamp`

A patch whose `type` does not match the targeted event's `type` MUST be rejected by the store (research Decision 7).

### Editable subset by event type

| Event type   | Editable fields                                  | Source           |
|--------------|--------------------------------------------------|------------------|
| `score`      | `clockAt`, `side`, `playerId`, `kind`, `made`    | Spec FR-004, FR-005 |
| `foul`       | `clockAt`, `side`, `playerId`, `kind`            | Spec FR-004, FR-006 |
| `stat`       | `clockAt`, `side`, `playerId`, `kind`            | Spec FR-004, FR-007 |
| `timeout`    | `clockAt`, `side`                                | Spec FR-004, FR-008 |

The other three event types (`substitution`, `clock`, `period`) have **no** editable fields through this feature (Spec FR-002).

### Field-level validation rules

| Field      | Rule                                                                                          | Source              |
|------------|-----------------------------------------------------------------------------------------------|---------------------|
| `clockAt`  | Number in seconds. Must lie in `[0, periodLength]` where `periodLength = settings.periodSeconds` for periods 1 through `settings.periods` and `settings.overtimeSeconds` for any later period. | Spec FR-010         |
| `side`     | One of `"home" \| "away"`. No further constraint.                                             | Spec FR-004         |
| `playerId` | Must be the `id` of a player on the (post-edit) `side`'s current `roster`.                    | Spec FR-009, FR-009a |
| `kind`     | Must be a member of the appropriate alias (`ScoreKind` / `FoulKind` / `StatKind`).            | Spec FR-005-7       |
| `made`     | Boolean. No further constraint.                                                               | Spec FR-005         |

### Cross-field rules

- If a patch changes `side`, it MUST also provide a `playerId` (or the modal must reset the player selector and disable Save until one is chosen — Spec FR-009). Otherwise the store rejects.
- The combination (`side`, `playerId`) MUST be self-consistent: the player must exist on the chosen side's roster at the time of the call (Spec FR-009a — "current rostered player of the chosen side").
- For `timeout` events, neither `playerId` nor `kind` is permitted in the patch (Spec FR-008).

## New helper type: `EditEventPatch`

A discriminated union, located in `lib/types.ts` adjacent to `GameEvent`, that types the input to the new `editEvent` store action.

```ts
/**
 * Patch supplied to `editEvent` for mutating an existing GameEvent in place.
 * The `type` discriminant MUST match the target event's `type`. Only the
 * editable fields for that event-type variant may appear (per Spec FR-004
 * through FR-008). Identity fields (`id`, `period`, `timestamp`, `type`)
 * are immutable and are not part of any patch variant.
 */
export type EditEventPatch =
  | {
      type: "score";
      clockAt?: number;
      side?: Side;
      playerId?: ID;
      kind?: ScoreKind;
      made?: boolean;
    }
  | {
      type: "foul";
      clockAt?: number;
      side?: Side;
      playerId?: ID;
      kind?: FoulKind;
    }
  | {
      type: "stat";
      clockAt?: number;
      side?: Side;
      playerId?: ID;
      kind?: StatKind;
    }
  | {
      type: "timeout";
      clockAt?: number;
      side?: Side;
    };
```

**Notes**:

- All fields below `type` are optional, so a patch can carry only the field(s) the user actually changed (Edge Case "Concurrent edits and ticks": only-write-edited-fields).
- The discriminant `type` is required and mirrors the target event's `type` field, enabling the store's type assertion (research Decision 2).
- No `EditEventPatch` branch exists for `substitution`, `clock`, or `period`, so the type system itself prevents calling `editEvent` against those rows (Spec FR-002 enforced statically).

## State transitions

### `editEvent(id, patch)`

| From state                                                            | To state                                                                                                | Trigger             |
|----------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|---------------------|
| `events: [..., E_i, ...]` where `E_i.id === id` and validation passes | `events: [..., E_i', ...]` where `E_i'` has `E_i`'s identity fields and patch-supplied editable fields | Save in edit modal  |
| As above but validation fails                                        | Unchanged (`events` identical by reference)                                                            | Save with bad patch |
| `events` contains no event with `id`                                 | Unchanged                                                                                              | Stale modal save    |

### `deleteEvent(id)`

| From state                                                                                       | To state                                                            | Trigger             |
|--------------------------------------------------------------------------------------------------|---------------------------------------------------------------------|---------------------|
| `events: [..., E_i, ...]` where `E_i.id === id` and `E_i.type ∈ {"score","foul","stat","timeout"}` | `events: [...]` with `E_i` removed and all other events unchanged    | Delete confirmed    |
| `E_i.id === id` but `E_i.type ∉ editable set`                                                    | Unchanged (store rejects — defense-in-depth; UI suppresses anyway)  | Programmatic misuse |
| No event with `id`                                                                               | Unchanged                                                           | Stale modal confirm |

### `undoLastEvent` (existing — unchanged)

Out of scope for this feature; behavior preserved as-is.

## Derived stats invariant

The existing invariant in [store.ts:20-30](../../packages/web/src/lib/store.ts#L20-L30) — "Statistics are NEVER stored — they are always derived from `events` via `computeStats`" — is **preserved**. Edits and deletes mutate `events`; selectors that depend on `events` re-fire; `computeStats` re-folds; team and player stats reflect the new totals automatically (Spec FR-013).

## What the events array's set of mutators becomes

Before this feature: `append` (via every `record*` action) and `pop-last` (via `undoLastEvent`).

After this feature: `append`, `editEvent`, `deleteEvent`, `pop-last`. The invariant comment block in `store.ts:20-30` is rewritten to reflect this.
