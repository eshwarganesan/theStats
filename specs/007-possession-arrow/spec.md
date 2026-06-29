# Feature Specification: Possession Arrow

**Feature Branch**: `007-possession-arrow`
**Created**: 2026-06-23
**Status**: Draft
**Input**: User description: "Add a feature that tracks possession and displays the possession arrow beside the clock, indicating which team the ball goes to in tied-up or alternating-possession situations. The feature should be a setting that can be toggled to display during the game or not at game setup. The arrows should be clickable and allow manual selection of which team the possession arrow should point towards."

## Clarifications

### Session 2026-06-28

- Q: Should the scorekeeper have any way to reset the indicator back to the **unset** state after they've assigned a direction (excluding starting a new game)? → A: No. The **unset** state exists only at the start of a fresh game. Once the scorekeeper taps the indicator and assigns a direction, every subsequent tap oscillates between **home** and **away**; there is no mid-game path back to **unset**. A mis-tap is recoverable with one additional tap.
- Q: Where should the current possession-arrow direction (not just the toggle setting) be displayed? → A: Live game screen only. The Stats page, Scoresheet, and game summary do not render the arrow direction at all. The arrow is a real-time scorekeeping tool, not a post-game stat, so it does not appear in any event-driven or summary view.
- Q: How should the indicator look when the game is `finished`? → A: Dimmed / lower opacity, otherwise identical content. The final direction remains legible (so a reviewer can see which team held the arrow last) but the dimmed treatment signals the control is no longer interactive. Matches the standard disabled-control convention.

### Session 2026-06-29

- Q: Should the indicator be a single tap-to-cycle button, or two distinct arrow buttons that each select a specific team? → A: Two distinct, larger arrow buttons. The left arrow points at the home team and selects `'home'` on tap; the right arrow points at the away team and selects `'away'`. Tapping the **already-selected** arrow is a no-op — the direction only changes when the **opposite** arrow is tapped. This replaces the earlier cycle model; the underlying state values (`'unset' | 'home' | 'away'`) and persistence are unchanged.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Scorekeeper sees and flips the possession arrow during the game (Priority: P1)

A scorekeeper running a 5v5 game sees a possession-arrow indicator beside the live clock. After the opening tip, the official signals which team owns the arrow, and the scorekeeper taps the indicator to point it at the correct team. Later, when a held ball is whistled, the indicator already shows which team is awarded the ball; once the inbound is taken, the scorekeeper taps again to flip it to the other team for the next alternating-possession situation.

**Why this priority**: This is the entire value of the feature. Without a visible, tap-to-flip indicator beside the clock, the scorekeeper has no way to track which team the arrow points to. Every other piece (the setup toggle, persistence) only matters because this primary interaction exists.

**Independent Test**: Start a 5v5 game with the possession-arrow feature enabled. Confirm the indicator is visible beside the clock in a neutral/unset state. Tap it; confirm it points to the home team. Tap again; confirm it flips to the away team. Tap a third time; confirm it flips back to home. Refresh the page; confirm the current direction is preserved (per feature 006).

**Acceptance Scenarios**:

1. **Given** a 5v5 game has just been set up with possession-arrow display enabled and no team owns the arrow yet, **When** the scorekeeper opens the live game screen, **Then** an arrow indicator is visible beside the clock in a neutral/unset state (no team highlighted) and is interactive.
2. **Given** the possession arrow currently points at the away team, **When** the scorekeeper taps the indicator, **Then** the indicator flips to point at the home team and the change is reflected immediately (sub-100ms).
3. **Given** the possession arrow points at the home team, **When** the scorekeeper taps it while the clock is running, paused, or during a timeout/break, **Then** the flip succeeds without affecting the clock, the score, or the event log.

---

### User Story 2 - Scorekeeper toggles the feature on or off at game setup (Priority: P2)

A scorekeeper preparing a 3v3 pick-up game does not want possession-arrow tracking — 3v3 uses alternating possession after every made basket, so a visible arrow is noise. In the setup screen, they switch the `Possession arrow` toggle to `Off`. When the game starts, the live screen shows no indicator beside the clock and possession-arrow state is not tracked. Later, the same scorekeeper sets up a refereed 5v5 game and leaves the toggle `On`; the indicator appears beside the clock as described in US1.

**Why this priority**: Hiding the indicator must be possible for formats that do not use a possession arrow, but the underlying tap-to-flip behavior is what delivers value. P2 covers the configurability, while P1 covers the core interaction.

**Independent Test**: In setup, switch the `Possession arrow` toggle to `Off`, complete setup, and verify the live game screen renders no possession indicator beside the clock. Return to setup for a new game, switch the toggle to `On`, complete setup, and verify the indicator appears.

**Acceptance Scenarios**:

1. **Given** the scorekeeper is in the setup screen, **When** they view the **Game Settings** section, **Then** they see a `Possession arrow` toggle with `On` / `Off` options, defaulted to `On` for 5v5 and `Off` for 3v3.
2. **Given** the scorekeeper sets `Possession arrow` to `Off` and starts the game, **When** the live game screen renders, **Then** no possession-arrow indicator is shown beside the clock.
3. **Given** the scorekeeper sets `Possession arrow` to `On` and starts the game, **When** the live game screen renders, **Then** the indicator is shown beside the clock and is tap-responsive per US1.

---

### User Story 3 - Possession-arrow state persists with the rest of the game (Priority: P3)

A scorekeeper has been managing a tight 5v5 game with the possession arrow enabled. The arrow currently points to the away team. The scorekeeper accidentally refreshes the browser; when the game state restores (per feature 006), the possession arrow still points to the away team, exactly as it did before the refresh. The same is true if they navigate to the Stats page and back to the live screen.

**Why this priority**: Possession-arrow state has no value if it resets on every refresh. Building on the existing localStorage persistence layer (feature 006) is cheap, but it requires explicitly including the arrow state in the persisted slice and treating it the same way as score and clock.

**Independent Test**: Start a game, flip the arrow to the away team, refresh the page. Verify the arrow restores pointing to the away team. Navigate away and back. Verify the arrow direction is unchanged.

**Acceptance Scenarios**:

1. **Given** the possession arrow points to the home team, **When** the scorekeeper refreshes the page, **Then** the restored game state shows the arrow still pointing to the home team.
2. **Given** the scorekeeper had set the arrow to `Off` in setup and the game is in progress, **When** the page is refreshed, **Then** the live screen still renders without the indicator and no arrow state is restored.
3. **Given** a game has been finished and archived in the local play log, **When** the scorekeeper opens a new game with arrow display enabled, **Then** the new game starts with an unset arrow, not with the previous game's direction.

---

### Edge Cases

- **Scorekeeper taps the indicator before the opening tip**: The tap is honored — the arrow leaves the unset state and points at the chosen team. There is no enforced game-clock prerequisite.
- **Scorekeeper turns the toggle `Off` in setup, plays the game, never sees the indicator**: No arrow state is read or written for that game; the persisted game state stores the toggle as `false` but does not store a meaningful direction.
- **Game format is 3v3 with the toggle manually flipped to `On`**: The indicator displays and behaves identically to the 5v5 case. The default is `Off` for 3v3, but the scorekeeper can opt in.
- **Scorekeeper undoes the last play**: The possession arrow is *not* affected. Arrow flips are not stored in the play-by-play event log; they are a single piece of UI state. Undo continues to govern only events in the log.
- **Game is finished (`status === 'finished'`)**: The indicator remains visible but becomes non-interactive (read-only), rendered with reduced opacity to signal the disabled state, matching how the rest of the live game UI freezes after the final buzzer. The final direction stays legible.
- **Indicator is tapped twice rapidly on the same arrow**: The second tap is a no-op (the arrow is already selected). The visual and state remain unchanged. There is no debounce.
- **Indicator is tapped rapidly on alternating arrows**: Each tap to the opposite arrow swaps the selection. There is no debounce; the state simply tracks the latest tap.
- **Game starts with no arrow set and immediately needs to be referenced for an alternating-possession call**: The neutral/unset state is visually distinct (e.g., no team highlighted) so the scorekeeper knows they must tap to assign initial ownership before relying on it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose a `Possession arrow` toggle with `On` / `Off` options in the **Game Settings** section of the setup screen, alongside other display/behavior toggles (e.g., the `Overtime` toggle from feature 003).
- **FR-002**: The `Possession arrow` setting MUST default to `On` for the 5v5 format and `Off` for the 3v3 format, matching the convention used for `overtimeEnabled` in feature 003.
- **FR-003**: When the `Possession arrow` setting is `On`, the live game screen MUST render a possession-arrow indicator visually adjacent to the live clock, large enough to be tap-friendly on touch devices (minimum 44×44 pt touch target).
- **FR-004**: When the `Possession arrow` setting is `Off`, the live game screen MUST NOT render any possession-arrow indicator, and no possession-arrow state MUST be displayed elsewhere.
- **FR-005**: The indicator MUST visually represent three states: (a) **unset** — neither team is highlighted, the indicator looks neutral; (b) **points at home** — the arrow direction or highlight clearly identifies the home team; (c) **points at away** — the arrow direction or highlight clearly identifies the away team. The exact iconography (e.g., a left/right arrow, two highlighted halves) is at design discretion, but the three states MUST be distinguishable at a glance.
- **FR-006**: The indicator MUST render as two distinct, side-by-side arrow buttons — a left-pointing arrow representing the home team and a right-pointing arrow representing the away team. Tapping the **left** arrow MUST set the direction to **home**; tapping the **right** arrow MUST set the direction to **away**. Tapping the arrow that is already selected MUST be a no-op (no state change, no side effect). The **unset** state is reachable only by starting a fresh game — once either arrow has been tapped, the direction can only be **home** or **away** for the remainder of the game.
- **FR-007**: A possession-arrow direction change MUST take effect immediately upon tap (sub-100ms perceived latency) and MUST NOT modify the clock, score, period, fouls, timeouts, or play-by-play event log.
- **FR-008**: The current possession-arrow direction MUST be stored as part of the in-memory game state and persisted to local storage via the existing persistence layer (feature 006), keyed alongside the rest of the game state.
- **FR-009**: When a saved game state is restored on page refresh or navigation, the possession-arrow direction MUST restore to exactly the value it held at the time of the last state save (including the **unset** state).
- **FR-010**: When a new game begins (after game setup completes), the possession-arrow direction MUST initialize to **unset**, regardless of any previous game's final direction.
- **FR-011**: When the game `status` is `finished`, the indicator MUST remain visible (if enabled) but MUST be non-interactive — taps MUST NOT change the direction. The indicator MUST be visually dimmed (reduced opacity, matching the standard disabled-control convention) while keeping the final direction legible. Content (which team the arrow points at) MUST NOT change between live and finished states.
- **FR-012**: The possession-arrow indicator MUST be tap-responsive in every other game status — `pre-game`, `period`, `period-break`, and `timeout` — without any clock or status-state prerequisites.
- **FR-013**: The possession-arrow toggle setting MUST be readable from the game settings after the game starts (e.g., reflected in the Stats page or game summary) but MUST NOT be editable after the game starts, consistent with how other game-settings fields are frozen at game start.
- **FR-014**: The possession-arrow **direction value** (unset / home / away) MUST be rendered ONLY on the live game screen, beside the clock. It MUST NOT appear on the Stats page, the Scoresheet, the game summary, or any other route. The direction is a real-time scorekeeping aid, not a stat, and is excluded from all post-game and event-driven summary views.

### Key Entities

- **Game Settings (existing entity, extended)**: Gains one new boolean field, `possessionArrowEnabled`, with format-driven defaults (true for 5v5, false for 3v3). Set in setup and frozen for the game's duration.
- **Game State (existing entity, extended)**: Gains one new field representing the current possession-arrow direction, taking one of three values: `unset`, `home`, or `away`. Persisted to local storage via the existing feature-006 persistence slice.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A scorekeeper running a 5v5 game with the feature enabled can identify the current possession-arrow direction in under 1 second of looking at the live screen.
- **SC-002**: A scorekeeper can flip the possession-arrow direction in a single tap, with the visual update appearing in under 100ms (matching the broader UX performance budget).
- **SC-003**: 100% of page refreshes during an in-progress game with the feature enabled restore the possession-arrow direction to the exact value held before the refresh.
- **SC-004**: 100% of new games begin with an unset possession arrow regardless of any previous game's final direction.
- **SC-005**: When the feature is disabled at setup, zero possession-arrow UI is rendered on the live screen, and no state-tracking overhead is incurred.
- **SC-006**: Tapping the indicator never produces a visible side-effect on the clock, score, period, fouls, timeouts, or play-by-play log.

## Assumptions

- **The possession arrow is a manual-only indicator for v1.** Flips are driven exclusively by scorekeeper taps; no game event (held ball, jump ball, alternating-possession scenario) automatically updates the arrow. Future work could add event-driven auto-flip, but it is explicitly out of scope here.
- **Arrow flips are not stored in the play-by-play log.** They are a single piece of mutable UI state. As a consequence, the existing `undoLastEvent` flow does NOT roll back arrow flips, and the Stats / Scoresheet pages do not list arrow flips as events.
- **The indicator is positioned beside the live clock**, sized and spaced to remain finger-friendly on touch devices. The exact pixel placement (left of the clock, right of the clock, above) is at the discretion of the implementing designer, subject to FR-003 (visible and adjacent).
- **The neutral/unset state is the initial state of every game.** The scorekeeper assigns ownership post-tip by tapping. This avoids guessing which team lost the tip — the app has no tip-off event.
- **The toggle setting follows the 5v5/3v3 default convention established by feature 003** (`overtimeEnabled`): on by default for refereed 5v5, off by default for casual 3v3.
- **No new persistence layer is introduced.** The new toggle setting flows through the existing game-settings shape (frozen at game start), and the runtime possession-arrow direction joins the existing persisted game-state slice introduced by feature 006.
- **Disabling the toggle hides the UI but does not erase the persisted direction**, because no direction is ever written when the toggle is off. A scorekeeper who finishes a game with the toggle off and starts a new game with the toggle on will see the new game's arrow start unset (per FR-010), not at some leftover value.
- **Iconography is at design discretion.** A common pattern is a horizontal `◀ HOME — AWAY ▶` arrow that flips left/right, with the unset state rendered as a dimmed/neutral indicator. The spec does not prescribe a specific visual, only the three distinguishable states (FR-005).
- **Accessibility**: The indicator should expose its current direction as accessible text (e.g., screen-reader-friendly label "Possession: home" / "Possession: away" / "Possession: unset"), consistent with the rest of the live-game UI.
