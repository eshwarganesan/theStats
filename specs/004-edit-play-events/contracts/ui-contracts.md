# Contract: UI — `EditEventModal`, `DeleteEventConfirmModal`, and `GameLog` Row Affordance

**Feature**: 004-edit-play-events  
**Date**: 2026-05-26  
**Layer**: React components in [packages/web/src/components/game/](../../../packages/web/src/components/game/)

## `EditEventModal.tsx` (new)

### Props

```ts
interface EditEventModalProps {
  /** The event being edited. `null` means the modal is closed. */
  event:
    | Extract<GameEvent, { type: "score" }>
    | Extract<GameEvent, { type: "foul" }>
    | Extract<GameEvent, { type: "stat" }>
    | Extract<GameEvent, { type: "timeout" }>
    | null;
  /** Called when the user dismisses the modal (Cancel or backdrop). Discards changes per FR-014. */
  onClose: () => void;
}
```

The prop `event` is restricted at the type level to the four editable variants (Spec FR-002). The modal reads the home/away rosters and `settings` via `useGameStore` selectors so the caller does not have to pass them.

### Behavior

1. When `event` is non-null, the modal is open and pre-populated with the event's current values (FR-003).
2. The modal owns local draft state for `clockAt` (string `mm:ss`), `side`, and (when applicable) `playerId`, `kind`, `made`.
3. The shown fields depend on `event.type`:

   | event.type | clockAt | side | playerId | kind | made |
   |------------|:-------:|:----:|:--------:|:----:|:----:|
   | `score`    | ✅       | ✅    | ✅        | ✅ (ScoreKind: ft / 2pt / 3pt) | ✅ |
   | `foul`     | ✅       | ✅    | ✅        | ✅ (FoulKind) | — |
   | `stat`     | ✅       | ✅    | ✅        | ✅ (StatKind) | — |
   | `timeout`  | ✅       | ✅    | —        | — | — |

4. `clockAt` is a single text input parsed by the existing `parseClock` and pre-rendered by `formatClock` (research Decision 5). Unparseable input keeps Save disabled and shows an inline error (FR-010a).
5. When the user changes `side`, the player selector resets and Save remains disabled until a player from the new side's roster is chosen (FR-009).
6. The player selector lists ALL current rostered players of the selected `side`, with no on-court filtering (FR-009a, Clarification Q1).
7. Save:
   - Builds an `EditEventPatch` containing **only** the fields the user actually changed (Edge Case "Concurrent edits and ticks").
   - Calls `editEvent(event.id, patch)` on the store.
   - Calls `onClose()`.
8. Cancel / backdrop click / Escape key:
   - Calls `onClose()`.
   - Does NOT call any store action (FR-014).
9. The modal is keyboard-operable: Tab order through fields, Enter on Save (when valid), Esc to close. Buttons are real `<button>` elements (Constitution Principle IV, accessibility).

### Visual structure

A standard dialog dialog: heading ("Edit play"), the conditional fields above, an inline validation message slot, and a footer with `Cancel` and `Save` buttons. Matches the visual idiom of the existing `ActionModal` and `SubstitutionModal` for visual consistency.

### Tests (paired with implementation — Constitution Principle I)

Tests live in `EditEventModal.test.tsx`. Each MUST be written failing first.

1. **Score event — renders all five fields** (clockAt, side, playerId, kind, made) pre-filled from the input event.
2. **Foul event — renders without `made`** field.
3. **Stat event — renders without `made`** field; player selector lists current rostered players of the event's side.
4. **Timeout event — renders only clockAt and side** (no player, no kind).
5. **Side change resets player selector** and Save is disabled until a new player is chosen (FR-009).
6. **Player list scope** — when `side="home"`, only home rostered players appear and ALL of them appear regardless of starter/on-court status (FR-009a, Clarification Q1).
7. **clockAt invalid format** (e.g., "abc") — inline error shown, Save disabled (FR-010a).
8. **clockAt out of range** — inline error shown, Save disabled (FR-010).
9. **Save calls `editEvent` with only changed fields** — if user only changes `playerId`, the patch contains `{ type, playerId }` and not, e.g., `clockAt` (Edge Case "only-write-edited-fields").
10. **Cancel does NOT call `editEvent`** and leaves the event unchanged (FR-014; verify via store snapshot).
11. **Escape key closes the modal** without persisting changes.

## `DeleteEventConfirmModal.tsx` (new)

### Props

```ts
interface DeleteEventConfirmModalProps {
  /** The event awaiting confirmation. `null` means the dialog is closed. */
  event:
    | Extract<GameEvent, { type: "score" }>
    | Extract<GameEvent, { type: "foul" }>
    | Extract<GameEvent, { type: "stat" }>
    | Extract<GameEvent, { type: "timeout" }>
    | null;
  /** Called when the dialog is dismissed (Cancel or backdrop). Does not delete. */
  onClose: () => void;
}
```

### Behavior

1. When `event` is non-null, the dialog renders with a one-line summary identifying the play (FR-015). The summary reuses the same `describe()` helper currently in `GameLog.tsx` (extracted to a shared module if needed, or duplicated as a thin formatter) so the wording matches what the user sees in the log.
2. Two buttons: `Cancel` (no-op + close) and `Delete` (confirm + close).
3. `Delete`: calls `deleteEvent(event.id)` on the store, then `onClose()`.
4. `Cancel` / backdrop / Escape: calls `onClose()` only.
5. Visual idiom matches the app's existing modal patterns; `Delete` is the danger-styled button.

### Tests

12. **Renders the play summary** for a given event.
13. **Cancel does NOT call `deleteEvent`** (verify via store snapshot).
14. **Delete calls `deleteEvent(event.id)`** and dismisses (FR-016).
15. **Escape key closes without deleting**.

## `GameLog.tsx` (modified)

### Behavior changes

1. `LogRow` gains a new pair of trailing icon buttons (Edit / Delete) — but only when `event.type` is one of `"score" | "foul" | "stat" | "timeout"` (FR-001).
2. For `"substitution" | "clock" | "period"` events, neither button is rendered (FR-002).
3. The `GameLog` component manages two pieces of local state — `editing: EditableEvent | null` and `deleting: EditableEvent | null` — and mounts the two modals at its root. (Local component state is fine here; lifting to the store would conflate UI state with event data.)
4. Clicking the row's Edit button sets `editing = event`; clicking Delete sets `deleting = event`. Each modal's `onClose` clears its respective slot.
5. Existing log-row layout, sorting (newest first), and visual idiom are preserved.

### Tests (modifications to existing `GameLog.test.tsx`)

16. **Score row shows Edit and Delete buttons**.
17. **Foul row shows Edit and Delete buttons**.
18. **Stat row shows Edit and Delete buttons**.
19. **Timeout row shows Edit and Delete buttons**.
20. **Substitution row does NOT show either button** (FR-002).
21. **Clock-adjust row does NOT show either button** (FR-002).
22. **Period start/end row does NOT show either button** (FR-002).
23. **Clicking Edit on a score row opens the `EditEventModal` pre-filled with that score event**.
24. **Clicking Delete on a foul row opens the `DeleteEventConfirmModal` pre-filled with that foul event**.

## E2E Tests ([packages/web/tests/e2e/edit-play-events.spec.ts](../../../packages/web/tests/e2e/edit-play-events.spec.ts) — new)

One file covering the three user stories. Each story is independently testable (per the spec template's "Independent Test" guidance).

- **US1 P1 — mis-attribution**: set up game, record a 2pt for Home #10, open the row's edit modal, switch side to Away and pick Away #7, save, assert log row and scoreboard reflect the change.
- **US2 P2 — delete an accidental play**: record a stat for Home #10 and several later events, click Delete on the stat row, click Delete in the confirm modal, assert the stat row is gone and the later events remain.
- **US3 P3 — clockAt correction**: record a foul at the running clock, edit the row's `clockAt` to a different valid time, save, assert the row displays the new clock.

## Accessibility & responsive checks (Constitution Principle IV)

- Buttons are real `<button>` elements with discernible labels (`aria-label="Edit play"`, `aria-label="Delete play"`).
- No hover-only affordances — Edit and Delete buttons are always visible on eligible rows.
- Modals trap focus and restore it to the triggering row's Edit/Delete button on close.
- Layout responsive from 360px width upward (existing `GameLog` layout is already responsive; the new buttons fit within the existing row's right side).

## Out of scope for this contract

- Server interactions — there are none.
- Audit/edited indicators — explicitly excluded (FR-019).
- Substitution / clock / period editing — covered (or rather, NOT covered) by FR-002.
