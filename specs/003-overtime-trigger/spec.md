# Feature Specification: Overtime Trigger

**Feature Branch**: `003-overtime-trigger`
**Created**: 2026-05-18
**Status**: Draft
**Input**: User description: "Add the trigger for overtime periods and a setting for overtime length in the game setup. Overtime should trigger only when the score is tied at the end of the 4th or subsequent overtime periods. If the score is not tied at the end of any of these and a winner is determined, the game should be done and score is final."

## Clarifications

### Session 2026-05-18

- Q: Should the new "Overtime length" setup input be measured in minutes or seconds? → A: Minutes. Labelled `Overtime length (min)`, default 5 for 5v5 (matches the existing `Period length (min)` convention).
- Q: When the scorekeeper uses Undo to change a scoring event after `endPeriod` has already routed the game, should the routing re-evaluate? → A: No (sticky). The transition decision is made at `endPeriod` time and is not retroactively re-derived. To revisit the decision, the scorekeeper must undo back through the `endPeriod` event itself and end the period again.
- Q: How should the scorekeeper opt out of the timed-overtime trigger (e.g. for FIBA 3x3 sudden-death rules)? → A: Add an explicit `overtimeEnabled: boolean` setting with a setup-page toggle. The tied-triggers-OT rule fires only when `overtimeEnabled === true AND overtimeSeconds > 0`. Default: `true` for 5v5, `false` for 3v3.
- Q: What label format should be used for the second and subsequent overtime periods? → A: `OT, 2OT, 3OT, 4OT, …` — change `formatPeriod` so the first OT is `OT` (unchanged) and subsequent OTs are `<n>OT` (was `OT<n>`). Applies to both the scoreboard period label and the play-by-play log entries.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tied final regulation period routes the game into overtime (Priority: P1)

A scorekeeper finishes the final regulation period of a game (the 4th period in a standard 5v5 game). If the home and away scores are tied at that moment, the game does not declare a winner — it transitions into a between-period break that announces overtime. The scorekeeper sees the period-appropriate primary-action button ("Start Overtime") and can tap it to begin the OT period.

**Why this priority**: This is the core trigger. Without it, tied regulation games incorrectly finalize as ties (which basketball doesn't permit). Every other piece of the feature depends on this transition being correct.

**Independent Test**: Score a game so home and away have equal points entering the final regulation period. End that period. Assert that the game state transitions to a break (not "finished") and the action button reads "Start Overtime". End it with a non-tied score to confirm the existing "finished" path still works.

**Acceptance Scenarios**:

1. **Given** the final regulation period is in progress with home and away tied, **When** the scorekeeper ends the period, **Then** the game transitions to a between-period break (not "finished"), the clock area shows the OT-break countdown (or live clock if OT-break-seconds is zero), and the action pad shows "Start Overtime".
2. **Given** the final regulation period is in progress with one team leading, **When** the scorekeeper ends the period, **Then** the game transitions to "finished" and the scoreboard displays the final result. The Stats and Scoresheet pages show the final standings.
3. **Given** an overtime period is in progress with home and away tied, **When** the scorekeeper ends that overtime period, **Then** the game transitions to a between-period break and the action pad again shows "Start Overtime" so the scorekeeper can launch the next OT.

---

### User Story 2 - Multi-overtime continues until a winner emerges (Priority: P2)

When the first overtime period ends with the score still tied, the game does not finalize — it loops back into a break and offers "Start Overtime" again. This continues indefinitely (2OT, 3OT, …) until one team leads at the end of an overtime period, at which point the game finalizes. The scorekeeper sees a different period label for each OT (1OT, 2OT, 3OT, …).

**Why this priority**: Multi-OT is uncommon but mandatory for tournament play. Building on US1, this just verifies the loop closes correctly past the first OT.

**Independent Test**: Construct a game state in the middle of an OT period with a tied score. End the OT period. Assert the system goes to a break, not finished. Score so that the next OT ends with one team leading. End again. Assert "finished".

**Acceptance Scenarios**:

1. **Given** the first overtime period ends tied, **When** the scorekeeper ends the period, **Then** the game transitions to a break, the action pad shows "Start Overtime", and the period label advances to 2OT once "Start Overtime" is tapped.
2. **Given** an overtime period ends with one team leading, **When** the scorekeeper ends that period, **Then** the game finalizes regardless of which OT number it was (1OT, 2OT, 3OT, …).
3. **Given** consecutive tied overtimes, **When** the scorekeeper repeatedly ends each, **Then** each transition routes to a break followed by a fresh OT, with no artificial cap on the number of overtimes.

---

### User Story 3 - Configure overtime length in setup (Priority: P3)

A scorekeeper can adjust the overtime period length in the game setup menu before the game starts. The value is persisted with the rest of the game settings and applied to every overtime period within that game (all OTs use the same length).

**Why this priority**: The underlying setting already exists in the data model — only the setup-page input is missing. Adding the UI is straightforward and lets the scorekeeper match league rules (FIBA: 5 min, NBA: 5 min, college: 5 min, etc.) without touching code.

**Independent Test**: Open the setup page, change the overtime length to a non-default value, complete setup, force a tied regulation, end the final period, start OT, and assert the live game clock begins at the configured length.

**Acceptance Scenarios**:

1. **Given** the scorekeeper is in the setup menu, **When** they change the overtime length input, **Then** the new value is saved to game settings.
2. **Given** the scorekeeper has set a non-default overtime length, **When** the first overtime begins, **Then** the live game clock starts at the configured length.
3. **Given** the scorekeeper opens setup with no prior configuration, **When** they view the overtime length field, **Then** they see the sensible default (5 minutes for 5v5).

---

### Edge Cases

- **Overtime length configured as zero**: Treated as "no overtime configured for this game." Even if regulation ends tied, the game transitions to "finished" with the tied score recorded as final. This matches the 3v3 format (which uses a first-to-2 rule modeled separately) and any league that runs untied-result-on-tie rules.
- **Final regulation period ends tied, but the format has only one period (3v3)**: The tied-game OT rule does NOT apply — 3v3 has its own first-to-2 OT logic out of scope for this feature. Detected by `overtimeSeconds === 0` in the 3v3 default settings.
- **Score is tied at the end of an overtime period with no further events possible (extreme corner case)**: System still transitions to a break and shows "Start Overtime" — there is no cap.
- **A scorekeeper manually adjusts the game clock to zero and ends the period prematurely**: The tied/untied check uses the score at the moment `endPeriod` is called, regardless of clock value.
- **The scorekeeper changes overtime length mid-game**: The new value applies to the next overtime period; an in-progress overtime is not retroactively adjusted (matches how other settings behave).
- **An overtime period begins, then the scorekeeper realizes the game should have finished (score-correction case)**: They use the existing Undo flow to roll back events; once the recorded score becomes untied, the game can be ended via the existing controls.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When the scorekeeper ends the final regulation period, the system MUST check the current score and transition to a between-period break (not "finished") if and only if home and away points are equal AND `overtimeEnabled` is `true` AND `overtimeSeconds` is greater than zero.
- **FR-002**: When the scorekeeper ends any overtime period, the system MUST apply the same rule: transition to a between-period break if the score is tied (and `overtimeEnabled` is `true` and `overtimeSeconds` > 0); otherwise transition to "finished".
- **FR-003**: When the score is not tied at the end of the final regulation period (or at the end of any overtime period), the system MUST transition to "finished" and prevent further period-advance actions.
- **FR-004**: System MUST expose two configurable fields in the **Game Settings** section at the top of the setup page: (a) an `Overtime length (min)` integer-minutes input (default 5 for 5v5, 5 for 3v3), and (b) an `Overtime` opt-in toggle with `On` / `Off` options that writes to a new `overtimeEnabled` boolean setting (default `true` for 5v5, `false` for 3v3). Both fields sit alongside the existing duration inputs added in feature 002.
- **FR-005**: System MUST persist the configured overtime length as part of the saved game settings and use it for every overtime period within that game (all OTs use the same length; the value is not per-OT-period).
- **FR-006**: When an overtime period begins (via "Start Overtime"), the live game clock MUST be initialized to the configured overtime length, and the period number MUST advance by one. The period label in the scoreboard MUST reflect the OT number (1OT, 2OT, 3OT, …).
- **FR-007**: The "Start Overtime" action button MUST appear in the action pad whenever the game is in a between-period break and the next period will be an overtime period (i.e., the current period is greater than or equal to the configured number of regulation periods).
- **FR-008**: System MUST place no cap on the number of overtime periods. Each tied overtime simply triggers another break, repeating until one team leads or the scorekeeper otherwise ends the game.
- **FR-009**: If either `overtimeEnabled` is `false` OR `overtimeSeconds` is zero, the system MUST behave as if overtime is disabled — even a tied regulation result transitions directly to "finished", and the action button never reads "Start Overtime" during that game. Both gates are independent so a scorekeeper can disable OT without zeroing the length (preserving the configured length for re-enable).
- **FR-010**: The period label rendered in the scoreboard center column and in the play-by-play log entries MUST use the format `OT` for the first overtime period and `<n>OT` for the second and subsequent overtime periods (i.e., `OT`, `2OT`, `3OT`, `4OT`, …). Regulation periods continue to render as `1st`, `2nd`, `3rd`, `4th` (unchanged).

### Key Entities

- **Game Settings (existing entity, extended)**: Already holds `overtimeSeconds`. This feature exposes that field in the setup UI and adds one new boolean field, `overtimeEnabled`, that controls whether the tied-triggers-OT rule fires.
- **Game State (existing entity, no shape change)**: The `status` machine already supports `period-break` and `finished`. This feature changes only the *decision* that routes between those two states at the end of a final-or-OT period; no new state literal is introduced.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of tied final-regulation games (with overtime length > 0) successfully route into an overtime break instead of finalizing; the scorekeeper can launch OT with a single tap.
- **SC-002**: 100% of un-tied final-regulation games finalize correctly, matching the pre-feature behavior.
- **SC-003**: A scorekeeper can configure the overtime length in setup and have it reflected in OT in under 30 seconds end-to-end.
- **SC-004**: Multi-overtime games (2OT and beyond) loop correctly with no period-label drift — the Nth overtime is labeled "NOT" in the scoreboard.
- **SC-005**: Zero false transitions: an un-tied final-or-OT period never triggers an overtime break, and a tied final-or-OT period never finalizes (when overtime is enabled).
- **SC-006**: The state transition from "end period" tap to OT-break-visible-on-screen completes in under 100ms, matching the broader UX performance budget.

## Assumptions

- **Score equality** is determined from the totals returned by the existing `computeStats` helper — the same totals shown in the scoreboard. There is no separate "tied" flag stored in state; the trigger derives it on-demand at `endPeriod` time.
- **All overtime periods use the same length**. League rules vary (some sports shorten subsequent OTs), but for v1 a single configured length applies to every OT in the game. Multi-length OT is out of scope.
- **3v3 format defaults to overtime disabled** via the new `overtimeEnabled: false` default. This matches FIBA 3x3 sudden-death rules (first-to-2 in OT, not a timed period). A scorekeeper running a 3v3 game can toggle the opt-in `On` if their league actually uses timed OT.
- **Default overtime length** for 5v5 remains the existing 5 minutes (FIBA / NBA / college consensus).
- **Period label** in the scoreboard center column and play-by-play log is rendered by the shared `formatPeriod` helper. This feature updates that helper to return `OT` for the first OT (unchanged) and `<n>OT` (e.g. `2OT`, `3OT`) for subsequent OTs — the previous `OT<n>` format is replaced.
- **The between-period break duration used for the regulation-to-OT transition** is the existing "quarter break" duration (not the halftime duration), since this is not the halftime boundary. OT-to-OT transitions also use the quarter break duration. This is consistent with how feature 002 already classifies break types.
- **The scorekeeper retains explicit control** over starting overtime — there is no auto-advance from the regulation buzzer into OT. They must tap "Start Overtime" just as they tap "Start Next Quarter" between regulation periods.
- **Undo behavior is preserved**: undoing a scoring event that breaks a tie does NOT retroactively re-route a "finished" game back to "period-break". The transition decision is made at `endPeriod` time and is itself an event-influencing state change.
- **No new persistence layer** is introduced; the existing in-memory `GameSettings` flow handles the overtime length the same way it handles every other settings field.
