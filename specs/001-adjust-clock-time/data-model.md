# Phase 1 Data Model: Adjust Clock Time When Paused

**Feature**: 001-adjust-clock-time
**Date**: 2026-04-28

This feature adds **one** new event-sourced concept (a manual clock adjustment, modeled as a new `action` of the existing `clock` event) and **one** behavioral change to the existing in-store `adjustClock` action. No new top-level entities, no schema or persistence changes.

---

## Type changes — `packages/web/src/lib/types.ts`

### `GameEvent` — `clock` variant

**Before** (current, [types.ts:133–140](../../packages/web/src/lib/types.ts#L133-L140)):

```ts
| {
    type: "clock";
    id: ID;
    timestamp: number;
    period: number;
    clockAt: number;
    action: "start" | "stop" | "reset";
  }
```

**After**:

```ts
| {
    type: "clock";
    id: ID;
    timestamp: number;
    period: number;
    clockAt: number;
    action: "start" | "stop" | "reset";
  }
| {
    type: "clock";
    id: ID;
    timestamp: number;
    period: number;
    clockAt: number;
    action: "adjust";
    /** Clock value (in seconds) immediately before the adjustment was confirmed. */
    from: number;
    /** Clock value (in seconds) immediately after the adjustment was confirmed. Equals `clockAt`. */
    to: number;
  }
```

Two distinct union members rather than `from?`/`to?` on a single member, so TypeScript exhaustiveness checks force every consumer that switches on `action` to handle `"adjust"` explicitly.

### Field semantics

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `id` | `ID` (string) | `uid()` helper | Same convention as every other event. |
| `timestamp` | `number` | `Date.now()` at commit | Wall-clock time of confirmation, not of any individual nudge tap. |
| `period` | `number` | `state.currentPeriod` at commit | Period in which the adjustment occurred. |
| `clockAt` | `number` | Equals `from` | The value before the change — keeps `clockAt` semantically consistent across all event variants ("clock value at the moment the event was created"). |
| `action` | `"adjust"` | literal | New literal added to the union. |
| `from` | `number` | Pre-adjustment `clockSeconds` | In seconds. Always ≥ 0 and ≤ current period max. |
| `to` | `number` | Post-clamp `clockSeconds` | In seconds. Always ≥ 0 and ≤ current period max. May equal `from` if the user typed the same value (no event is emitted in that case — see "Validation rules"). |

### Validation rules

- `from` and `to` MUST satisfy `0 ≤ value ≤ currentPeriodMax`, where `currentPeriodMax = state.currentPeriod > state.settings.periods ? state.settings.overtimeSeconds : state.settings.periodSeconds`.
- An `adjust` event MUST NOT be emitted when `from === to` (no-op confirmations don't pollute the log).
- An `adjust` event MUST NOT be emitted when `state.status !== "live"` or when `state.clockRunning === true` (the store action rejects these calls outright; see contract).
- `clockAt === from` is an invariant of the emitter and is asserted by the store unit tests.

### State transitions involving the new event

```text
            clockRunning=true
                 │  (no adjustment possible)
                 ▼
       ┌────────────────────┐
       │ live + running     │
       └─────────┬──────────┘
                 │ stopClock
                 ▼
       ┌────────────────────┐    adjustClock(s)        ┌───────────────────┐
       │ live + paused      │───────────────────────▶  │ live + paused     │
       │ clockSeconds = X   │   emits clock/adjust     │ clockSeconds = s' │
       │                    │   when X ≠ s' and        │                   │
       │                    │   state allows           │                   │
       └─────────┬──────────┘                          └─────────┬─────────┘
                 │                                              │
                 │ startClock                                   │ startClock
                 ▼                                              ▼
       (back to running)                              (back to running, from new value)
```

If `X === 0` (buzzer state) and the user adjusts to `s' > 0`, the derived "End Period" CTA in `ActionPad` disappears as a pure render consequence — no separate state transition.

---

## Behavioral change — `adjustClock` action in `packages/web/src/lib/store.ts`

### Current implementation ([store.ts:355–358](../../packages/web/src/lib/store.ts#L355-L358))

```ts
adjustClock: (seconds) =>
  set((s) => ({
    clockSeconds: Math.max(0, Math.min(s.settings.periodSeconds, seconds)),
  })),
```

### New implementation (semantics)

```ts
adjustClock: (seconds) =>
  set((s) => {
    if (s.status !== "live") return s;
    if (s.clockRunning) return s;

    const max =
      s.currentPeriod > s.settings.periods
        ? s.settings.overtimeSeconds
        : s.settings.periodSeconds;
    const from = s.clockSeconds;
    const to = Math.max(0, Math.min(max, seconds));

    if (to === from) return s; // no-op, no event

    return {
      clockSeconds: to,
      events: [
        ...s.events,
        {
          type: "clock" as const,
          id: uid(),
          timestamp: Date.now(),
          period: s.currentPeriod,
          clockAt: from,
          action: "adjust" as const,
          from,
          to,
        },
      ],
    };
  }),
```

### Invariants this enforces

- `clockSeconds` is always in `[0, currentPeriodMax]` after the action returns.
- An event is appended **iff** the action changed `clockSeconds`.
- The action is a no-op outside `status === "live"` or while the clock is running.
- The clock's running state is preserved (never auto-starts) — there is no `clockRunning: true` anywhere in this action.

### Coalescing of consecutive nudges

Coalescing is **not** implemented in the store. The store treats each `adjustClock(seconds)` call as a discrete commit. Coalescing is the responsibility of the `ClockAdjuster` component, which holds a transient session value and only calls `adjustClock` once per settled session (debounced 1500 ms after the last nudge tap, or immediately on typed commit / Start press / dialog open). This keeps the store pure and the event log free of synthetic in-progress state.

---

## Derived consumers (read-only changes)

### `GameLog.tsx`

Adds a new render branch for `event.type === "clock" && event.action === "adjust"`. Rendered text format:

```
Clock adjusted   {formatClock(from)} → {formatClock(to)}   (P{period})
```

Visually distinguishable from `start`/`stop` entries (per FR-010 and Acceptance Scenario 2 of User Story 3) by an icon or label change — leave specifics to the component test snapshot.

### Stat folds (`stats.ts`)

No changes. Stat aggregation already ignores `type: "clock"` events; adding a new `action` does not change the type-narrowing branch.

### Undo

No code change. The existing undo (pop the last event from `events`) treats the new variant identically to start/stop — one event, one pop.

---

## Helper additions — `packages/web/src/lib/utils.ts`

### `parseClock(input: string): number | null`

Pure function. Accepts strings of the form `MM:SS` or `M:SS` (with `M` and `MM` ≥ 1 minute notation) or pure-second forms `S`, `SS`, `SSS` (interpreted as seconds when no colon present). Returns total seconds as a `number`, or `null` if the input cannot be parsed.

| Input | Output | Reason |
|-------|--------|--------|
| `"7:42"` | `462` | Standard mm:ss |
| `"07:42"` | `462` | Leading zero accepted |
| `"0:00"` | `0` | Buzzer value |
| `"42"` | `42` | Pure-seconds shorthand |
| `"700"` | `700` | Pure-seconds shorthand (caller clamps to max) |
| `"7:60"` | `null` | Seconds component out of range |
| `"-1:00"` | `null` | Negative not allowed |
| `""` | `null` | Empty string |
| `"abc"` | `null` | Non-numeric |
| `":30"` | `null` | Missing minutes component |

This helper is fully unit-tested in `utils.test.ts` and is the single parse path for typed input.

---

## Summary of file deltas

| File | Change | Surface |
|------|--------|---------|
| [packages/web/src/lib/types.ts](../../packages/web/src/lib/types.ts) | Add `"adjust"` member to `GameEvent` `clock` variant union | Type only |
| [packages/web/src/lib/store.ts](../../packages/web/src/lib/store.ts) | Reimplement `adjustClock` semantics (gating, period-aware clamp, event emission, no-op short-circuit) | Action behavior |
| [packages/web/src/lib/utils.ts](../../packages/web/src/lib/utils.ts) | Add `parseClock(input: string): number \| null` | New pure helper |
| [packages/web/src/components/game/ClockAdjuster.tsx](../../packages/web/src/components/game/ClockAdjuster.tsx) | New component — typed edit + ±1s nudges + coalescing | New |
| [packages/web/src/components/game/GameClock.tsx](../../packages/web/src/components/game/GameClock.tsx) | Compose `ClockAdjuster` (gating lives in the child) | Composition |
| [packages/web/src/components/game/GameLog.tsx](../../packages/web/src/components/game/GameLog.tsx) | Render branch for `action: "adjust"` | Display only |
