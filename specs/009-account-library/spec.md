# Feature Specification: Account Page & Saved Games Library

**Feature Branch**: `009-account-library`
**Created**: 2026-07-22
**Status**: Draft
**Input**: User description: "Create an account page that shows the user's account information and allows them to edit it. The account page should also show a library(list) of games saved to continue if it was interrupted or review if the game ended and want to see the statsheet or game log."

## Clarifications

### Session 2026-07-22

- Q: Beyond display name (FR-004), which additional account fields are editable from the account page in v1? → A: Display name + password change (email stays read-only in v1); password change requires the current password.
- Q: What happens to an anonymous, locally-persisted in-progress game (feature 006) when the user signs into an account on the same device? → A: One-time prompt during sign-in — user picks "Save to my account", "Keep local only", or "Discard" before the sign-in flow completes.
- Q: How does a user tell two library entries apart when they share team labels and date (e.g., pool play + bracket on the same day)? → A: Auto-generated label only — team labels + date + start time as a tiebreaker within a day. No user-editable game name in v1.
- Q: Is a confirmation step required before deleting an in-progress game from the library (FR-025 already requires it for finished games)? → A: Yes — confirmation required for both. In-progress deletion warning explicitly names the count of recorded events (or period reached) that will be lost; finished deletion uses a standard confirmation.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View and Edit Account Information (Priority: P1)

A signed-in user opens the account page from an entry point in the app shell (e.g., a profile / account menu). They see the information associated with their account — at minimum the email they signed up with and a display name — presented in a form they can review and update. When they change an editable field and save, the update is confirmed inline, persists across sessions, and is reflected everywhere the app shows the user's identity.

**Why this priority**: The account page is the container for every other capability in this feature (including the library). Even before a library exists, an account page that just displays and edits identity information is an independently useful, shippable slice — it gives users their first visible touchpoint with their own account after signing in and unblocks basic profile management that feature 005 explicitly left out of scope.

**Independent Test**: Sign in, navigate to the account page from the app shell, verify the current email and display name are shown, edit a supported field (e.g., display name), save, and confirm that the new value persists across a full page reload and is reflected anywhere else the app displays the user's identity.

**Acceptance Scenarios**:

1. **Given** the user is signed in, **When** they navigate to the account page, **Then** the page shows the email address associated with their account and any other supported profile fields, each in a form control that either reflects a current value or is empty if never set.
2. **Given** the user is on the account page, **When** they change an editable field to a valid new value and save, **Then** the system persists the change, shows an inline confirmation, and the new value is displayed after the next full page reload.
3. **Given** the user is on the account page, **When** they change an editable field to an invalid value (e.g., empty display name where required, malformed email) and try to save, **Then** the system rejects the change with a specific inline validation message and preserves the user's other unsaved edits so they are not lost.
4. **Given** the user is signed out or is an anonymous local-only user, **When** they navigate to the account page URL, **Then** the system redirects them to the login page (per the account-gated route policy established in feature 005).
5. **Given** the user is on the account page, **When** they trigger the change-password action, enter their current password and a new password that satisfies the auth provider's policy, and submit, **Then** the system updates the password, keeps the user signed in on the current device, and confirms the change inline. If the current password is wrong or the new password fails policy, the change is rejected with a specific inline error and no update is made.

---

### User Story 2 - See a Library of Saved Games (Priority: P2)

A signed-in user opens the account page and, in addition to their profile, sees a list of games associated with their account. Each game in the list is labeled with enough information to be recognized at a glance — the two teams (or team labels), the date, the current status (in progress vs. finished), and, for finished games, the final score. The list is ordered so that the most recent activity surfaces first. If the user has no games yet, the section shows an empty state explaining that games will appear here as they are played.

**Why this priority**: The library is the reason for having an account beyond identity — it is where a user finds any prior work. Without it, an authenticated user has nothing to come back to. It sits behind Story 1 because the account page shell must exist before a library can be shown inside it, but it is the second most important slice.

**Independent Test**: Sign in as a user who has previously played at least one game (an in-progress game and a finished game), open the account page, and verify that both games appear in the library with correct team labels, date, status, and (for the finished game) final score, ordered with the most recently active game first.

**Acceptance Scenarios**:

1. **Given** the user has one or more saved games associated with their account, **When** they view the library section of the account page, **Then** each game is shown with team labels, the date it was played, its current status (in progress / finished), and the score (final if finished, current if in progress).
2. **Given** the user has no saved games, **When** they view the library section, **Then** the section shows an empty-state message explaining that games appear here as they are played, rather than showing an empty list or an error.
3. **Given** the user has multiple saved games, **When** the list is rendered, **Then** games are ordered by most-recent activity first (a game with newer edits ranks above an older one, regardless of when it was first created).
4. **Given** the library contains many games (e.g., a full season's worth — 50+), **When** the library is displayed, **Then** the page remains responsive to scroll and interaction; games beyond a reasonable initial batch may be loaded incrementally rather than all at once.

---

### User Story 3 - Continue an Interrupted Game From the Library (Priority: P2)

A user was in the middle of a game and stopped scoring — the scoring session ended (they closed the tab, switched devices, ran out of time, etc.) without the game itself being finished. Later, from the account page's library, they see that game marked as "in progress" and open it. The app takes them into the live game view with the full state restored (rosters, settings, current period, current clock value, event history, possession, on-court lineup) — exactly the same restoration guarantee feature 006 gives on a local refresh, but now sourced from their account so it works even on a different device.

**Why this priority**: This is the "continue" half of the user's stated goal for the library. It is P2 because it depends on Story 2 (the library must exist first) but is essential for the library to have real utility — a list of games you cannot open is not useful. The restoration guarantees themselves already exist (feature 006); this story extends the entry point.

**Independent Test**: On device A, sign in and start a game, record several events, then abandon the tab. On device B (or a fresh browser session on device A), sign in with the same account, open the library, select the in-progress game, and verify that the live game view opens with the same rosters, settings, period, clock value, event history, possession, and on-court lineup, with the clock paused per feature 006's rules.

**Acceptance Scenarios**:

1. **Given** the library contains an in-progress game, **When** the user selects that game, **Then** the app opens the live game view for that game with the full committed game record restored (rosters, settings, status, period, clock value, break countdown value, ordered event history, possession, on-court lineup).
2. **Given** the in-progress game is opened from the library, **When** the live game view loads, **Then** the clock (and any active break countdown) is paused at the value it had when the game was last saved — the user must explicitly resume it, matching feature 006's restoration behavior.
3. **Given** the user has an in-progress game locally on the current device (from feature 006's local persistence) AND opens a different in-progress game from their library, **When** they open the library game, **Then** the app makes the library game the active game without silently discarding the locally in-progress game — the user is warned and given a choice before any local unsaved-to-library state would be lost.
4. **Given** the user opens a game from the library and later leaves the live game view (navigates away, closes the tab, signs out), **When** they return to the library later, **Then** any events they recorded during the visit are reflected in the library entry's status/score/last-activity time.

---

### User Story 4 - Review a Finished Game From the Library (Priority: P3)

A user wants to look back at a game that has already ended — to show a player their stats, review foul totals, share a game log, or just remember the score. From the account page's library, they open a finished game and see its final statsheet and full ordered game log, in read-only form. They can navigate back to the library without altering the game record.

**Why this priority**: Review is the "look back" half of the library's value and is described by the user in the request ("review if the game ended and want to see the statsheet or game log"). It is P3 rather than P2 because it is not on the critical path for delivering a working library — an MVP library that only supported continuing in-progress games would still be usable — whereas review is a nice-to-have that hardens the library into a full historical record.

**Independent Test**: In the library, select a finished game and confirm that the app opens a read-only view containing the game's final statsheet and its complete ordered game log, that no edit controls that would change historical results are shown, and that navigating back returns the user to the library with no state changes.

**Acceptance Scenarios**:

1. **Given** the library contains a finished game, **When** the user selects that game, **Then** the app opens a review view showing the game's final statsheet and its complete ordered game log.
2. **Given** the user is on the review view of a finished game, **When** they look for controls that would alter the historical record (add/edit/delete events, adjust score, restart the game), **Then** those controls are not present or are clearly disabled — the review view is read-only.
3. **Given** the user is on the review view, **When** they navigate back to the library, **Then** they land on the library with the same scroll position they had before opening the game, and the reviewed game's record is unchanged.

---

### Edge Cases

- **Account page reached while signed out**: Following an account page bookmark or a deep link while signed out redirects to the login page and, on successful sign-in, returns the user to the account page (per the deep-link behavior established in feature 005).
- **Anonymous local-only session on a device with a saved game**: An anonymous user who has never signed in has no library and does not see an account page — this feature does not surface a library for anonymous sessions. Their locally persisted game (feature 006) is unaffected.
- **Signing in on a device that already has an anonymous in-progress local game**: When an anonymous user signs into an account on a device where feature 006 already holds an unsaved local game, the sign-in flow blocks on a one-time prompt where the user picks "save to my account", "keep local only", or "discard" (per FR-024). The app never silently uploads or silently deletes the local game.
- **Concurrent edits from two devices**: If the same account opens the same in-progress game on two devices at once and both record events, conflict-resolution rules apply — last-write-wins at the individual event level is acceptable for v1, but the system must not corrupt the game record or lose already-committed events.
- **Library sync loss**: If the account page loads but the library cannot be fetched (network error, backend unavailable), the profile section still renders and the library section shows a retryable error rather than blocking the whole page.
- **Very old game record schema**: A saved game record from a much older version of the app may lack fields that newer versions expect. Opening such a game shows what can be shown and clearly notes that it is a legacy record if any part is missing; it does not crash the review view.
- **Empty or malformed input during profile edit**: Validation prevents saving invalid values and preserves other unsaved edits in-place.
- **Field-level save failure**: If the profile save fails (network error, backend rejection), the form remains in its dirty state so the user does not have to re-type; the user sees a clear retryable error.
- **Deleting the currently open game**: If the user is viewing a finished game's review page in one tab and (later) deletes it from the library in another tab or device, reopening the review returns them to the library with an "unavailable" notice rather than a crash.
- **In-progress game that has been untouched for a long time**: An in-progress game the user has not touched in many months still appears in the library as in-progress — this feature does not auto-finish or auto-archive stale games.

## Requirements *(mandatory)*

### Functional Requirements

**Account page — access and gating**

- **FR-001**: The system MUST provide a dedicated account page at a stable, bookmarkable route reachable from an obvious entry point in the app shell (e.g., a profile or account menu control).
- **FR-002**: The account page MUST be treated as an account-gated route (per feature 005): unauthenticated visitors MUST be redirected to the login page and, on successful sign-in, returned to the account page.

**Account information — display and edit**

- **FR-003**: The account page MUST display the email address associated with the user's account.
- **FR-004**: The account page MUST support a user-editable display name field on the user's account profile. Editing the display name is REQUIRED to be supported.
- **FR-005**: The account page MUST support a password change action for the signed-in user. Password change MUST require the user to re-enter their current password before setting a new one, MUST enforce the auth provider's default password policy (matching feature 005's FR-003), and MUST NOT invalidate the user's current session on success (they stay signed in on this device). Email address MUST be shown as read-only in v1 (email change is out of scope for this feature).
- **FR-006**: The system MUST validate edited profile values before saving. Invalid values MUST be rejected inline with a specific error message, and the user's other unsaved edits on the form MUST NOT be lost during that rejection.
- **FR-007**: A successful profile save MUST persist across page reloads and browser restarts, and the updated values MUST be reflected everywhere the app shows the user's identity (e.g., app shell greetings, activity attribution).
- **FR-008**: If a profile save fails (network error, backend rejection), the form MUST remain in its dirty state (edits preserved), and a clear, retryable error message MUST be surfaced.

**Games library — display**

- **FR-009**: The account page MUST present a library section that lists every game saved to the user's account, both in-progress and finished.
- **FR-010**: Each library entry MUST show, at minimum: the two teams (or team labels used at scoring), the date the game was played, a start-time indicator that disambiguates multiple games with the same teams on the same date (e.g., a captured start time or the time the game was created), the current status (in progress / finished), and the score (final score for finished games, current score for in-progress games). There is no user-editable game name in v1 — the library entry label is entirely derived from these fields.
- **FR-011**: The library MUST default to ordering games by most-recent activity first (a game with a more recent edit or event ranks above one whose most recent activity is older), regardless of when it was originally created.
- **FR-012**: When the user has no saved games, the library section MUST show an explicit empty-state message telling the user that games will appear as they are played — rather than showing a blank list or an error.
- **FR-013**: The library MUST remain usable and responsive when it contains a full season's worth of games (target: at least 50 games without noticeable scroll or interaction lag). Games beyond an initial batch MAY be loaded incrementally.
- **FR-014**: If the library cannot be loaded (network error, backend unavailable), the account page MUST still render the profile section and MUST surface a retryable error in the library section — a library failure MUST NOT block the profile view.

**Games library — continue an interrupted game**

- **FR-015**: The user MUST be able to open any in-progress game from the library, and doing so MUST take the user into the live game view for that game with the full committed game record restored (rosters, settings, status, period, clock value, break countdown value, ordered event history, possession, on-court lineup).
- **FR-016**: When an in-progress game is opened from the library, the clock and any active break countdown MUST be in a stopped (paused) state on load — matching the restoration behavior of feature 006. The user MUST explicitly resume the clock.
- **FR-017**: If the user has a locally-persisted in-progress game (feature 006) on the current device and opens a different in-progress game from the library, the system MUST NOT silently discard the local game. It MUST warn the user and provide a choice before any state that has not been saved to the library would be lost.
- **FR-018**: Events recorded while a library game is open MUST be reflected in the library entry's status, score, and most-recent-activity time when the user later returns to the library.

**Games library — review a finished game**

- **FR-019**: The user MUST be able to open any finished game from the library, and doing so MUST take the user into a review view that shows the game's final statsheet and its complete ordered game log.
- **FR-020**: The review view for a finished game MUST be read-only: it MUST NOT expose controls that would alter the historical record (no add/edit/delete of events, no score adjustment, no restart of the game).
- **FR-021**: Returning to the library from the review view MUST restore the library with the same scroll position the user had before opening the game, and MUST NOT change the reviewed game's record.

**Games library — data lifecycle**

- **FR-022**: A game associated with the user's account MUST be added to the library at creation time (as an "in-progress" entry) and MUST be updated as the game progresses, so an interrupted game is recoverable even without an explicit save action by the user.
- **FR-023**: When a game reaches its finished state (per existing end-of-game rules), the library entry MUST reflect that status change and the final score.
- **FR-024**: When a user signs into an account on a device that already holds an anonymous, locally-persisted in-progress game (feature 006), the system MUST present a one-time prompt as part of the sign-in flow offering three explicit choices: (a) save the local in-progress game to the account's library, (b) keep it local only (do not add it to the library — anonymous behavior continues on that game), or (c) discard it. The sign-in flow MUST NOT complete until the user makes a choice; the local game MUST NOT be silently uploaded or silently deleted. If the user chooses "save to library", the game becomes a Saved Game Record on the account and the local copy is removed from local-only status. If the user chooses "keep local", the local game remains under feature 006's rules and is never surfaced in the library. If the user chooses "discard", the local record is cleared.
- **FR-025**: The user MUST be able to delete any game from their library. Deletion MUST require an explicit confirmation step for both in-progress and finished games, and MUST be irreversible (no separate undo affordance in v1). The confirmation for an **in-progress** game MUST explicitly surface how much work will be lost — at minimum the count of recorded events, and MAY also include the current period or score — so the user cannot delete a live-scoring session without seeing what it contained. The confirmation for a **finished** game uses a standard destructive-action confirmation.

### Key Entities *(include if data involved)*

- **Account Profile**: Extends the User Account established in feature 005 with an editable display name. Holds the email address (read-only in v1 — email change is out of scope) and the editable display name. Password is not stored here (it lives on the User Account per feature 005), but the account page provides a change-password action against it. One profile per user account.
- **Saved Game Record**: A game associated with a specific user account. Holds the full committed game record (teams / rosters, settings, status, current period, current clock value, break countdown value, ordered event history, possession, on-court lineup) plus lifecycle metadata (created-at used as the game's start-time indicator in the library, last-activity-at, status: in-progress vs. finished, final score once finished). No user-editable name field in v1. A user account may own many Saved Game Records.
- **Library View**: The collection of Saved Game Records owned by a single user account, sorted by most-recent activity. Not a stored entity so much as a query result exposed by the account page.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in user can reach the account page from the app shell in 3 clicks or fewer from any main screen.
- **SC-002**: A user can update their display name and see the change persist across a full browser reload in under 15 seconds from opening the account page.
- **SC-003**: A user opening the account page with 50+ saved games sees the library section render its first batch of entries within 2 seconds under normal network conditions.
- **SC-004**: A user with an in-progress game in their library can go from opening the account page to being back inside the live game view (with the game fully restored) in under 30 seconds.
- **SC-005**: A user reviewing a finished game from the library can see the final statsheet and open the game log within 2 seconds of selecting the game.
- **SC-006**: In an end-to-end usability check, at least 90% of signed-in test users successfully find and resume an interrupted game from the library on their first attempt without external guidance.
- **SC-007**: Zero committed game events are lost during normal round-trips (start on device A → save → resume on device B → continue → finish) across a season of test games.
- **SC-008**: The account page is fully usable on a 360px-wide touchscreen device, matching the responsiveness bar of the rest of the app.

## Assumptions

- **Authentication as prerequisite**: This feature assumes feature 005 (User Authentication) is available. The account page and library are account-gated; anonymous local-only sessions do not surface either.
- **Cloud-scoped library**: The library is scoped to the user's account (not to a single device), so a user who signs into the same account on a different device sees the same library. This aligns with feature 005's stated positioning that authentication unlocks sync, save, and multi-device features.
- **Local persistence remains for anonymous sessions**: Feature 006's local `localStorage`-backed persistence remains the mechanism for anonymous, single-device sessions. This feature adds an account-scoped store on top of it; it does not remove local persistence.
- **Signed-in scorekeeping writes through to the library**: While a signed-in user is scoring a game, updates to the committed game record are propagated to the library entry for that game as they happen (see FR-022 / FR-018), so an interrupted game is recoverable without an explicit save action. Local persistence (feature 006) may still be used as a same-device recovery layer, but is not the source of truth for a signed-in game.
- **Game log view already exists; statsheet does not**: The game-log view already exists in the app and is reused (in a read-only mode) by the review view for a finished game (FR-019). The **statsheet** view referenced by FR-019 and SC-005 does **not** yet exist in the app and will be delivered as part of this feature (built on top of the existing `PlayerStats` / `TeamStats` types in the shared domain layer). This feature contributes both the entry point and the statsheet itself, plus the read-only guarantee (FR-020) on the reused game log.
- **Display name is optional at first sign-in**: A newly created account may have no display name until the user sets one on the account page. The app falls back to a default identifier (e.g., the local part of the email address) anywhere a display name is needed until the user sets one.
- **Concurrent multi-device edits — last-write-wins per event**: When the same account opens the same in-progress game on two devices at once, individual event writes reconcile as last-write-wins on the shared record. Explicit multi-device concurrent-edit coordination (locking, real-time collaborative editing) is out of scope for this feature.
- **No sharing across accounts in v1**: A saved game belongs to exactly one user account. Team-scoped or shared libraries (multiple scorekeepers seeing the same game) are out of scope for v1.
- **No import/export in v1**: Exporting a game to a file, importing a game from a file, or bulk-archiving games are out of scope for v1. Deletion (FR-025) is the only lifecycle action beyond automatic in-progress/finished tracking.
- **Password change in scope, password reset out of scope**: An authenticated user can change their own password from within the account page (FR-005). Forgotten-password / reset-via-email flows (i.e., recovering access when the user does not know the current password) remain out of scope, matching feature 005's boundary.
