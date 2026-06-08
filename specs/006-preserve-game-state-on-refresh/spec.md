# Feature Specification: Preserve Game State on Browser Refresh

**Feature Branch**: `006-preserve-game-state-on-refresh`
**Created**: 2026-06-07
**Status**: Draft
**Input**: User description: "Preserve the zustand game state on browser refresh. When in the middle of a game, the timer should stop and the game state should be preserved instead of losing it and going back to setup."

## Clarifications

### Session 2026-06-07

- Q: How close must the restored clock value be to its value at the moment of refresh? → A: Exact — within 1 second of its value at the moment of refresh.
- Q: How should the app warn the user when persistent storage is unavailable? → A: One-time modal on app load that the user must explicitly acknowledge before continuing.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Resume an In-Progress Game After Accidental Refresh (Priority: P1)

A scorekeeper is tracking a live game and accidentally refreshes the browser, switches tabs and returns to find the tab reloaded, or briefly loses and recovers the page (e.g., on mobile when the browser kills a backgrounded tab). Today, this drops them back to the empty setup screen and every event recorded so far — score, fouls, player events, period progress — is lost. They need the game to come back exactly as they left it so they can keep scoring without re-creating rosters, re-entering settings, or guessing the score.

**Why this priority**: This is the entire feature. A scorekeeping app that can lose an entire game to a stray browser refresh is unsafe to use for any real game; without this, the app cannot be trusted past the setup screen.

**Independent Test**: Start a game, record several plays (score changes, fouls, substitutions), refresh the browser, and confirm the user lands back on the live game view with identical rosters, settings, current period, score, event history, possession, and on-court lineup. Refreshing repeatedly should be safe.

**Acceptance Scenarios**:

1. **Given** a game in the `live` status with a running clock and several recorded events, **When** the user refreshes the browser, **Then** the app reopens on the live game view, the clock is paused within 1 second of the value it showed at the moment of refresh, and every recorded event, the score, the current period, possession, and the on-court lineup are identical to before the refresh.
2. **Given** a game in the `live` status with the clock running, **When** the user refreshes the browser, **Then** the clock does NOT resume on its own after the page loads — the scorekeeper must explicitly start it again.
3. **Given** a game in a `timeout` or `period-break` status with the break countdown running, **When** the user refreshes the browser, **Then** the app reopens in the same status, the break countdown is paused at the remaining time it showed at the moment of refresh, and the user must explicitly resume the break (or end it) to continue.
4. **Given** a game in the `setup` status (rosters/settings being entered, no tip-off yet), **When** the user refreshes the browser, **Then** the partially entered rosters and settings are restored so the user does not lose setup work.
5. **Given** a game in the `finished` status, **When** the user refreshes the browser, **Then** the finished game and its full event history remain visible until the user explicitly starts a new game.

---

### User Story 2 - Start a New Game After a Previous One (Priority: P2)

After finishing or abandoning a game, the user wants to start a new one. Because state now persists across refreshes, there must be an explicit way to clear the saved game and begin fresh — otherwise the app would forever reopen into the last game played.

**Why this priority**: Required to make the persistence behavior usable over time. Without it, the persistence in Story 1 traps users in a single game forever. It is P2 because the existing "new game" entry point in the app can be extended; this story is about ensuring that action also clears persisted state, not about building a new flow from scratch.

**Independent Test**: Finish or abandon a game, trigger the existing "new game" action, and confirm the app returns to a clean setup screen. Refreshing the browser afterward must keep the user on the clean setup screen (not bring back the prior game).

**Acceptance Scenarios**:

1. **Given** a persisted game in any non-`setup` status, **When** the user explicitly starts a new game, **Then** all persisted game state from the prior game is cleared and the app shows an empty setup screen.
2. **Given** the user has just cleared the prior game and is on the empty setup screen, **When** the user refreshes the browser, **Then** the app stays on the empty setup screen and does not resurrect the cleared game.

---

### Edge Cases

- **Refresh mid-event entry**: If the user refreshes while a play-entry dialog or substitution sheet is open (transient UI state that is not part of the committed game record), the dialog need not reopen — only committed game state is preserved.
- **Refresh during a break countdown reaching zero**: If the user refreshes while a timeout or period break is counting down, the countdown pauses on reload (same rule as the game clock); it does not silently expire in the background while the page is gone.
- **Corrupted or unreadable saved state**: If the saved state cannot be read or parsed (browser cleared storage, storage quota error, version mismatch from an older app build), the app must fall back to the setup screen rather than crash, and the user is informed that a prior game could not be recovered.
- **Storage unavailable**: If the browser blocks persistent storage entirely (private mode restrictions, storage disabled), the app must still function for the current session — refresh recovery simply does not work, and this is surfaced to the user before they invest time in a game.
- **Two tabs of the same app**: If the user opens the app in a second tab while a game is in progress in the first, both tabs should reflect the same persisted game; conflicting concurrent edits across tabs are out of scope for this feature (see Out of Scope).
- **Clock drift**: Because the clock is paused on refresh (not resumed from a "what time is it now" calculation), no real-world time accounting needs to happen across the gap. The clock value at refresh is the clock value on reload.
- **Very long event history**: A long game can accumulate hundreds of events. The persisted record must scale to a full game's worth of events without noticeable lag on save or reload.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST persist the user-facing game record locally on the device so that a full browser reload restores the same game.
- **FR-002**: The persisted game record MUST include, at minimum: both team rosters, game settings, current status, current period, current clock value, current break countdown value (if any), the full ordered event history, current possession, and the current on-court lineup for each team.
- **FR-003**: The system MUST save updated game state automatically whenever the user-visible game record changes (e.g., after recording a play, ending a period, starting/stopping the clock, changing on-court players) — the user MUST NOT have to take any explicit "save" action.
- **FR-004**: On page load, the system MUST detect a previously persisted game and restore it as the active game without requiring the user to navigate, confirm, or re-enter anything.
- **FR-005**: When a game in `live` status is restored after a refresh, the clock MUST be in a stopped (paused) state regardless of whether it was running before the refresh, and the restored clock value MUST be within 1 second of its value at the moment of refresh.
- **FR-006**: When a game in `timeout` or `period-break` status is restored after a refresh, the break countdown MUST be in a stopped (paused) state regardless of whether it was running before the refresh, and the restored countdown value MUST be within 1 second of its value at the moment of refresh.
- **FR-007**: The system MUST provide an explicit user action to discard the persisted game and return to an empty setup screen, and that action MUST clear persistence so a subsequent refresh does not resurrect the discarded game.
- **FR-008**: If persisted state cannot be read or interpreted on load, the system MUST fall back to an empty setup screen and inform the user that a prior game could not be recovered, without crashing.
- **FR-009**: If the browser environment does not allow persistent storage, the system MUST continue to function for the current session (state preserved in memory only) and MUST show a one-time modal on app load that the user must explicitly acknowledge before continuing — banners or inline warnings alone do not satisfy this requirement.
- **FR-010**: Transient UI state (open dialogs, focused form fields, in-progress unconfirmed entries) MUST NOT be persisted; only the committed game record is preserved.
- **FR-011**: Saving and restoring MUST scale to a full game's worth of events (target: a full regulation game with overtime — at minimum 500 recorded events) without noticeable lag in normal scorekeeping interactions.
- **FR-012**: The persisted record MUST be scoped to the device/browser; this feature does not introduce a server, an account, or cross-device sync.

### Key Entities *(include if feature involves data)*

- **Persisted Game Record**: A snapshot of the live game state that survives a browser refresh. Contains the same fields the in-memory game already holds (teams, settings, status, period, clock, break countdown, events, possession, on-court lineup). Conceptually a single record per device per browser — only one game can be in progress at a time.
- **Persistence Availability Signal**: A read at app start that tells the user whether persistent storage is working. Drives the warning surfaced when storage is disabled (FR-009).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A scorekeeper who refreshes the browser mid-game returns to the same game with 100% of recorded events, score, period, and lineup intact, in 100% of refreshes (excluding the storage-unavailable case in SC-005).
- **SC-002**: After a refresh during live play, the game clock is paused on reload in 100% of cases (the clock never silently keeps running across a refresh), and its restored value is within 1 second of the value it showed at the moment of refresh in 100% of cases.
- **SC-003**: Restoring a game on page load completes fast enough that the user is on the live game view within 2 seconds of page load on a typical scorekeeper device (phone or tablet on a gym Wi-Fi connection), even for a full game's event history.
- **SC-004**: Zero reports of "I lost my game because the browser refreshed" from real-use scorekeeping sessions after launch.
- **SC-005**: When persistent storage is unavailable (e.g., private browsing), the user is warned before starting a game in at least 95% of such sessions, so they make an informed choice rather than losing work.
- **SC-006**: Starting a new game after a prior one results in a clean setup screen with no leftover state from the prior game in 100% of cases, including after a follow-up refresh.

## Assumptions

- Persistence is local to a single browser on a single device. Cross-device sync, multi-user collaboration, and cloud backup are out of scope and tracked separately if needed.
- The existing event-sourced game model is the source of truth; persistence saves the same shape of data the in-memory store already holds, rather than introducing a new derived representation.
- "Stopping the clock on refresh" applies symmetrically to the game clock and to break countdowns (timeouts, period breaks). The user explicitly resumes either one after a refresh; nothing keeps ticking in the background.
- The existing "start a new game" entry point in the app will be extended to clear persistence; no new top-level navigation is required.
- Only one game at a time exists on a given browser. If a game is in progress, starting another one requires explicitly discarding the first (FR-007). Multi-game history is out of scope.

## Out of Scope

- Cross-device or cross-browser sync of an in-progress game.
- Server-side or account-bound storage of games.
- Resolving conflicts when the same game is open in two browser tabs simultaneously.
- Persisting a history of completed games for later review.
- Migrating a persisted game across breaking changes to the app's data model (a corrupted/unrecognized record falls back per FR-008).
- Resuming the clock "as if no time had passed" using wall-clock arithmetic across the refresh gap — the clock is explicitly paused on reload.
