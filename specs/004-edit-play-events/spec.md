# Feature Specification: Edit and Delete Play-by-Play Events

**Feature Branch**: `004-edit-play-events`  
**Created**: 2026-05-25  
**Status**: Draft  
**Input**: User description: "Add an edit feature for the play by play log that allows editing certain events. Within each row of the play by play log, there should be an edit button to edit the corresponding play and a delete button to delete the play. When editing the play, a modal should pop up allowing certain features to be edited depending on the play. The recordScore, recordFoul, recordStat and recordTimeout should be allowed to be edited. The clockAt and side should be editable for each of these plays. For recordScore, the playerId, kind and made need to be editable. For recordFoul, recordStat, the playerId and kind need to be editable. For the recordTimeout, the side needs to be editable."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Correct a Mis-Attributed Play (Priority: P1)

A scorekeeper, mid-game, realizes that a made basket was credited to the wrong player on the wrong team. They locate the play in the play-by-play log, tap an inline edit affordance on that row, change the side and re-pick the correct player from the new team's roster in the modal, and save. The log row, the scoreboard, and player stats all update to reflect the correction.

**Why this priority**: Mis-attribution is the single most common live-scoring error and the most visible to coaches and viewers. Without this, the only recovery is to wipe the entire game's event tail with the existing undo, which is destructive. This delivers immediate, standalone value as the MVP.

**Independent Test**: Record a 2pt score for Home player A, then open the play's edit modal, switch the side to Away and select Away player B, save. Verify the log row, scoreboard, and the affected players' point totals reflect the correction.

**Acceptance Scenarios**:

1. **Given** a recorded score event for Home #10 is in the log, **When** the user opens the row's edit modal, changes side to Away, selects Away #7, and saves, **Then** the row, scoreboard, and player point totals reflect Away #7 having scored instead of Home #10.
2. **Given** a recorded foul event for player A, **When** the user opens the row's edit modal and changes the foul kind from "personal" to "technical" and saves, **Then** the log row, player A's foul totals, and team foul counts reflect the new kind.
3. **Given** the user opens the edit modal and modifies a field, **When** they cancel the modal, **Then** no changes are persisted and the log is unchanged.

---

### User Story 2 - Delete an Accidental Play (Priority: P2)

A scorekeeper taps a stat (e.g., an offensive rebound) by accident on the wrong player. They press the delete button on that row in the play-by-play log, confirm the prompt, and the event is removed from the log; stats recompute immediately.

**Why this priority**: Without targeted deletion, an accidental tap deep in the past requires undoing every event since (destroying valid data) or living with the error. This is high-value but secondary to attribution edits because the existing `undoLastEvent` already covers the "I just made a mistake" case for the most recent event.

**Independent Test**: Record a stat event, then several subsequent events, then press the delete button on the first event's row and confirm. Verify only that event is removed and all subsequent events remain in the log.

**Acceptance Scenarios**:

1. **Given** a stat event sits two rows below the most recent event, **When** the user presses delete on that row and confirms, **Then** that event is removed from the log while all later events remain intact.
2. **Given** the user presses delete, **When** they cancel the confirmation prompt, **Then** no event is removed.
3. **Given** a deleted score event awarded 3 points to a player, **When** the deletion is confirmed, **Then** the player's points and the team total each decrease by 3.

---

### User Story 3 - Correct the Game-Clock Time of a Past Play (Priority: P3)

A scorekeeper realizes a recorded play was logged a few seconds late (e.g., the foul was actually called at 4:23 but the tap landed at 4:18). They open the row's edit modal, adjust `clockAt` to the correct time within the same period, and save.

**Why this priority**: Affects historical accuracy of the play-by-play timeline but does not change the score, stats totals, or game state. Valuable for box-score export and review, but lower urgency than attribution and removal.

**Independent Test**: Record an event with clock running, then open the row's edit modal and change `clockAt` to a value still within that period's clock range. Verify the displayed time updates and that an out-of-range value is rejected.

**Acceptance Scenarios**:

1. **Given** an event with `clockAt = 4:18` in a 10-minute period, **When** the user edits `clockAt` to `4:23` and saves, **Then** the row displays the new clock and the underlying event is updated.
2. **Given** the user enters a `clockAt` value greater than the period's maximum length, **When** they attempt to save, **Then** save is blocked with an error and the event is unchanged.

---

### Edge Cases

- **Side change orphans a player**: When the user changes `side` in the edit modal, the previously-selected `playerId` belongs to the other team's roster. The player selector must reset and require a fresh pick from the new side's roster before save can succeed.
- **clockAt out of bounds**: The new `clockAt` must lie within `[0, periodLength]` for the event's period (where `periodLength` is `periodSeconds` for regulation periods or `overtimeSeconds` for overtime periods).
- **Editing/deleting affects derived stats**: Because team and player statistics are derived from the events list, edits and deletes must immediately recompute and reflect across the scoreboard, team panels, and any open box scores.
- **Substitution, clock, and period events**: These rows do not show edit or delete buttons. They are managed via the existing `undoLastEvent` flow.
- **Player removed from roster after the play**: If a player was deleted from the roster between recording the play and editing it, the modal must still display the original player but require selection of a current-roster player to save (no silent dangling references).
- **Edit during live play**: Edit and delete remain available regardless of game status (live, timeout, period-break, finished). The clock and game state continue normally while the modal is open.
- **Concurrent edits and ticks**: While the edit modal is open, the game clock may continue ticking. The pending edit operates on a snapshot of the event at modal-open time; on save, only the explicitly-edited fields are written.
- **Deleting the most recent event vs. undo**: Delete on the most recent event behaves the same as `undoLastEvent` for the four eligible types (no special-case substitution revert needed because substitutions are not deletable here).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display an edit button and a delete button on every play-by-play log row whose underlying event is one of: score, foul, stat, timeout.
- **FR-002**: System MUST NOT display edit or delete buttons on rows whose underlying event is substitution, clock (start/stop/adjust), or period (start/end).
- **FR-003**: Activating the edit button MUST open a modal pre-populated with the event's current field values.
- **FR-004**: The edit modal MUST allow editing `clockAt` and `side` for all four eligible event types.
- **FR-005**: For score events, the edit modal MUST additionally allow editing `playerId`, `kind` (free-throw / 2-point / 3-point), and `made` (true/false).
- **FR-006**: For foul events, the edit modal MUST additionally allow editing `playerId` and `kind` (foul kind).
- **FR-007**: For stat events, the edit modal MUST additionally allow editing `playerId` and `kind` (stat kind).
- **FR-008**: For timeout events, the editable fields MUST be limited to `clockAt` and `side` (no `playerId` or `kind`).
- **FR-009**: When `side` is changed in the modal, the player selector MUST reset and require a player from the new side's current roster before save is permitted.
- **FR-010**: The `clockAt` field MUST be constrained to `[0, periodLength]` for the event's period; values outside that range MUST block save with a visible error.
- **FR-011**: System MUST NOT allow changing an event's `period`, `id`, `timestamp`, or `type` through this feature.
- **FR-012**: On save, system MUST update the event in place within the events list, preserving its position in chronological order.
- **FR-013**: After save or delete, all derived views (scoreboard, team panels, player stats, log row contents) MUST reflect the change without a page reload.
- **FR-014**: Cancelling the edit modal MUST discard any pending changes; the event MUST be unchanged.
- **FR-015**: Activating the delete button MUST require an explicit confirmation step before the event is removed.
- **FR-016**: Confirming deletion MUST remove the event from the events list and leave all other events intact and in order.
- **FR-017**: The edit and delete affordances MUST be available regardless of game status (setup, ready, live, timeout, period-break, finished), as long as the event exists in the log.
- **FR-018**: Edit and delete operations MUST be reversible only through normal in-app workflows (re-recording or re-editing); a dedicated undo for an edit or delete is not part of this feature.

### Key Entities *(include if feature involves data)*

- **Play-by-play event** (existing): A typed entry in the chronological events list. Editable event types — score, foul, stat, timeout — carry attributes such as `side`, `playerId`, `kind`, `made`, `clockAt`, and `period`. Through this feature, only the attributes listed in FR-004 through FR-008 may be modified; identity attributes (`id`, `type`, `period`, `timestamp`) are immutable.
- **Roster** (existing): The set of players belonging to a team's `home` or `away` side. The edit modal references the current roster for the chosen `side` to populate the player selector.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A scorekeeper can correct a mis-attributed play (wrong side and wrong player) on any past event in under 15 seconds from spotting the error to confirming the fix.
- **SC-002**: A scorekeeper can delete an accidental play on any past event in under 5 seconds, including the confirmation step.
- **SC-003**: After any edit or delete is confirmed, all visible statistics and scoreboard values update within 1 second.
- **SC-004**: Zero edits result in invalid game state (a player attached to the wrong team's side, a `clockAt` outside the event's period range, or a dangling reference to a removed player).
- **SC-005**: 100% of cancelled edit modals leave the underlying event byte-for-byte unchanged.
- **SC-006**: 100% of confirmed deletions remove exactly one event and leave the order and contents of all other events unchanged.

## Assumptions

- Substitution, clock, and period events are intentionally excluded from this feature; they remain manageable only via the existing `undoLastEvent` flow because they carry derived state (on-court lineup, game-status transitions) that is not safely re-derivable from arbitrary edits.
- An event's `period` cannot be changed through this feature. Re-attributing a play to a different period would require deleting and re-recording, since period transitions carry their own clock-reset semantics.
- A single shared modal scaffold is used for all four eligible event types, with the displayed fields conditional on event type.
- Edit and delete affordances are available regardless of game status. There is no requirement to pause the clock or enter a stoppage to make a correction.
- The delete confirmation is a lightweight inline confirm (e.g., a second tap or a small confirmation dialog) — no separate "trash" or "soft delete" recovery state is in scope.
- Stat recomputation is fast enough at the scale of a single game's event volume that no incremental recomputation strategy is required for this feature.
- This feature does not introduce new persistence: edits and deletes mutate the in-memory event list managed by the existing store, alongside the existing append and `undoLastEvent` operations.
