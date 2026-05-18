# Contract: Store Actions

**Feature**: 002-timeout-break-timer
**Date**: 2026-05-16

This contract specifies the precise pre/post-conditions for each Zustand store action touched by this feature. Each entry below is testable in isolation via [packages/web/src/lib/store.test.ts](../../../packages/web/src/lib/store.test.ts). The contract is the source of truth for the test list.

The web app has no external network surface for this feature; all "contracts" are intra-process function signatures plus their semantic guarantees.

## Conventions

- `S` denotes the store state immediately before the action.
- `S'` denotes the state immediately after.
- `INV-N` references invariants in [data-model.md](../data-model.md#invariants).

---

## C-001: `recordTimeout(side: Side)`

**Signature** (existing, semantics changed):

```ts
recordTimeout: (side: "home" | "away") => void;
```

**Preconditions**: None enforced — the existing UI already gates timeout-call availability. If status is not "live", the call still mutates as below (UI is responsible for not calling it incorrectly).

**Postconditions** (when called from `status === "live"`):

| Field | After |
|---|---|
| `status` | `"timeout"` |
| `breakSeconds` | `S.settings.timeoutSeconds` |
| `clockRunning` | `false` |
| `clockSeconds` | unchanged (frozen — INV-2) |
| `events` | `[...S.events, { type: "timeout", side, period, clockAt, … }]` (unchanged from today) |

**Invariants enforced**: INV-1, INV-2, INV-3.

**Tests** (must be added/extended in `store.test.ts`):
1. Calling `recordTimeout("home")` while live and paused sets `status === "timeout"`.
2. Calling `recordTimeout("home")` seeds `breakSeconds` from `settings.timeoutSeconds`.
3. `clockSeconds` is unchanged across a `recordTimeout` call.
4. The emitted `timeout` event preserves its existing shape (regression).

---

## C-002: `endTimeout()` (new)

**Signature** (new):

```ts
endTimeout: () => void;
```

**Preconditions**: `status === "timeout"` for the action to have effect. No-op otherwise.

**Postconditions** (when `status === "timeout"`):

| Field | After |
|---|---|
| `status` | `"live"` |
| `breakSeconds` | `0` |
| `clockRunning` | `false` (the scorekeeper must re-start the clock explicitly, matching how the existing pause/resume flow works) |
| `clockSeconds` | unchanged (live game time resumes from where it was) |
| `events` | unchanged (no event emitted per spec clarification) |

**Invariants enforced**: INV-1, INV-3.

**Tests**:
5. `endTimeout()` from `status === "timeout"` returns status to `"live"`.
6. `endTimeout()` from `status === "timeout"` resets `breakSeconds` to 0.
7. `endTimeout()` does NOT auto-start the clock (`clockRunning` stays false).
8. `endTimeout()` does NOT emit a new event.
9. `endTimeout()` is a no-op when `status !== "timeout"` (e.g., during `period-break`).

---

## C-003: `endPeriod()` (existing, semantics extended)

**Signature** (unchanged):

```ts
endPeriod: () => void;
```

**Postconditions** (when called from `status === "live"`, non-final period):

| Field | After |
|---|---|
| `status` | `"period-break"` (unchanged) |
| `breakSeconds` | `seededBreakSeconds` per the halftime-boundary rule (new) |
| `clockRunning` | `false` (unchanged) |
| `clockSeconds` | unchanged (frozen — INV-2) |
| `events` | `[...S.events, { type: "period", action: "end", … }]` (unchanged) |

Where `seededBreakSeconds` is derived as:

```ts
const isHalfBoundary =
  settings.periods % 2 === 0 && currentPeriod === settings.periods / 2;
const seededBreakSeconds = isHalfBoundary
  ? settings.halftimeBreakSeconds
  : settings.quarterBreakSeconds;
```

When called from `status === "live"`, final regulation period: `status === "finished"` (unchanged), `breakSeconds === 0`.

**Tests**:
10. `endPeriod()` from period 1 in a 4-period game seeds `breakSeconds` to `quarterBreakSeconds`.
11. `endPeriod()` from period 2 in a 4-period game seeds `breakSeconds` to `halftimeBreakSeconds`.
12. `endPeriod()` from period 3 in a 4-period game seeds `breakSeconds` to `quarterBreakSeconds`.
13. `endPeriod()` from period 4 in a 4-period game transitions to `"finished"` with `breakSeconds === 0`.
14. `endPeriod()` in a 3v3 (1-period) format transitions to `"finished"` (no break, no halftime).
15. `endPeriod()` from period 4 of regulation (OT now starting) in a 4-period game with OT seeds `breakSeconds` to `quarterBreakSeconds` (last-regulation-to-OT is a "quarter" break, not a halftime).

---

## C-004: `startNextPeriod()` (existing, semantics extended)

**Signature** (unchanged):

```ts
startNextPeriod: () => void;
```

**Postconditions** (when called from `status === "period-break"`):

| Field | After |
|---|---|
| `status` | `"live"` (unchanged) |
| `currentPeriod` | `currentPeriod + 1` (unchanged) |
| `clockSeconds` | `settings.periodSeconds` (regulation) or `settings.overtimeSeconds` (OT) — unchanged |
| `breakSeconds` | `0` (new) |
| `events` | `[...S.events, { type: "period", action: "start", … }]` (unchanged) |

**Tests**:
16. `startNextPeriod()` clears `breakSeconds` to 0.
17. `startNextPeriod()` does NOT clear `breakSeconds` if called outside a break (no-op safety).

---

## C-005: `tickClock(deltaMs: number)` (existing, semantics extended)

**Signature** (unchanged):

```ts
tickClock: (deltaMs: number) => void;
```

**Postconditions**:

If `status === "timeout"` or `status === "period-break"`:
- `breakSeconds := Math.max(0, S.breakSeconds - deltaMs / 1000)`
- `clockSeconds` unchanged (INV-2).

Else if `clockRunning === true` (existing behavior):
- `clockSeconds := Math.max(0, S.clockSeconds - deltaMs / 1000)`
- `breakSeconds` unchanged.

Else: no-op (existing behavior).

**Tests**:
18. `tickClock(1000)` from `status === "timeout"` decrements `breakSeconds` by 1, leaves `clockSeconds` unchanged.
19. `tickClock(1000)` from `status === "period-break"` decrements `breakSeconds` by 1, leaves `clockSeconds` unchanged.
20. `tickClock(1000)` from `status === "live", clockRunning: true` decrements `clockSeconds` by 1, leaves `breakSeconds` (which is 0) unchanged.
21. `breakSeconds` is clamped at 0 (FR-004) — `tickClock(5000)` with `breakSeconds === 1` results in `breakSeconds === 0`, not negative.

---

## C-006: `adjustClock(value: number)` (existing, semantics extended)

**Signature** (unchanged):

```ts
adjustClock: (value: number) => void;
```

**Postconditions**:

If `status === "timeout"` or `status === "period-break"`:
- `breakSeconds := clamp(0, value, 30 * 60)` (30-minute generous cap per R-006).
- `clockSeconds` unchanged.

Else (existing behavior):
- `clockSeconds := clamp(0, value, periodMax)` where `periodMax` is `settings.overtimeSeconds` if in OT, else `settings.periodSeconds`.
- `breakSeconds` unchanged.

**Tests**:
22. `adjustClock(180)` from `status === "timeout"` sets `breakSeconds === 180`.
23. `adjustClock(180)` from `status === "live"` sets `clockSeconds === 180` (existing behavior preserved).
24. `adjustClock(0)` from a break state sets `breakSeconds === 0`.
25. `adjustClock(99999)` from a break state clamps `breakSeconds` to 1800 (30 min cap).

---

## C-007: `setSettings(partial: Partial<GameSettings>)` (existing, no behavioral change)

The new fields (`timeoutSeconds`, `quarterBreakSeconds`, `halftimeBreakSeconds`) flow through the existing `setSettings` action without any code change — the partial is merged into `settings` as today. No new test needed beyond verifying the inputs in the setup page wire up correctly (covered at the component level).

---

## UI Contracts

### ActionPad rendering matrix

| `status` | Primary CTA | Secondary row (Undo + End Period) |
|---|---|---|
| `setup` | (none — hint text only) | hidden |
| `ready` | `"Tip Off"` | hidden |
| `live` (clockSeconds > 0) | `"Start Clock"` / `"Stop Clock"` | **visible** |
| `live` (clockSeconds === 0) | `"End Period"` | **visible** |
| `timeout` | `"End Timeout"` (calls `endTimeout`) — **new** | **hidden** |
| `period-break` | period-appropriate label per R-005 (calls `startNextPeriod`) | **hidden** |
| `finished` | `"Final"` static label | hidden |

### Clock display matrix (in `GameClock`)

| `status` | `breakSeconds` | Source field |
|---|---|---|
| `setup` / `ready` / `live` / `finished` | any | `clockSeconds` |
| `timeout` / `period-break` | `> 0` | `breakSeconds` |
| `timeout` / `period-break` | `0` (zero-configured or ticked down) | `clockSeconds` (fallback per FR-004) |

### ClockPanel editable surface

| `status` + `clockRunning` | Editable surface |
|---|---|
| `live`, `clockRunning === false` | full (editor + nudge) — existing |
| `live`, `clockRunning === true` | none (read-only) — existing |
| `timeout` | full (editor + nudge) — NEW |
| `period-break` | full (editor + nudge) — NEW |
| anything else | none |

The full editable surface is mounted whenever the scorekeeper can sensibly change time. The bounds applied by `ClockNudge` differ per R-006.

---

## What this contract does NOT touch

- The existing `score`, `foul`, `stat`, `clock`-action events.
- `computeStats` and stats page logic.
- Persistence layer (game settings are persisted in-memory only, same as today).
- Player and team data structures.
