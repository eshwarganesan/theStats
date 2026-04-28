# Contract: `adjustClock` store action

**File**: [packages/web/src/lib/store.ts](../../../packages/web/src/lib/store.ts)
**Surface**: Public action on the Zustand `useGameStore`

This is the single store-level entry point for changing the clock value outside of the rAF tick loop. The component layer must use this action; direct mutation of `clockSeconds` is forbidden.

## Signature

```ts
adjustClock: (seconds: number) => void
```

## Pre-conditions

- `state.status === "live"` — the action is a no-op in `setup`, `ready`, `period-break`, or `finished`.
- `state.clockRunning === false` — the action is a no-op while the clock is running.

If either pre-condition is false, the action returns the current state unchanged. **It does not throw.** This matches the convention used by other store actions (`startClock`, `stopClock`).

## Post-conditions (when pre-conditions hold)

Let `from = state.clockSeconds` and let `max = state.currentPeriod > state.settings.periods ? state.settings.overtimeSeconds : state.settings.periodSeconds`.

Let `to = Math.max(0, Math.min(max, seconds))`.

- **Clock value**: `state.clockSeconds === to` after the action returns.
- **Running state preserved**: `state.clockRunning === false` after the action returns. The action MUST NEVER set `clockRunning` to `true`.
- **Event emission**:
  - If `to !== from`: exactly one new event is appended to `state.events` with `type === "clock"`, `action === "adjust"`, `from === from`, `to === to`, `clockAt === from`, `period === state.currentPeriod`, `id` from the standard `uid()` helper, and `timestamp === Date.now()`.
  - If `to === from`: no event is appended, no other state field changes.
- **Other state**: no other field of the store changes (no `currentPeriod` change, no settings change, no roster change, no other event types appended).

## Idempotency

- Calling `adjustClock(state.clockSeconds)` is a strict no-op.
- Calling `adjustClock(s)` followed by `adjustClock(s)` produces exactly one event (the second call is a no-op against the new clock value).

## Concurrency / ordering

The store is single-threaded (Zustand `set` calls). No concurrent invocation concerns. Coalescing of rapid nudge calls is the caller's responsibility (see `component-contract.md`); the store does not coalesce.

## Error modes

None observable to callers. Pre-condition failures are silent no-ops. There is no return value to inspect; callers should observe the resulting `state.clockSeconds` if they need to confirm a change.

## Test surface (Vitest, in `store.test.ts`)

| # | Test | Asserts |
|---|------|---------|
| 1 | clamps below 0 to 0 | `adjustClock(-30)` → `clockSeconds === 0`, exactly one event with `to === 0` |
| 2 | clamps above period max to period max | `adjustClock(periodSeconds + 30)` in regulation → `clockSeconds === periodSeconds`, one event |
| 3 | clamps above OT max to OT max in overtime | In an OT period, `adjustClock(overtimeSeconds + 30)` → `clockSeconds === overtimeSeconds` |
| 4 | uses period max in regulation, not OT max | In a regulation period with `overtimeSeconds < periodSeconds`, max stays `periodSeconds` |
| 5 | uses OT max in overtime, not period max | In an OT period with `overtimeSeconds < periodSeconds`, max becomes `overtimeSeconds` (regression test for the latent defect in the current implementation) |
| 6 | no-op when `to === from` | `adjustClock(state.clockSeconds)` → state object reference unchanged or events array length unchanged |
| 7 | no-op when `status !== "live"` | In `setup` and `finished`, `adjustClock(120)` does not change `clockSeconds` and does not append an event |
| 8 | no-op when `clockRunning` | After `startClock()`, `adjustClock(120)` does not change `clockSeconds` and does not append an event |
| 9 | preserves `clockRunning === false` | After `stopClock()` then `adjustClock(120)`, `clockRunning === false` |
| 10 | event captures `from`, `to`, `clockAt`, `period`, `timestamp` | All five fields match the documented semantics; `clockAt === from` |
| 11 | event id is unique per call | Two distinct calls produce two distinct ids |
| 12 | adjusting up from 0 does not engage `endPeriod` | After `tickClock` to 0 then `adjustClock(8)`, `state.status` is still `"live"` and the period has not advanced |
