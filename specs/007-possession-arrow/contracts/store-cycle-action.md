# Contract: `cyclePossessionArrow` Store Action

**File**: `packages/web/src/lib/store.ts`
**Test file**: `packages/web/src/lib/store.test.ts` (extended with new cases)

## Purpose

The sole mid-game writer of `GameState.possessionArrow`. Encodes the FR-006 cycle inside the store so no component can produce an invalid intermediate state.

## Signature

```ts
interface GameStoreActions {
  // …existing actions unchanged…

  /** Advance the possession arrow per spec FR-006:
   *  `'unset' → 'home'`, `'home' → 'away'`, `'away' → 'home'`.
   *  There is no transition back to `'unset'` — that state is reachable
   *  only via `resetAll` / `prepareGame`. Calling this action MUST NOT
   *  mutate any other store field (clock, score, events, possession,
   *  onCourt, fouls, timeouts, currentPeriod, status, settings). */
  cyclePossessionArrow(): void;
}
```

## Behavior contract

```text
GIVEN state.possessionArrow === 'unset'
WHEN  cyclePossessionArrow() is called
THEN  state.possessionArrow becomes 'home'
AND   every other store field is unchanged

GIVEN state.possessionArrow === 'home'
WHEN  cyclePossessionArrow() is called
THEN  state.possessionArrow becomes 'away'
AND   every other store field is unchanged

GIVEN state.possessionArrow === 'away'
WHEN  cyclePossessionArrow() is called
THEN  state.possessionArrow becomes 'home'
AND   every other store field is unchanged
```

## Initialization contract

`possessionArrow` MUST be initialized to `'unset'` at:

1. Store creation (the initial state literal).
2. `resetAll()` (the full game-wipe action that returns the store to a fresh state).
3. `prepareGame()` (the action that locks settings and transitions the store from setup to game-ready).

Each initialization MUST be covered by its own Vitest test.

## Persistence contract

`possessionArrow` MUST appear in the persisted `partialize` selection alongside `homeTeam, awayTeam, settings, status, currentPeriod, events, possession, onCourt`. The serialized JSON MUST contain a `possessionArrow` field with the current value.

On rehydration:
- A payload that includes a valid `'unset' | 'home' | 'away'` value MUST restore that value exactly.
- A payload missing the field (older saved games) MUST result in the initial value (`'unset'`) — verified by the Vitest rehydration test.
- A payload with an invalid value MUST NOT corrupt the store; the rehydrator falls back to `'unset'`. (This is handled by the existing typed parser in `lib/persistence.ts` introduced by feature 006; the new field is validated against the literal-union set.)

## Test contract (Vitest)

Add to `store.test.ts`:

1. **Initial value is `'unset'`** — fresh store, assert `state.possessionArrow === 'unset'`.
2. **`cyclePossessionArrow` transitions `unset → home`** — call action, assert.
3. **`cyclePossessionArrow` transitions `home → away`** — set state to `'home'`, call action, assert.
4. **`cyclePossessionArrow` transitions `away → home`** — set state to `'away'`, call action, assert.
5. **`cyclePossessionArrow` invocation never returns to `'unset'`** — exhaustive test that starts at each of `'home'` / `'away'` and calls the action 10 times, asserts `possessionArrow !== 'unset'` throughout.
6. **`cyclePossessionArrow` does not mutate other fields** — capture state snapshot pre-call, call action, assert every key other than `possessionArrow` is shallow-equal.
7. **`resetAll` resets `possessionArrow` to `'unset'`** — set to `'away'`, call `resetAll`, assert.
8. **`prepareGame` resets `possessionArrow` to `'unset'`** — set to `'away'`, call `prepareGame`, assert.
9. **Partialize round-trip** — set state, run partialize selector, parse JSON, assert `possessionArrow` is present with the correct value.
10. **Rehydration with missing field defaults to `'unset'`** — feed the store a payload without `possessionArrow`, assert restored state has `'unset'`.

Each test is added in a failing state first (Principle I).

## Non-goals

- The store action does NOT validate `settings.possessionArrowEnabled` — it is the caller's responsibility (Scoreboard) not to trigger it when the toggle is off. This keeps the action small and the rule centralized at the render boundary.
- The store action is NOT debounced. Rapid taps each produce a state transition; the FR-006 cycle ensures the result is deterministic (and reversible with one more tap).
