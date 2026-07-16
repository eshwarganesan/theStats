# Feature Specification: Team Actions

**Feature Branch**: `008-team-actions`  
**Created**: 2026-07-16  
**Status**: Draft  
**Input**: User description: "Add a button in between sub and timeout buttons in the TeamPanel component that handles team stats called \"Team Actions\". This opens up a modal for team stats, such as team turnovers from 8 second violation, 24 second violation, 3 second in the key violation, etc. The team actions must allow also for adjusting the score, as some leagues award +5 points automatically at the beginning of the game for missing jerseys on players, or award automatic +2 points for a technical foul based on league rules. They should never be able to subtract points however."

## Clarifications

### Session 2026-07-16

- Q: Should team actions (turnover + score award) be editable/deletable through the play-by-play log like other editable events, or only reversible via undo? → A: Editable and deletable via the play-by-play log, exactly like existing score/stat/timeout events (in addition to undo).
- Q: How should the score-award reason be captured — fixed presets, presets + free text, free text only, or not stored? → A: Free-text reason only (no presets); the scorekeeper types a reason, which may be left blank.
- Q: In which game states is Team Actions available (given the +5 missing-jersey award "at the beginning of the game")? → A: Score awards are available from the pre-tip "ready" state onward (plus live play and breaks); violation turnovers remain available only during live play and breaks.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record a team turnover from a violation (Priority: P1)

While keeping score, a violation occurs that belongs to the team as a whole rather than to an individual player (for example an 8-second backcourt violation, a 24-second shot-clock violation, or a 3-second lane violation). The scorekeeper opens Team Actions for that team and records the turnover against the team without having to attribute it to a specific player.

**Why this priority**: This is the core reason the feature exists — capturing team-attributed turnovers that today have no home in the app because every turnover currently requires a player. It delivers standalone value: even with nothing else, scorekeepers can log violation turnovers accurately.

**Independent Test**: Start a game, tap Team Actions on a team, select a violation turnover type, confirm, and verify the team's turnover total increases by one and the action appears in the play-by-play log attributed to the team.

**Acceptance Scenarios**:

1. **Given** a live game, **When** the scorekeeper opens Team Actions for the home team and records a "24-second violation" turnover, **Then** the home team's turnover count increases by one and a team-attributed turnover entry appears in the play-by-play log.
2. **Given** a live game, **When** the scorekeeper records an "8-second violation" turnover for the away team, **Then** only the away team's turnover total is affected and no individual player's turnover total changes.
3. **Given** a recorded team turnover, **When** the scorekeeper undoes the most recent action, **Then** the team turnover is removed and the turnover total returns to its prior value.

---

### User Story 2 - Apply an additive score adjustment (Priority: P1)

Some leagues award points that are not the result of a made shot — for example +5 points at the start of a game because a player has a missing/incorrect jersey, or +2 points awarded for an opponent's technical foul. The scorekeeper opens Team Actions and adds points to a team without attributing them to a shooter, and the running score reflects the award.

**Why this priority**: Score correctness is critical; without this, leagues with these rules cannot keep an accurate score in the app at all. It is independently valuable and testable separate from turnovers.

**Independent Test**: Open Team Actions for a team, choose a score-award reason and amount, confirm, and verify the team's score increases by exactly that amount and the award appears in the play-by-play log.

**Acceptance Scenarios**:

1. **Given** a game about to start, **When** the scorekeeper awards +5 points to the home team for a missing-jersey penalty, **Then** the home team's score increases by 5 and the award appears in the play-by-play log.
2. **Given** a live game, **When** the scorekeeper awards +2 points to the away team for a technical foul, **Then** the away team's score increases by 2 and no player's individual points change.
3. **Given** the score adjustment control, **When** the scorekeeper attempts to enter a zero or negative point amount, **Then** the system prevents the award (confirm is unavailable for non-positive amounts) so points can never be subtracted through Team Actions.
4. **Given** a recorded score award, **When** the scorekeeper undoes the most recent action, **Then** the awarded points are removed and the score returns to its prior value.

---

### User Story 3 - Access Team Actions from the team panel (Priority: P2)

The scorekeeper needs a clear, discoverable entry point for team-level actions positioned with the other team controls.

**Why this priority**: Necessary for discoverability and to satisfy the placement requirement, but the underlying actions (Stories 1 and 2) carry the primary value; the button placement is the delivery mechanism.

**Independent Test**: Verify a "Team Actions" control appears between the Sub and Timeout controls in each team's panel and opens the Team Actions modal for that team when activated.

**Acceptance Scenarios**:

1. **Given** the live game screen, **When** the scorekeeper views a team panel, **Then** a "Team Actions" control is visible positioned between the Sub control and the Timeout control.
2. **Given** the Team Actions control, **When** the scorekeeper activates it for the home team, **Then** a modal opens scoped to the home team offering violation turnovers and score adjustments.
3. **Given** the open modal, **When** the scorekeeper dismisses it without confirming an action, **Then** no changes are made to any team's stats or score.

---

### Edge Cases

- **Non-positive point entry**: The score-award control MUST NOT allow confirming an award of zero or a negative number of points; there is no path through Team Actions to reduce a team's score.
- **Which team is affected**: Actions taken from a team's Team Actions modal always apply to that team; the modal makes the target team unambiguous.
- **Rapid repeated actions**: Recording several team actions in succession accumulates correctly (each turnover increments the count by one; each award adds its amount).
- **Undo ordering**: Team actions participate in the same most-recent-first undo behavior as other recorded actions, so undo reverses whichever action was recorded last.
- **Game not yet live**: Score awards can be posted from the pre-tip "ready" state (e.g., a missing-jersey penalty before tip-off); violation turnovers cannot be recorded until the game is live.
- **Missing-jersey award at game start**: A score award can be applied at the start of the game before any shots are taken, and the resulting score is reflected immediately.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The team panel MUST present a "Team Actions" control positioned between the existing Sub control and Timeout control.
- **FR-002**: Activating the Team Actions control MUST open a modal scoped to the specific team whose panel it was activated from.
- **FR-016**: The score-award action MUST be available from the pre-tip "ready" state onward (in addition to live play and breaks) so a penalty such as a missing-jersey award can be posted before tip-off. Violation-turnover recording MUST be available only during live play and breaks (states where a turnover can actually occur).
- **FR-003**: The Team Actions modal MUST allow the scorekeeper to record a team-attributed turnover for a violation without selecting an individual player.
- **FR-004**: The modal MUST offer, at minimum, turnover types for an 8-second (backcourt) violation, a 24-second (shot-clock) violation, and a 3-second (in-the-key/lane) violation, and be structured so additional violation types can be offered.
- **FR-005**: Recording a team turnover MUST increase the affected team's turnover total by one and MUST NOT change any individual player's turnover total.
- **FR-006**: Each recorded team turnover MUST appear in the play-by-play log identified as a team-level action (not attributed to a player).
- **FR-007**: The Team Actions modal MUST allow the scorekeeper to award points to the team as a score adjustment that is not attributed to an individual shooter.
- **FR-008**: A score award MUST add the specified number of points to the affected team's running score.
- **FR-009**: The system MUST reject any score adjustment that is not a positive whole number of points; through Team Actions it MUST be impossible to leave a team's score lower than before the action.
- **FR-010**: Each recorded score award MUST appear in the play-by-play log identified as a team-level score adjustment, with its point amount and its reason (when a reason was entered).
- **FR-011**: The most recent team action (turnover or score award) MUST be reversible via the existing undo behavior, restoring the affected total or score to its prior value.
- **FR-015**: Team turnover and team score-award entries MUST be editable and deletable through the play-by-play log, consistent with existing score/stat/timeout entries. Editing a score award is still constrained to a positive whole point amount (it can never be edited to zero, negative, or a value that reduces the team's score below its pre-award state); correcting an over-award is done by editing the amount down to a smaller positive value or deleting the entry.
- **FR-012**: Dismissing the modal without confirming an action MUST leave all team stats and scores unchanged.
- **FR-013**: The score award control MUST let the scorekeeper enter a custom positive whole-point amount and an optional free-text reason (e.g., "technical foul", "missing jersey"). The reason field MAY be left blank. No fixed preset reasons are provided.
- **FR-014**: Team-level turnovers MUST be included in the team's turnover total shown in team statistics.

### Key Entities *(include if feature involves data)*

- **Team Turnover Action**: A turnover recorded against a team as a whole rather than a player, carrying the violation type (e.g., 8-second, 24-second, 3-second), the affected team, and the game time/period at which it occurred. Contributes to the team's turnover total.
- **Team Score Adjustment**: An additive award of points to a team not tied to a shooter, carrying the affected team, a positive point amount, an optional free-text reason (e.g., missing jersey, technical foul; may be blank), and the game time/period at which it occurred. Contributes to the team's score.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A scorekeeper can record a violation turnover for a team in under 5 seconds (open modal → pick type → confirm) without selecting a player.
- **SC-002**: A scorekeeper can award points to a team in under 5 seconds and see the running score update immediately upon confirmation.
- **SC-003**: 100% of attempts to enter a zero or negative score award are prevented — a team's score can never decrease as a result of Team Actions.
- **SC-004**: Every team action recorded appears in the play-by-play log and is reversible by undo, matching the behavior of existing recorded actions.
- **SC-005**: Team-recorded violation turnovers are reflected in the team's turnover total with 100% accuracy across a full game.

## Assumptions

- **Placement**: "Between the Sub and Timeout buttons" refers to the team-level controls row in each team panel; the new control sits in that row between those two existing controls.
- **Violation set**: The initial violation turnover types are the three named by the user (8-second, 24-second, 3-second) plus room for others (e.g., 5-second, backcourt); the exact final list can be refined during planning, but the three named types are required.
- **Additive-only**: All score adjustments through Team Actions are strictly additive and positive; correcting an over-award is handled by the existing edit/undo of the play-by-play entry, not by entering a negative value here.
- **Score reason**: The reason is captured as an optional free-text note (no fixed preset list), so any league rule can be described; blank is allowed. The point amount is always a custom positive whole number.
- **Consistency with existing controls**: Team Actions entries participate in the same play-by-play log, undo, and edit/delete mechanisms as other recorded actions. Availability differs by action type: score awards open earlier (from the "ready" state) than the live-only Sub/Timeout controls, while violation turnovers stay live/break-only.
- **Per-team scope**: Each team panel has its own Team Actions entry point; an action always applies to the team it was opened from.
- **Reversal/editing**: Team actions join the existing play-by-play edit/delete mechanism (feature 004) in addition to undo; no separate deletion flow is introduced. Edits to a score award remain additive-only (positive whole numbers).
