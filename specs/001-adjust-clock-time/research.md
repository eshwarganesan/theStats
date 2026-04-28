# Phase 0 Research: Adjust Clock Time When Paused

**Feature**: 001-adjust-clock-time
**Date**: 2026-04-28

The spec was clarified in three turns (`/speckit.clarify` session 2026-04-28) so there are no `NEEDS CLARIFICATION` markers to resolve. This document captures the technical decisions that bridge the clarified requirements to implementation, and the alternatives considered.

---

## Decision 1 — Event modeling: extend the existing `clock` variant rather than introduce a new event type

**Decision**: Extend the existing `GameEvent` variant of `type: "clock"` so its `action` field becomes `"start" | "stop" | "reset" | "adjust"`. For `action: "adjust"`, the variant additionally carries `from: number` and `to: number` (both in seconds). For all other `action` values the `from`/`to` fields are absent.

**Rationale**:
- Keeps every clock-related event in one play-by-play "channel". The `GameLog` component can switch on `action` to render the right line, and stat folds that already ignore clock events keep ignoring them with no change.
- The strict-typing principle (Constitution II) is preserved by encoding `from`/`to` at the *variant member* level, not as `?` optionals on the existing variant. The TS exhaustiveness checker forces every consumer to handle the `"adjust"` case explicitly.
- The existing `clockAt` field already records the clock value at the moment the event was created; for `adjust` events `clockAt` equals `from` (the value before the adjustment), keeping the field's meaning consistent across actions.

**Alternatives considered**:
- *New top-level event type* `type: "clock-adjust"`. Rejected: it splits a single semantic concept across two unions and forces every event consumer to import/handle a second variant for no compositional benefit.
- *Optional `from`/`to` on the shared `clock` variant*. Rejected: it weakens the contract and lets a buggy emitter forget the fields silently.

---

## Decision 2 — Coalescing window for ±1s nudges into a single play-by-play event

**Decision**: A nudge starts a "session" recorded only in transient state (a `pendingAdjust: { from: number, lastTick: number } | null` slice on the store, or — preferred — local component state with a debounced commit to the store). The session ends and emits one `adjust` event 1.5 s after the last nudge tap, or immediately when the user opens the typed mm:ss editor, opens any other dialog, or presses Start. The emitted event has `from` = the value when the session started and `to` = the value when the session settled. Typed-edit commits (Enter or blur) are *not* coalesced — they emit immediately.

**Rationale**:
- Satisfies SC-006 (3+ taps within 2 s = one event) with margin.
- 1.5 s is short enough that the audit log entry appears "live" to a reviewer scrolling the play-by-play during the game, but long enough to absorb a normal multi-tap correction without pausing between taps.
- Keeping the pending-session state local to the component (rather than in the store) means nothing leaks into snapshots, undo, or persisted state.
- Emitting on Start prevents the (unlikely but possible) case of an in-flight nudge session bleeding into running-clock state.

**Alternatives considered**:
- *Commit to the store on every tap and de-duplicate at read time*. Rejected: violates the "events are the source of truth" invariant in `types.ts` and complicates undo.
- *Emit per-tap events*. Rejected: clutters the play-by-play and explicitly fails SC-006.

---

## Decision 3 — Input pattern for the typed `mm:ss` field

**Decision**: A controlled `<input type="text" inputMode="numeric" pattern="[0-9:]*" maxLength={5}>` rendered in place of the clock digits when the user taps the displayed time. The input's value is the formatted `mm:ss` string; on Enter or blur the value is parsed via a new pure helper `parseClock(input: string): number | null`. A `null` parse result discards the edit (preserves the previous value) and clears the input; a numeric result is passed to `adjustClock(seconds)`, which clamps and emits.

**Rationale**:
- `inputMode="numeric"` surfaces the on-screen number pad on iOS/Android without forcing `type="number"` (which would strip the `:` separator and break the `mm:ss` UX).
- `pattern="[0-9:]*"` is a hint to the keyboard; real validation happens in `parseClock`.
- A pure parse helper keeps validation testable in isolation (Vitest unit), and reusable if a setup screen ever needs the same parsing.
- "Discard on invalid" is the spec's explicit Edge Case ("If a typed time entry is unparseable, the control rejects the input and the existing clock value is preserved").

**Alternatives considered**:
- *Two separate `type="number"` inputs for minutes and seconds*. Rejected: an extra Tab/focus-management step per edit and no obvious win on tablet.
- *Native `<input type="time">`*. Rejected: the picker UI is too heavyweight, the supported format is `HH:MM`, and styling is browser-inconsistent.

---

## Decision 4 — Clamping responsibility lives in the store, not the component

**Decision**: All clamping into `[0, currentPeriodMax]` happens inside the `adjustClock` action. The component may *additionally* clamp for nicer UX (e.g., grey out a "+1s" button when at max), but the store action is the single source of truth and is the one tested for clamp correctness. The `currentPeriodMax` is `settings.overtimeSeconds` when `currentPeriod > settings.periods`, otherwise `settings.periodSeconds` — matching `resetClock`'s existing logic in `store.ts:336–339`.

**Rationale**:
- SC-003 (0% of adjustments produce out-of-range values) must hold even if a future caller (a test, a dev console invocation, an undo path) bypasses the UI.
- Removes the latent defect in the current `adjustClock` implementation (`packages/web/src/lib/store.ts:355–358`) where the cap is hard-coded to `settings.periodSeconds` and so silently truncates valid adjustments during overtime.
- A single clamp implementation simplifies the test surface (one set of clamp tests on the store, not duplicated in the component).

**Alternatives considered**:
- *Clamp only at the input layer*. Rejected on safety grounds (SC-003) and because it would leave the underlying defect for the next caller to trip over.

---

## Decision 5 — "End Period" CTA dismissal is a derivation, not an explicit clear

**Decision**: Do not introduce an "isBuzzer" flag or an explicit dismissal action. The "End Period" CTA in `ActionPad.tsx:56–60` is already derived purely from `clockSeconds === 0`. Once `adjustClock` raises the value above zero, the CTA disappears as a render consequence. Add a unit test on `ActionPad` (or the integration spec) that asserts this transition, and add an end-to-end Playwright assertion on the "buzzer recovery" scenario from the spec.

**Rationale**:
- Matches FR-013 ("the system MUST implicitly clear that buzzer / 'End Period' prompt") with zero added state.
- Avoids a second source of truth for "is the period over?" — a classic source of state-sync bugs.
- The `endPeriod()` action and the period lifecycle are untouched; only the CTA visibility is affected, and only because its trigger condition is no longer satisfied.

**Alternatives considered**:
- *Have `adjustClock` call a `clearBuzzer()` action*. Rejected: invents a state that doesn't exist; doubles the tests for one logical condition.

---

## Decision 6 — Visibility gating

**Decision**: The `ClockAdjuster` component renders `null` when `status !== "live"` OR `clockRunning === true`. The condition is computed once via store selectors and re-evaluated on those selectors only (Zustand's selector-based subscription). The `GameClock` component composes `ClockAdjuster` unconditionally — the gating lives in the child so the parent stays a pure display.

**Rationale**:
- Keeps `GameClock` a single-responsibility presentational component (Constitution III).
- Selector-based subscription means the gating re-evaluates only on transitions of `status` or `clockRunning`, not on every clock tick — important because tick changes happen every animation frame.
- The same mounted component handles both the gated-off and gated-on states; no remount cost when toggling pause/resume.

**Alternatives considered**:
- *Conditionally mount `ClockAdjuster` from `GameClock`*. Rejected: introduces a remount on every pause/resume which throws away any in-flight typed-edit state.

---

## Open follow-ups

- *Confirmation prompt for large jumps* — explicitly deferred from `/speckit.clarify` (Q deferred to plan). Not implemented in this feature; can be added later as a UX polish without changing the store contract.
- *Undo integration* — the spec assumes existing undo treats a clock adjustment as a single undoable event (consistent with how clock start/stop are treated). This plan emits a single `clock` event per confirmed/coalesced adjustment, so this assumption is satisfied at the event layer. Whether the undo UI surfaces the action by name is out of scope.
