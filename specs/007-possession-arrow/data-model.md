# Phase 1 Data Model: Possession Arrow

**Feature**: 007-possession-arrow
**Date**: 2026-06-28

## Overview

This feature adds **one boolean** to the existing `GameSettings` interface and **one literal-union field** to the in-memory game state. No new tables, no new persistence keys, no new types beyond these two additions and one supporting union.

---

## New / Modified Types

### `PossessionArrowDirection` (new, exported)

**Location**: `packages/core/src/types.ts`

```ts
/** Direction the alternating-possession arrow points.
 *  `unset` is the start-of-game state; once the scorekeeper taps the
 *  indicator, the value enters the home ↔ away oscillation and there is
 *  no mid-game path back to `unset` (see spec FR-006). */
export type PossessionArrowDirection = "unset" | "home" | "away";
```

**Validation rules**: TypeScript's literal-union exhaustiveness — every consumer must handle all three values. The store's `cyclePossessionArrow` action is the **only** writer of this field outside of game initialization; no setter is exposed.

---

### `GameSettings` (existing, extended)

**Location**: `packages/core/src/types.ts:46`

Adds one new field:

```ts
export interface GameSettings {
  // …existing fields unchanged…

  /** When `true`, the live game screen renders a tap-to-flip
   *  alternating-possession arrow indicator beside the clock. When `false`,
   *  the indicator is not rendered and no arrow state is tracked.
   *  Frozen at game start (cannot be changed mid-game), consistent with
   *  every other field on this interface. */
  possessionArrowEnabled: boolean;
}
```

**Defaults** (in `packages/core/src/constants.ts`):

| Format | `possessionArrowEnabled` |
|--------|--------------------------|
| `5v5`  | `true` |
| `3v3`  | `false` |

**Format cascade**: When the scorekeeper changes `format` on the setup page, `setSettings` already cascades all format-driven defaults from `DEFAULT_SETTINGS[newFormat]`, preserving venue and competition. `possessionArrowEnabled` joins that cascade automatically — no setup-page logic changes beyond rendering the toggle.

**Lifecycle**: Set in setup, read everywhere, frozen at `prepareGame` (consistent with every other `GameSettings` field).

---

### `GameState` (existing, extended)

**Location**: `packages/web/src/lib/store.ts` (the Zustand store's `GameState` interface, lines 55–123).

Adds one new field:

```ts
interface GameState {
  // …existing fields unchanged…

  /** Direction of the alternating-possession arrow. Initializes to
   *  `'unset'` for every new game; cycles via `cyclePossessionArrow`
   *  per spec FR-006. Only meaningful when
   *  `settings.possessionArrowEnabled === true`; when the toggle is
   *  off, this field is still present (always `'unset'`) but is never
   *  read by any view. */
  possessionArrow: PossessionArrowDirection;
}
```

**Initial value**: `'unset'` on store creation, on `resetAll`, and on `prepareGame`. (Three call sites; see contracts/store-cycle-action.md.)

**State transitions** (FR-006 cycle):

| Current `possessionArrow` | Tap → New value |
|---------------------------|----------------|
| `'unset'`                 | `'home'`       |
| `'home'`                  | `'away'`       |
| `'away'`                  | `'home'`       |

There is **no transition that returns to `'unset'` mid-game**. The `'unset'` state is reachable only via a fresh game (Q1 clarification).

**Persistence**: `possessionArrow` is added to the existing `persist` middleware's `partialize` set. On restore from an older payload that lacks the field, the store's initial value (`'unset'`) prevails — exactly the FR-010 contract.

**Read sites** (after this feature):
- `Scoreboard.tsx` — gates rendering on `settings.possessionArrowEnabled`, passes `possessionArrow` and `status === 'finished'` into `<PossessionArrow>`.
- *(No other views read this field; FR-014 restricts surfacing to the live screen.)*

**Write sites**:
- `cyclePossessionArrow()` action — the only mid-game writer.
- `resetAll`, `prepareGame` — initialize to `'unset'`.

---

## Relationships

```text
GameSettings.possessionArrowEnabled  ──(gates rendering of)──▶  <PossessionArrow>
                                                                       │
                                                                       │ (onCycle handler)
                                                                       ▼
                                                          cyclePossessionArrow() action
                                                                       │
                                                                       │ (set())
                                                                       ▼
                                                          GameState.possessionArrow
                                                                       │
                                                                       │ (partialize)
                                                                       ▼
                                                          localStorage 'thestats.game.v1'
```

No cross-table or cross-package relationships. No FK constraints (client-side only). No multi-entity invariants.

---

## Invariants

1. `GameState.possessionArrow` is **always one of** `'unset' | 'home' | 'away'` — never undefined, never null, never a Side value cast.
2. When `settings.possessionArrowEnabled === false`, `possessionArrow` is **never read by any view** (write-only, effectively dead). It is still serialized to localStorage for shape simplicity.
3. The `'unset'` state is reachable **only** at game initialization (`resetAll`, `prepareGame`, store creation). No action transitions `'home'` or `'away'` back to `'unset'`.
4. The `cyclePossessionArrow` action **never** mutates any other field on the store (`clockSeconds`, `score`, `events`, `currentPeriod`, `fouls`, `timeouts`, `possession`, `onCourt` — all untouched). This invariant is asserted by a Vitest test.
5. Arrow flips are **not** `GameEvent` instances and **never** appear in the `events` array. They are not subject to `undoLastEvent`.

---

## Out of Scope (Data Model)

- No new Supabase table, RLS policy, or migration (no backend involvement).
- No new persistence schema version — additive field with safe default per Decision 6 (research.md).
- No event-log entry for arrow flips. The arrow is UI state, not a game event.
- No per-period reset of the arrow (the arrow carries across periods within a single game; only a fresh game resets to `'unset'`).
- No analytics / telemetry events for arrow flips (no analytics layer in the app today).
