# Feature Specification: Timeout & Period-Break Timer

**Feature Branch**: `002-timeout-break-timer`
**Created**: 2026-05-15
**Status**: Draft
**Input**: User description: "Add a timer for timeouts and end of quarter that can be adjusted in the setup menu. The game clock should display this timer and there should be a button as an option to end the timeout or start the next quarter. The buttons should only show when the timeout or when the break time between quarters are in progress."

## Clarifications

### Session 2026-05-15

- Q: For v1, should the system support multiple timeout types (e.g., full vs short) or a single configurable timeout duration? → A: Single configurable timeout duration for v1.
- Q: When the timeout/break countdown reaches zero, should the system auto-advance the game state or freeze at 0:00 and wait for the action button? → A: Freeze at 0:00 and wait for the explicit button tap.
- Q: Should timeout/break start and end be recorded as discrete events in the game event log? → A: No — the break is purely a UI/state concern; no new event variants are added.
- Q: Can the scorekeeper adjust the running timeout/break countdown the same way they adjust the live clock (tap-to-edit + nudges)? → A: No (revised 2026-05-18 after early UX feedback) — the countdown is read-only. The action button is the only interactive control during a timeout or between-period break, alongside the existing per-team controls in the team panels.
- Q: Should halftime be modeled as a distinct break with its own configurable duration? → A: Yes — three separate durations (timeout, between-quarter break, halftime break). Halftime applies between the first half and the second half of regulation; the between-quarter break applies between all other adjacent periods.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the timeout/break countdown on the clock (Priority: P1)

A scorekeeper has just called a timeout (or the period buzzer has sounded). The game clock area immediately switches from showing the live game time to showing a countdown for the timeout (or the between-period break). The countdown ticks down once per second so the scorekeeper, players, and bench can see how long is left before play resumes.

**Why this priority**: This is the core informational value of the feature. Without a visible countdown, the scorekeeper has to track the break duration mentally or on a separate device. Even without any explicit action button, a visible timer is independently useful — once it reaches zero the scorekeeper can manually resume play via the existing controls.

**Independent Test**: Start a game, trigger a timeout for one side, and confirm the clock area shows a countdown beginning at the configured timeout duration. Wait or fast-forward and confirm it ticks down. Do the same for a period transition by ending a period and confirming the between-period countdown appears.

**Acceptance Scenarios**:

1. **Given** the game is in live play, **When** the scorekeeper calls a timeout, **Then** the clock area displays a countdown initialized to the configured timeout duration and counts down once per second.
2. **Given** the game has just ended a period that is not the final period, **When** the period transition begins, **Then** the clock area displays a countdown initialized to the configured period-break duration.
3. **Given** the clock area is displaying a timeout countdown, **When** the countdown reaches zero, **Then** the display freezes at zero (no negative time, no auto-skip) so the scorekeeper still has the option to resume play deliberately.

---

### User Story 2 - End the timeout or start the next quarter with one tap (Priority: P2)

While a timeout or between-period break is in progress, a single primary-action button appears next to the clock area. Its label reflects the current state ("End Timeout" during a timeout, "Start Next Quarter" — or the period-appropriate equivalent — during a between-period break). Tapping it advances the game to the next state (live play, or the next period) regardless of how much time remains on the countdown.

**Why this priority**: Teams are often ready to resume before the timer expires. Letting the scorekeeper end the break early avoids forcing them to wait or to fumble for the existing state controls. The feature is independently testable but depends on Story 1 for the underlying state — without the countdown, this button has no context.

**Independent Test**: With Story 1 implemented, trigger a timeout and confirm the "End Timeout" button appears. Tap it before the countdown expires and confirm the game returns to live play immediately. Then end a period, confirm the "Start Next Quarter" button appears, tap it, and confirm the period advances.

**Acceptance Scenarios**:

1. **Given** a timeout countdown is in progress, **When** the scorekeeper taps "End Timeout", **Then** the game returns to live play state and the countdown disappears.
2. **Given** a between-period countdown is in progress, **When** the scorekeeper taps "Start Next Quarter", **Then** the game advances to the next period, the live game clock returns to the configured per-period duration, and the countdown disappears.
3. **Given** the game is in live play, the setup menu, or the finished state, **When** the scorekeeper looks at the clock area, **Then** no "End Timeout" or "Start Next Quarter" button is visible.

---

### User Story 3 - Configure timeout and break durations in setup (Priority: P3)

In the game setup menu, the scorekeeper can adjust the default timeout duration and the default between-period break duration to match the league or competition they're keeping score for. The configured durations are saved with the rest of the game settings and apply to all subsequent timeouts/breaks within that game.

**Why this priority**: League rules differ (NBA/FIBA/college/youth all have different defaults). Reasonable built-in defaults will let most users start a game without entering setup, so the configurability is a refinement of the core experience, not a blocker.

**Independent Test**: With Stories 1 and 2 implemented, open the setup menu and change the timeout duration to a non-default value, then start the game and trigger a timeout. Confirm the countdown begins at the configured value, not the default. Repeat for the between-period break.

**Acceptance Scenarios**:

1. **Given** the scorekeeper is in the setup menu, **When** they change the timeout duration field, **Then** the new value is reflected in the saved game settings.
2. **Given** the scorekeeper has set a non-default timeout duration, **When** a timeout is called during the game, **Then** the countdown begins at that configured value.
3. **Given** the scorekeeper opens setup with no prior configuration, **When** they view the timeout and break duration fields, **Then** they see sensible default values pre-filled.

---

### Edge Cases

- **Final period ends**: After the final regulation period concludes, the system should NOT start a between-period countdown if the game is finished. If overtime begins, the between-period countdown applies in the same way as between regulation periods.
- **Configured duration of zero**: A scorekeeper might set the timeout or break duration to 0. In that case the countdown immediately shows zero and the action button is available for an immediate tap to resume — effectively skipping the break.
- **Timeout called while a between-period break is in progress**: Should be prevented at the source (the existing timeout-call action should already require live play). If somehow triggered, the timeout countdown takes precedence.
- **Action button tapped after the countdown reached zero**: The button still works — it advances state. The zero-display is informational only.
- **Setup-menu change during an active game**: Newly configured values apply to subsequent timeouts/breaks; an in-progress countdown is not retroactively adjusted.
- **Multiple rapid taps on the action button**: Only the first tap should take effect; subsequent taps while the state transition is in flight should be no-ops.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display a countdown timer in the game clock area while a timeout is in progress, initialized to the configured timeout duration and decrementing once per second.
- **FR-002**: System MUST display a countdown timer in the game clock area while a between-period break is in progress, initialized to the configured between-quarter break duration (between adjacent periods that are not the halftime boundary) or the configured halftime break duration (between the last period of the first half and the first period of the second half), and decrementing once per second.
- **FR-003**: System MUST NOT display the timeout/break countdown when the game is in any other state (setup, live play, finished).
- **FR-004**: System MUST stop the countdown at zero (no negative time) and leave the display visible until the state transitions.
- **FR-005**: System MUST display a single primary-action button adjacent to the clock area whenever — and only whenever — a timeout countdown or a between-period countdown is active.
- **FR-006**: The action button's label MUST reflect the current state: "End Timeout" during a timeout, and a period-appropriate label such as "Start Next Quarter" / "Start Overtime" during a between-period break.
- **FR-007**: Tapping the action button MUST advance the game state immediately, regardless of remaining countdown time: end the timeout (resume live play) or start the next period.
- **FR-008**: After advancing the period via the action button, the live game clock MUST reset to the configured period or overtime duration as appropriate for the new period.
- **FR-009**: System MUST expose three configurable fields in the setup menu — timeout duration, between-quarter break duration, and halftime break duration — at the top of the game settings section, each accepting values in seconds.
- **FR-010**: System MUST persist the configured timeout, between-quarter break, and halftime break durations as part of the saved game settings and apply them to every subsequent break within that game.
- **FR-011**: System MUST provide sensible default values for the timeout and break durations so a new game can be played without visiting the setup menu.
- **FR-012**: System MUST NOT initiate a between-period countdown after the final period of regulation if the game ends there; the between-period countdown applies between any period and its successor period only.
- **FR-013**: System MUST ignore repeated taps on the action button while a state transition triggered by the first tap is still in flight.
- **FR-014**: The countdown is read-only while in progress. The tap-to-edit input and ±1-minute / ±1-second nudge controls MUST NOT be rendered during a timeout or between-period break; the only path to leave the break early is the primary action button (FR-015). Once the break ends, the standard editable controls return for the live clock.
- **FR-015**: During a timeout or break countdown, the action pad MUST hide all of its normal in-play action controls (record-score, foul, substitution, timeout-call, etc.) and surface a single "End Timeout" or "Start Next Quarter" / "Start Overtime" / "Start Second Half" button — whichever matches the current state — as its only visible action.

### Key Entities

- **Timeout Countdown**: A transient timer instantiated when a timeout begins. Initial value comes from the configured timeout duration. Lifecycle: created on timeout start, destroyed on timeout end (timer expiry + button press, or immediate button press).
- **Period-Break Countdown**: A transient timer instantiated when a period ends and another period follows. Initial value comes from the configured period-break duration. Lifecycle parallels the Timeout Countdown.
- **Game Settings (existing entity, extended)**: Already holds per-period and overtime durations. Gains three new fields: timeout duration (seconds), between-quarter break duration (seconds), and halftime break duration (seconds).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of triggered timeouts and 100% of between-period transitions display a visible countdown in the clock area; the countdown matches the configured duration to the second.
- **SC-002**: The action button is rendered in 100% of timeout/break states and in 0% of other states (setup, live play, finished).
- **SC-003**: A scorekeeper can locate, change, and save the timeout and between-period durations in the setup menu in under 30 seconds.
- **SC-004**: A scorekeeper can end a timeout or advance a period via the action button in under 100ms of perceived latency between tap and clock-area update, matching the broader UX performance budget for user-initiated actions.
- **SC-005**: With default durations applied, a new scorekeeper can complete a full game with timeouts and period breaks without ever opening the setup menu.

## Assumptions

- The timeout duration is a single global value per game (one duration covers all timeouts, regardless of which team called them and regardless of full vs short timeouts). Variable timeout types (e.g., NBA 60-second vs. 100-second media timeouts) are out of scope for v1 and can be added later if needed.
- Two between-period break durations are modeled separately: a "between-quarter break" applied between any two adjacent periods that do *not* straddle the halftime boundary (and between OT periods), and a "halftime break" applied between the last period of the first half and the first period of the second half. Half-boundary is derived from the configured number of regulation periods (e.g., for 4 quarters, halftime falls between periods 2 and 3).
- The countdown freezes at zero rather than auto-advancing the state. The scorekeeper retains explicit control over when play resumes, matching how the live game clock currently behaves when it hits zero.
- The timeout/break countdown reuses the existing game-clock display area rather than rendering as a separate element. The existing tap-to-edit and ±1m / ±1s nudge controls are NOT rendered during the countdown — they reappear once the break ends and the live clock returns. If a scorekeeper needs to extend or shorten a break, that's done by ending the break early (via the action button) and re-triggering it, or via direct store mutation during development.
- Default values: timeout duration = 60 seconds, between-quarter break duration = 120 seconds, halftime break duration = 600 seconds (10 minutes). These reflect common league norms (FIBA full timeout, ~2 minute period break, ~10 minute halftime) and can be overridden in setup.
- The existing timeout-call action (already in the app) drives the state transition into "timeout"; this feature adds the countdown and action-button behavior on top of that existing state.
- The start and end of timeout/break countdowns are NOT recorded as discrete events in the game event log. Existing events (e.g., the `timeout` event already emitted by `recordTimeout`, and the existing period-advance behavior) remain unchanged; this feature treats the countdown and its termination as transient UI/state, not as auditable game actions. Consequence: the game-log timeline view will not show explicit "play resumed" entries, and exact break durations are not reconstructable from history.
- The configured durations are part of the existing game settings entity and persist via the same mechanism as the per-period duration. No new persistence layer is introduced.
- Mobile/tablet backgrounding behavior (does the timer keep ticking when the device sleeps?) follows the same behavior as the existing live game clock — no separate handling is introduced by this feature.
