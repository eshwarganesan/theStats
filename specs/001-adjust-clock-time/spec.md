# Feature Specification: Adjust Clock Time When Paused

**Feature Branch**: `001-adjust-clock-time`
**Created**: 2026-04-27
**Status**: Draft
**Input**: User description: "Add the ability to adjust the time on the clock component when it is paused."

## Clarifications

### Session 2026-04-28

- Q: Input modality for the precise time edit → A: Inline mm:ss edit on the clock display itself — tapping the displayed time turns the digits into an editable field; on touch devices this surfaces a numeric keypad. Commit on Enter or blur.
- Q: Adjusting up from a buzzer state (clock at 0:00) → A: Implicitly dismiss the buzzer / "End period" prompt and return the period to its normal in-progress state. One action recovers the full state; the play-by-play log records the adjustment for auditability.
- Q: Quick-nudge increment scope → A: ±1 second only. Larger corrections use the typed mm:ss field. Keeps the nudge surface compact; the typed control absorbs the long-tail "many seconds off" case.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Correct the clock to match the official game clock (Priority: P1)

A scorekeeper is tracking a live game and notices that the app's clock has drifted from the official scorer's table clock by a few seconds (because the whistle came late, the user tapped pause late, or an inbound took longer than recorded). With the clock paused, the scorekeeper opens an adjustment control on the clock display, sets the time to match the official clock, and confirms the change. The new time is shown immediately and the clock can be resumed from that value.

**Why this priority**: This is the core motivating use case. Without it, the app drifts out of sync with the official clock during a game and the scorekeeper has no recourse short of restarting a period. This single capability delivers the full value of the feature on its own.

**Independent Test**: Start a live game, pause the clock at any point, open the adjustment control, set a new time, confirm. Verify the displayed clock updates, the clock remains paused at the new value, and pressing start resumes counting down from the new value.

**Acceptance Scenarios**:

1. **Given** a live game with the clock paused at 7:42, **When** the scorekeeper opens the adjustment control and sets the time to 7:45, **Then** the displayed clock immediately shows 7:45, the clock remains paused, and starting the clock counts down from 7:45.
2. **Given** a live game with the clock running, **When** the scorekeeper looks for the adjustment control, **Then** no adjustment control is available (the clock display does not invite editing while running).
3. **Given** the clock is paused, **When** the scorekeeper opens the adjustment control and cancels without confirming, **Then** the clock value is unchanged.
4. **Given** the clock is paused at 0:00 (period buzzer state), **When** the scorekeeper attempts to adjust the time, **Then** the adjustment control is available and a non-zero time can be set so the period can be resumed if the buzzer was an error.

---

### User Story 2 - Quickly nudge the clock by a few seconds (Priority: P2)

During a stoppage, the scorekeeper realizes the clock is off by 2–3 seconds in either direction. Rather than typing an exact time, they tap a "−1s" or "+1s" style nudge control to bring the app's clock into alignment with the official clock in a single interaction.

**Why this priority**: Small corrections (1–3 seconds) are the most common case in practice and a typed edit is overkill for them. A quick-nudge affordance keeps the scorekeeper's eyes on the floor, not on the keyboard. It is additive on top of P1 and not required for the feature to be useful.

**Independent Test**: With the clock paused, repeatedly tap the nudge controls and verify the displayed clock changes by the expected increment each time, without changing the running state.

**Acceptance Scenarios**:

1. **Given** the clock is paused at 5:30, **When** the scorekeeper taps "+1s" three times, **Then** the displayed clock shows 5:33 and the clock is still paused.
2. **Given** the clock is paused at 0:02, **When** the scorekeeper taps "−1s" three times, **Then** the clock stops decrementing at 0:00 and does not become negative.
3. **Given** the clock is paused at the maximum allowed time for the current period, **When** the scorekeeper taps "+1s", **Then** the clock does not exceed the maximum.

---

### User Story 3 - The adjustment is preserved in the play-by-play record (Priority: P3)

After the game, the scorekeeper or a reviewer reads the event log and sees that a manual clock adjustment was made — what the clock was changed from, what it was changed to, in which period, and at what wall-clock moment. This makes the official record auditable and reconcilable with the scorer's table notes.

**Why this priority**: This protects the integrity of the play-by-play record (a core concern for this product) but is not required for the user to make the correction in the moment. It is the lowest-priority slice because the immediate user value is the corrected clock, not the audit trail.

**Independent Test**: Make any clock adjustment during a paused live game, then open the game log / play-by-play view and verify a clock-adjustment entry is present with the before/after values and period.

**Acceptance Scenarios**:

1. **Given** the clock is paused at 7:42 in period 2, **When** the scorekeeper adjusts the time to 7:45, **Then** the play-by-play log records a clock-adjustment event with from=7:42, to=7:45, period=2, and a wall-clock timestamp.
2. **Given** the play-by-play view is open, **When** a clock adjustment is recorded, **Then** the entry is visually distinguishable from clock start/stop entries so a reviewer can tell at a glance that the change was a manual correction rather than normal play.

---

### Edge Cases

- **Setup state**: When the game is in setup (not yet started), the clock is not "paused" in the gameplay sense — its time is governed by the period-length setting. The adjustment control is not offered in setup. Period length is changed via game settings, not via this feature.
- **Finished state**: When the game is finished, the clock is locked. The adjustment control is not offered.
- **Overtime period**: When the current period is an overtime period, the maximum allowed adjusted time is the configured overtime length (not the regulation period length). The minimum is 0:00 in all cases.
- **Buzzer state (clock at 0:00)**: The clock can be adjusted up from 0:00 — this lets the scorekeeper recover from an erroneous tick to zero (e.g., a missed pause). When the clock is adjusted up from 0:00, any active buzzer / "End period" prompt is implicitly dismissed and the period returns to its normal in-progress state without requiring a second action from the scorekeeper.
- **Resume after adjustment**: The clock remains paused after an adjustment until the scorekeeper explicitly starts it. Adjusting the time never auto-starts the clock.
- **Rapid repeated adjustments**: A scorekeeper holding or rapidly tapping a nudge control must not produce a flood of indistinguishable entries in the play-by-play record. Adjustments made in quick succession that result in a continuous edit are recorded as a single "from → to" event when the user confirms or settles.
- **Invalid input**: If a typed time entry is unparseable (e.g., letters, malformed `mm:ss`), the control rejects the input and the existing clock value is preserved.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose a clock-adjustment affordance on or adjacent to the game clock display whenever the game is live AND the clock is paused.
- **FR-002**: System MUST hide or disable the clock-adjustment affordance whenever the clock is running, the game is in setup, or the game is finished.
- **FR-003**: Users MUST be able to set the clock to any time between 0:00 (inclusive) and the maximum allowed time for the current period (inclusive). The maximum is the configured period length for regulation periods and the configured overtime length for overtime periods.
- **FR-004**: System MUST clamp out-of-range adjustment requests to the nearest valid bound rather than rejecting them silently or producing an invalid clock state.
- **FR-005**: Users MUST be able to enter a precise time value (minutes and seconds) for direct correction by tapping the clock display itself; the displayed time becomes an editable `mm:ss` field in place, with a numeric keypad surfaced on touch devices. The new value is committed on Enter or when the field loses focus.
- **FR-006**: Users MUST be able to nudge the clock up or down by ±1 second without opening a typed input. Larger corrections (>1 second) are made via the typed mm:ss field defined in FR-005; no other nudge increments (e.g., ±10s, ±1min) are offered in this feature.
- **FR-007**: System MUST leave the clock paused after an adjustment is confirmed; adjustments MUST NEVER auto-start the clock.
- **FR-008**: System MUST update the displayed clock to the new value within one frame of the user confirming the adjustment, so the scorekeeper sees the change immediately.
- **FR-009**: Users MUST be able to cancel an in-progress adjustment without changing the clock value.
- **FR-010**: System MUST record each confirmed clock adjustment as an event in the game's play-by-play record, capturing the previous time, the new time, the period in which it occurred, and a wall-clock timestamp.
- **FR-011**: A continuous adjustment session (e.g., several rapid nudges before the scorekeeper moves on) MUST be recorded as a single before/after event rather than many separate per-tap events.
- **FR-012**: The clock-adjustment affordance MUST be operable on both touch (tablet/phone) and keyboard, and MUST meet the project's accessibility contrast and keyboard-operability standards.
- **FR-013**: When a confirmed adjustment raises the clock above 0:00 from a buzzer state, the system MUST implicitly clear that buzzer / "End period" prompt and return the period to its in-progress state, without requiring an additional user action.

### Key Entities *(include if feature involves data)*

- **Clock Adjustment Event**: A record of a manual change to the game clock by the scorekeeper. Captures the period in which it occurred, the clock value before the change, the clock value after the change, and the wall-clock timestamp at which it was confirmed. Belongs to the same play-by-play stream as score, foul, substitution, and clock start/stop events, and is distinguishable from them so a reviewer can tell a manual correction apart from normal clock control.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A scorekeeper can correct a clock drift of up to 10 seconds in under 5 seconds of interaction time (from realizing the discrepancy to the corrected value being on screen).
- **SC-002**: 100% of confirmed clock adjustments appear in the play-by-play record with both before and after values present.
- **SC-003**: 0% of clock adjustments cause the clock to take a value outside the allowed range for the current period (i.e., negative, or greater than the period's configured length).
- **SC-004**: 0% of clock adjustments unintentionally start the clock; the post-adjustment running state always equals the pre-adjustment running state (paused).
- **SC-005**: In informal usability checks with at least 3 scorekeepers, ≥ 80% report that they could find and use the adjustment control without instruction within their first paused stoppage.
- **SC-006**: Continuous nudge sessions (3+ taps within 2 seconds) produce a single play-by-play entry, not one entry per tap, in 100% of tested cases.

## Assumptions

- The existing game clock model — a single countdown timer per period with a configured period length and overtime length — is preserved. This feature surfaces editing of the existing clock value; it does not redesign the clock model.
- "Paused" is the existing state in which the clock is not running while the game is live (i.e., after the scorekeeper has stopped the clock during live play). It is distinct from "setup" (game not yet started) and "finished" (game over).
- The adjustment affordance lives on or directly adjacent to the existing clock display, so the scorekeeper does not need to navigate elsewhere to make a correction.
- Period length and overtime length are configured in game settings before the game starts and are not changed by this feature. This feature only changes the *current* clock value within the bounds set by those settings.
- Adjustments are local to the current device's game session and follow the same persistence rules as other game events; this feature does not introduce new sync, multi-user, or remote-control requirements.
- Undo/redo, if it exists for other game events, will treat a clock adjustment as a single undoable event consistent with how clock start/stop events are treated. This feature does not itself add or modify the undo system.
