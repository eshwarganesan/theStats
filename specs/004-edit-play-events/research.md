# Research: Edit and Delete Play-by-Play Events

**Feature**: 004-edit-play-events  
**Date**: 2026-05-26

## Unknowns from Technical Context

The plan's Technical Context section contains no `NEEDS CLARIFICATION` markers; all five high-impact ambiguities were resolved during `/speckit.clarify` (see [spec.md § Clarifications](./spec.md#clarifications)). The remaining decisions below are architectural choices that are not user-facing but materially affect implementation. Each lists the chosen approach, the rationale, and the alternatives evaluated.

---

## Decision 1: In-place mutation vs. correction events

**Decision**: In-place mutation of the existing `GameEvent` inside the `events` array.

**Rationale**:
- Spec FR-019 explicitly forbids audit metadata and history — the user wants edits to leave no trace. A correction-event approach would carry visible history into the events array, contradicting that requirement.
- The Zustand store already breaks strict append-only via `undoLastEvent` (a pop). Adding `editEvent` and `deleteEvent` keeps the policy coherent: the events array has a small, well-named set of mutators (append, edit, delete, pop-last) and one derived-state invariant (stats are computed from `events` via `computeStats` — never stored).
- Spec FR-012 explicitly requires preserving the event's position in chronological order. In-place mutation guarantees this; correction events would interleave new entries.
- The existing `computeStats` is a pure fold over `events` — it does not care about an "edits log." Re-folding the same array after mutation produces correct totals with zero algorithmic change.

**Alternatives considered**:
- **Correction events**: emit a new `{ type: "correction", targetId, patch }` event for each edit. Preserves audit trail but contradicts FR-019, requires teaching `computeStats` to honor corrections, and complicates the play-by-play UI ("show row twice with strikethrough?"). Rejected.
- **Soft-delete via flag**: instead of removing a deleted event, mark it `deleted: true` and skip it in `computeStats` and the log. Preserves audit info but contradicts FR-019 (audit metadata) and adds a new event-shape field for no user-visible benefit. Rejected.
- **Versioned event objects**: keep prior versions in a separate map keyed by event id. Adds a parallel data structure that must be kept consistent on every undo/edit/delete with no observable benefit. Rejected.

---

## Decision 2: Shape of the patch passed to `editEvent`

**Decision**: A discriminated union `EditEventPatch` whose discriminant is `type`, with each branch listing exactly the editable fields for that event type. The store action signature is `editEvent(id: ID, patch: EditEventPatch): void`.

**Rationale**:
- Constitution Principle II (Strict Type Safety) requires that each event type's editable subset be statically enforceable at the call site. A discriminated union does this without `any`, casts, or runtime type-guards in the store.
- The four eligible event types differ in shape (score has `made` and a `ScoreKind`; foul has a `FoulKind`; stat has a `StatKind`; timeout has neither `playerId` nor `kind`). A single flat `Partial<GameEvent>` would lose this narrowing and allow nonsensical patches at compile time (e.g., setting `made` on a foul).
- The discriminant matches the event's own `type` field, so the store can assert `existing.type === patch.type` once and TypeScript narrows correctly inside each branch.

**Alternatives considered**:
- **`Partial<GameEvent>` flat**: smallest API surface but allows shape violations at compile time. Rejected on Principle II.
- **Four separate actions** (`editScoreEvent`, `editFoulEvent`, etc.): equivalent type safety but more API surface and more boilerplate in the modal (a switch on event type to pick the right action). Rejected on Principle V (avoid repetition that hides a single concept).
- **Generic helper** `editEvent<T extends GameEvent["type"]>(id: ID, patch: EditableFields<T>)`: equivalent to the chosen approach but harder to read at call sites because callers must specify the type parameter explicitly. Rejected on readability.

---

## Decision 3: Modal layout — one shared modal vs. per-type modals

**Decision**: One shared `EditEventModal.tsx` component whose visible fields are conditioned on the event's `type`.

**Rationale**:
- The four event types share most editable fields (`clockAt`, `side`, and for three of four `playerId` + `kind`). Splitting into four files would duplicate the modal frame, the close/cancel behavior, and the `mm:ss` clock input wiring four times.
- Spec Assumption explicitly states: "A single shared modal scaffold is used for all four eligible event types, with the displayed fields conditional on event type."
- React handles conditional rendering of fields naturally; the modal still has a single responsibility (collect a valid patch and invoke `editEvent`), which keeps Principle III happy.

**Alternatives considered**:
- **Four per-type modal files**: explicit but duplicative. Rejected on DRY (Principle V).
- **Modal-less inline editing on the row**: nearer to spreadsheet UX but very crowded on the existing 16-character-wide log rows, and inconsistent with the app's modal patterns (ActionModal, SubstitutionModal). Rejected on UX consistency.

---

## Decision 4: Where the per-row Edit/Delete buttons live

**Decision**: Inline in `GameLog.tsx`'s existing `LogRow` component. No new component file for the two-button trigger group.

**Rationale**:
- Two `<button>` elements with localized open-handlers do not constitute a reusable abstraction. Principle V (YAGNI; "Premature abstraction is a defect") warns against splitting unless the abstraction is real.
- Both buttons need direct access to the row's `event`, which is already a `LogRow` prop. Pulling them out into a new component would just relay the prop.
- Spec FR-002 — suppress buttons on substitution/clock/period rows — is a `switch (event.type)` away inside `LogRow`. Locating this check next to the row's existing per-type rendering keeps related concerns colocated.

**Alternatives considered**:
- **Separate `LogRowActions.tsx` component**: cleaner-looking import graph but no real reuse; one consumer; just a thin wrapper. Rejected on YAGNI.
- **Hover-only affordance**: violates Constitution Principle IV ("Layout MUST NOT rely on hover-only affordances"). Hard-rejected.

---

## Decision 5: Clock-time input — reuse `ClockEditor` directly vs. a new clock input

**Decision**: Build the `clockAt` field as a controlled `<input>` inside `EditEventModal.tsx` that reuses the same `parseClock`/`formatClock` utilities from `lib/utils.ts` (and the same accept-on-Enter / commit-on-blur behavior). Do NOT reuse the `ClockEditor` component itself.

**Rationale**:
- `ClockEditor` is currently coupled to the live `clockSeconds` slice of the store and calls `adjustClock` directly. Reusing it inside the modal would require either threading a "controlled mode" prop into `ClockEditor` (widening its responsibility) or hijacking the live clock state (incorrect).
- Reusing only `parseClock`/`formatClock` (pure utilities) satisfies DRY where it matters — at the parse layer — without coupling two concerns. The modal's input then owns its own draft state and validation messaging.
- Spec Clarification Q4 chose the `mm:ss` text format, not a specific component reuse.

**Alternatives considered**:
- **Refactor `ClockEditor` to be reusable**: would touch a stable, well-tested component for a feature that doesn't need its store integration. Rejected on scope.
- **A new shared `ClockTextInput` primitive** under `components/ui/`: warranted only if a third consumer appears later; not justified for a single new use site (YAGNI).

---

## Decision 6: Recompute strategy for stats after edit/delete

**Decision**: Rely on the existing `computeStats` fold over `events`. Zustand selectors that read `events` will re-fire on the next `set` (the call inside `editEvent` / `deleteEvent`), and components subscribed to those selectors (Scoreboard, TeamPanel, etc.) will re-render normally.

**Rationale**:
- The store's derived-stats invariant (`store.ts:20-30`) is: "Statistics are NEVER stored — they are always derived from `events` via `computeStats`." Edit and delete preserve this invariant trivially; nothing else needs to change.
- Performance: a typical game has ≤ 500 events; `computeStats` is a synchronous single-pass fold. Empirically well under 1ms in `stats.test.ts` benchmarks.

**Alternatives considered**:
- **Incremental recomputation**: maintain a cache and apply diffs. Premature optimization for a O(n) fold on n ≤ 500. Rejected on YAGNI and Constitution Principle IV (no perf problem to solve).

---

## Decision 7: Validation strategy

**Decision**: Validation lives in two places, deliberately:
1. **Modal-level guards** (UX): the Save button is disabled while the draft is invalid (missing `playerId` after a `side` change, unparseable `clockAt`, out-of-range `clockAt`).
2. **Store-level guards** (defense-in-depth): `editEvent` rejects (no-ops + warns in dev) when:
   - the event id is not found,
   - the patch's `type` does not match the existing event's `type`,
   - the resulting `playerId` is not on the resulting side's current roster,
   - the resulting `clockAt` is outside `[0, periodLength]` for the event's period.

**Rationale**:
- Modal guards are the primary user-visible defense and give immediate feedback (Spec FR-010, FR-010a).
- Store guards protect against future programmatic callers and keep the invariant ("no dangling player references, no out-of-range clocks") testable in `store.test.ts` independent of the modal.
- Splitting prevents either layer from becoming a single point of failure.

**Alternatives considered**:
- **Modal-only validation**: faster to implement but leaves the store unprotected against future call sites. Rejected on Principle V.
- **Throw on invalid patch**: surfaces errors loudly but the only caller is internal; a silent no-op + dev-only console warning is simpler and matches the existing `substitute` action's "ignore-invalid-input" idiom in `store.ts:551-572`. Adopted.

---

## Out of scope (deliberate)

The following items came up during research and are deliberately deferred:

- **Editing substitution / clock / period events** — Spec FR-002 and Spec Assumption. These carry derived state (on-court lineup, status transitions) that cannot be re-derived from arbitrary edits without re-evaluating the entire events stream forward from the edit. Substitution row edits are also covered by the existing `undoLastEvent` flow for the recent case.
- **Editing `period`, `id`, `timestamp`, or `type` of an event** — Spec FR-011.
- **Audit indicators or edit history** — Spec FR-019, Spec Clarification Q2.
- **Post-game lock** — Spec FR-017, Spec Clarification Q5.
- **Optimistic concurrent-edit conflict resolution** — single-device app, single user, single tab. The Spec Edge Case "Concurrent edits and ticks" is handled by snapshot-at-open + only-write-edited-fields.

---

## Open items

None. All Technical Context fields are concrete; all clarifications are resolved.
