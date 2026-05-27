# Contract: Store API — `editEvent` and `deleteEvent`

**Feature**: 004-edit-play-events  
**Date**: 2026-05-26  
**Layer**: Zustand store ([packages/web/src/lib/store.ts](../../../packages/web/src/lib/store.ts))

## Surface

Two new actions on `GameState` (the Zustand store interface). Both join `undoLastEvent` as explicit mutators of the otherwise append-only `events` array.

```ts
interface GameState {
  // ... existing fields ...

  /**
   * Apply a partial update to an existing event by id. The patch's `type`
   * MUST match the target event's `type`; mismatch is a no-op. Identity
   * fields (id, type, period, timestamp) are not patchable.
   *
   * Validation (no-op on failure):
   *   - id must reference an event currently in `events`
   *   - patch.type must match the event's type
   *   - if patch.playerId or patch.side change, the resulting (side, playerId)
   *     pair MUST resolve to a player on that side's current roster
   *   - if patch.clockAt is provided, it MUST lie in [0, periodLength] for
   *     the event's period
   *
   * On success: mutates the event in place at its current array index;
   * emits no new event; derived stats re-fold via existing selectors.
   */
  editEvent: (id: ID, patch: EditEventPatch) => void;

  /**
   * Remove an event from the events array by id. Restricted to events whose
   * `type` is one of "score" | "foul" | "stat" | "timeout"; any other type
   * is a no-op (defense-in-depth — the UI suppresses the affordance per
   * Spec FR-002, but the store rejects unsafe calls too).
   */
  deleteEvent: (id: ID) => void;
}
```

## Detailed behavior

### `editEvent(id, patch)`

**Precondition checks** (all silent no-ops on failure; dev-only `console.warn` allowed):

| # | Check                                                                                                | Failure example                                |
|---|------------------------------------------------------------------------------------------------------|------------------------------------------------|
| 1 | `events.find(e => e.id === id)` exists                                                               | Stale modal save                               |
| 2 | `existing.type === patch.type`                                                                       | Patching a score with a `{type: "foul", …}`    |
| 3 | If `patch.playerId !== undefined`, the player is on the (post-edit) side's roster                    | Player deleted between modal open and save     |
| 4 | If `patch.side !== undefined` and `patch.playerId === undefined`, the existing event's `playerId` MUST resolve on the new side (it usually will not — modal MUST send a new `playerId` alongside a side change) | Programmatic call sets side without playerId  |
| 5 | If `patch.clockAt !== undefined`, `0 <= patch.clockAt <= periodLength(existing.period)`              | User enters `25:00` in a 10-minute period      |

`periodLength(period)` is `settings.periodSeconds` for `period <= settings.periods`, otherwise `settings.overtimeSeconds`.

**Effect on success**:

- Replaces `events[i]` with `{ ...events[i], ...patchFieldsExceptType }` where `i = events.findIndex(e => e.id === id)`.
- Preserves `id`, `type`, `period`, `timestamp`.
- Does NOT touch `clockRunning`, `breakSeconds`, `status`, `onCourt`, or any other store slice. (Editing a `timeout` event's `side` does not retroactively flip the live break-clock state — it only updates the recorded event.)

**No side effects beyond `events`**: derived stats re-fold via existing selectors; no new event is emitted (per Spec FR-019).

### `deleteEvent(id)`

**Precondition checks** (silent no-ops on failure):

| # | Check                                                                                  |
|---|----------------------------------------------------------------------------------------|
| 1 | An event with `id` exists in `events`                                                 |
| 2 | `existing.type ∈ {"score", "foul", "stat", "timeout"}`                                |

**Effect on success**:

- Returns `events.filter(e => e.id !== id)` (a new array with `events[i]` removed; all other entries preserved in order).
- Does NOT touch any other store slice.
- Does NOT affect `onCourt` (only `substitution` events change `onCourt`; this feature excludes substitution).

## Test plan (all paired with their implementation tasks — TDD per Constitution Principle I)

Tests live in [packages/web/src/lib/store.test.ts](../../../packages/web/src/lib/store.test.ts). Each test name below is the assertion; each test MUST be written failing first.

### `editEvent` tests

1. **score edit — playerId only**: records a score for Home #10; calls `editEvent(id, { type: "score", playerId: <home#11> })`; asserts events[i] now has playerId=#11 and other fields unchanged.
2. **score edit — side + playerId together**: records score for Home #10; calls `editEvent(id, { type: "score", side: "away", playerId: <away#7> })`; asserts side flips and playerId is the away player.
3. **score edit — kind from 2pt to 3pt**: asserts the recorded event's `kind` updates and `computeStats` reflects 3 points instead of 2.
4. **score edit — made true→false**: asserts `made` flips and stats reflect a miss.
5. **foul edit — kind from personal to technical**: asserts `kind` updates and the team-foul count is re-derived correctly.
6. **stat edit — kind from steal to block**: asserts `kind` updates.
7. **timeout edit — side flip**: records a Home timeout; edits to `side: "away"`; asserts events[i].side === "away" and `timeoutsTaken` re-derives correctly per team.
8. **clockAt edit within range**: edits `clockAt` to a valid value; asserts the new value is written.
9. **clockAt edit out of range** (negative or > periodLength): asserts the events array is unchanged.
10. **playerId edit to non-roster player**: passes a UUID not in the side's current roster; asserts no change.
11. **type mismatch**: targets a score event with `{type: "foul", ...}`; asserts no change.
12. **non-existent id**: asserts no change.

### `deleteEvent` tests

13. **delete score in the middle**: records score, foul, stat (three events); calls `deleteEvent(scoreId)`; asserts foul and stat remain in order and scoreboard recomputes.
14. **delete non-editable type**: programmatically calls `deleteEvent(substitutionEventId)`; asserts events unchanged (defense-in-depth).
15. **delete non-existent id**: asserts events unchanged.

### Invariant preservation

After every `editEvent` and `deleteEvent` test, assert:

- `computeStats(state.events, state.homeTeam, state.awayTeam, state.settings, state.currentPeriod)` produces totals consistent with the post-mutation `events` (no stale cached values exist anywhere).

## Out of scope for this contract

- Any UI behavior — covered in [ui-contracts.md](./ui-contracts.md).
- Substitution / clock / period editing — not part of this feature (Spec FR-002).
- Period change — not patchable (Spec FR-011).
- Edit undo — explicitly out of scope (Spec FR-018).
