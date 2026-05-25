# Contract: Store Actions & Helpers

**Feature**: 003-overtime-trigger
**Date**: 2026-05-18

This contract specifies the precise pre/post-conditions for each piece touched by this feature. Each entry below is testable in isolation. The contract is the source of truth for the test list.

## Conventions

- `S` denotes the store state immediately before the action.
- `S'` denotes the state immediately after.
- `INV-N` references invariants in [data-model.md](../data-model.md#invariants).

---

## C-001: `endPeriod()` — routing on final regulation period (existing, semantics extended)

**Signature** (unchanged):

```ts
endPeriod: () => void;
```

**Preconditions**: `status === "live"`. Caller is responsible for not invoking otherwise.

**Postconditions** (when `currentPeriod >= settings.periods` — final regulation):

| Condition | `S'.status` | `S'.breakSeconds` | `S'.clockSeconds` | New event |
|---|---|---|---|---|
| `overtimeEnabled === true && overtimeSeconds > 0 && tied` | `"period-break"` | `settings.quarterBreakSeconds` (per existing R-003 of feature 002 — OT-boundary is not halftime) | unchanged | `{ type: "period", action: "end", … }` |
| `overtimeEnabled === false` OR `overtimeSeconds === 0` OR not tied | `"finished"` | `0` | unchanged | `{ type: "period", action: "end", … }` |

Where "tied" is `computeStats(events, homeTeam, awayTeam, settings, currentPeriod).home.points === ….away.points`.

**Tests**:
1. End period 4 of a 4-period game with `overtimeEnabled: true`, `overtimeSeconds: 300`, score `48-48`: status → `"period-break"`, `breakSeconds === quarterBreakSeconds`.
2. End period 4 of a 4-period game with `overtimeEnabled: true`, `overtimeSeconds: 300`, score `50-48`: status → `"finished"`, `breakSeconds === 0`.
3. End period 4 of a 4-period game with `overtimeEnabled: false`, `overtimeSeconds: 300`, score `48-48`: status → `"finished"` (opt-out beats tie).
4. End period 4 of a 4-period game with `overtimeEnabled: true`, `overtimeSeconds: 0`, score `48-48`: status → `"finished"` (zero-length beats tie).
5. End period 1 of a 4-period game (mid-regulation): status → `"period-break"` regardless of score (existing behavior preserved).

---

## C-002: `endPeriod()` — routing on overtime period (new branch, same action)

**Postconditions** (when `currentPeriod > settings.periods` — already in OT):

| Condition | `S'.status` | `S'.breakSeconds` | New event |
|---|---|---|---|
| `overtimeEnabled === true && overtimeSeconds > 0 && tied` | `"period-break"` | `settings.quarterBreakSeconds` | `{ type: "period", action: "end", … }` |
| not tied (or OT disabled mid-game) | `"finished"` | `0` | `{ type: "period", action: "end", … }` |

**Tests**:
6. End an OT period (`currentPeriod=5`, periods=4) with score `52-52`: status → `"period-break"` (signals 2OT will follow).
7. End an OT period (`currentPeriod=5`, periods=4) with score `54-52`: status → `"finished"`.
8. End 2OT (`currentPeriod=6`) still tied: status → `"period-break"` (3OT will follow). Asserts multi-OT loop closure.

---

## C-003: `formatPeriod(period, regularPeriods)` — output format change

**Signature** (unchanged):

```ts
formatPeriod(period: number, regularPeriods: number): string;
```

**Postconditions** — pure function, return values:

| Input | Output (NEW) | Output (OLD) |
|---|---|---|
| `formatPeriod(1, 4)` | `"1st"` | `"1st"` (unchanged) |
| `formatPeriod(4, 4)` | `"4th"` | `"4th"` (unchanged) |
| `formatPeriod(5, 4)` | `"OT"` | `"OT"` (unchanged) |
| `formatPeriod(6, 4)` | **`"2OT"`** | `"OT2"` |
| `formatPeriod(7, 4)` | **`"3OT"`** | `"OT3"` |
| `formatPeriod(8, 4)` | **`"4OT"`** | `"OT4"` |

**Tests**:
9. Existing test at [utils.test.ts:100-102](../../../packages/web/src/lib/utils.test.ts#L100-L102) ("numbers further overtimes OT2, OT3, …") updated: assert `"2OT"` / `"3OT"` instead of `"OT2"` / `"OT3"`.

---

## C-004: Setup-page UI — `Overtime length (min)` input

**Setup page**: [packages/web/src/app/setup/page.tsx](../../../packages/web/src/app/setup/page.tsx)

**Behavior**:
- Renders an `<Input>` with label `"Overtime length (min)"` in the Game Settings section.
- Value bound to `Math.round(settings.overtimeSeconds / 60)`.
- `onChange` calls `setSettings({ overtimeSeconds: Math.max(0, parseInt(e.target.value) || 0) * 60 })`.
- Default rendered values: `5` for 5v5, `5` for 3v3 (the data layer defaults remain `5*60` / `0` per data-model; we're decoupling the field default from the toggle default — 3v3 keeps `overtimeSeconds: 5*60` so flipping the toggle on gives a sensible non-zero clock).

**Wait — clarification on 3v3 default for overtimeSeconds**: per the spec, 3v3 default `overtimeSeconds` is `0`. To make the toggle meaningful (flip On and get a working clock without also editing the length), the data-model needs to default 3v3 `overtimeSeconds` to a non-zero value too. Updating the spec / data-model accordingly: **3v3 default `overtimeSeconds: 5 * 60` (5 minutes), `overtimeEnabled: false`**. Length is preserved but disabled by default.

**Tests**:
10. Default render: input shows `5` for both formats.
11. Editing the input dispatches `setSettings({ overtimeSeconds: <minutes * 60> })`.
12. The input is visible inside the Game Settings `<section>`.

---

## C-005: Setup-page UI — `Overtime` On/Off toggle

**Setup page**: [packages/web/src/app/setup/page.tsx](../../../packages/web/src/app/setup/page.tsx)

**Behavior**:
- Renders a two-button toggle (`On` / `Off`) using the same pattern as the existing `FormatToggle` for 5v5/3v3.
- Active button reflects `settings.overtimeEnabled`.
- Clicking `On` calls `setSettings({ overtimeEnabled: true })`. Clicking `Off` calls `setSettings({ overtimeEnabled: false })`.
- Default rendered values: `On` active for 5v5, `Off` active for 3v3.

**Tests**:
13. Default render: `On` active for 5v5 (after setting format), `Off` active for 3v3.
14. Clicking `Off` while currently `On` dispatches `setSettings({ overtimeEnabled: false })`.
15. Clicking `On` while currently `Off` dispatches `setSettings({ overtimeEnabled: true })`.

---

## UI Contracts

### ActionPad — UNCHANGED

The `"Start Overtime"` label was wired in feature 002's `nextPeriodLabel` helper at [ActionPad.tsx:18-24](../../../packages/web/src/components/game/ActionPad.tsx#L18-L24) and already fires whenever `currentPeriod >= settings.periods`. No code change. Existing test `"after the last regulation period (going to OT): shows Start Overtime"` continues to pass verbatim.

### Scoreboard period-label display

After C-003 lands, the Scoreboard's centre-column period label automatically renders the new OT format (`"OT"`, `"2OT"`, `"3OT"`, …) because Scoreboard already calls `formatPeriod`. No Scoreboard code change.

### GameLog play-by-play period rendering

Same — GameLog calls `formatPeriod` for its period column. The new format propagates without changes to GameLog itself. If any existing GameLog tests assert the old `OT2` format in rendered output, they need to flip to the new format. To be inspected during implementation.

---

## Total test count

12 new test cases enumerated above (T1–T15 less consolidations). Test file targets:
- `store.test.ts`: tests 1–8 (eight new cases for the routing decisions).
- `utils.test.ts`: test 9 (one existing test updated; no net change to test count).
- `setup/page.test.tsx`: tests 10–15 (six new cases — three for length input + three for toggle).

Plus any GameLog tests that need their OT-period string assertions updated.

---

## What this contract does NOT touch

- `startNextPeriod` — already handles unbounded OT via the `currentPeriod >= settings.periods` branch; no change.
- `recordTimeout`, `endTimeout`, `tickClock`, `adjustClock` — unrelated to OT.
- Stats / scoresheet pages — they read from `computeStats`, no changes needed.
- Persistence — no schema changes (in-memory store).
