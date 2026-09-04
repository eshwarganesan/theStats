# Feature Specification: Games Page (Sidebar Library + New Game Entry)

**Feature Branch**: `010-games-library`
**Created**: 2026-09-01
**Status**: Draft
**Input**: User description: "Create a page called Games that will list all the games saved onto the user's account as well as provide the option to set up a new game. The page should be accessible from the sidebar as one of the menu items"

## Clarifications

### Session 2026-09-01

- Q: What is the relationship between the new Games page and feature 009's library section on the account page? → A: The Games page **replaces** feature 009's library section. The account page is reduced to profile-only (email, display name, password change); every library capability (list, ordering, empty state, continue in-progress, review finished, per-game management as defined by 009) re-homes to the Games page. There is no coexistence period.
- Q: Where does the Games page live in the URL tree? → A: Top-level. The list is at `/games`; the per-game detail routes are at `/games/[id]`. The old per-game routes beneath the account page (`/account/games/[id]`) issue a permanent redirect to the equivalent `/games/[id]` so existing bookmarks and shared links continue to resolve to the same game.
- Q: Should in-progress and finished games be visually grouped/sectioned on the Games page, or interleaved? → A: **Single interleaved list** ordered by most-recent activity. Each row carries a per-row status indicator ("In progress" or "Finished"). No status sections, no tabs, no status filter in v1.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open the Games page from the sidebar and see saved games (Priority: P1)

A signed-in user opens the app and, from the app-shell sidebar, clicks a top-level nav item labeled "Games". They land on a dedicated Games page that lists every game associated with their account. Each row shows enough information to recognize the game at a glance — the two teams (or team labels), the date it was played, its current status (in progress vs. finished), and the score (final for finished games, current for in-progress). Games are ordered by most recent activity first. If they have no games yet, the page shows an empty-state message explaining that games will appear here as they play them.

**Why this priority**: This is the core deliverable — a dedicated, sidebar-reachable page whose purpose is to answer "what games do I have?" Without it, the user's own body of work is not surfaced anywhere they can navigate to on demand. Everything else in this feature (starting a new game, opening a game to continue or review) is either a shortcut into an existing flow or a re-entry into a game view — so the list itself is the smallest independently shippable slice.

**Independent Test**: Sign in as a user who has one or more prior games (a mix of in-progress and finished). Click the "Games" item in the sidebar. Verify that the page shows every one of those games with correct team labels, date, status, and score (final for finished / current for in-progress), and that the most recently active game appears first.

**Acceptance Scenarios**:

1. **Given** the user is signed in and has one or more games saved to their account, **When** they click the "Games" item in the sidebar, **Then** the app navigates to the Games page and displays each of those games with team labels, date, status (in progress / finished), and the appropriate score.
2. **Given** the user has no games saved to their account, **When** they open the Games page, **Then** the page shows an empty-state message explaining that games will appear here as they are played, rather than an empty list or an error, and the new-game entry point (User Story 2) is still prominently available.
3. **Given** the user has multiple saved games, **When** the list is rendered, **Then** games are ordered by most-recent activity first (a game with newer edits ranks above an older one, regardless of when it was first created), matching the ordering already used on the account page's library.
4. **Given** the library contains many games (e.g., a full season's worth — 50+), **When** the Games page is displayed, **Then** the page remains responsive to scroll and interaction; games beyond a reasonable initial batch may be loaded incrementally rather than all at once.
5. **Given** the sidebar is in its collapsed rail state, **When** the user views the sidebar, **Then** the "Games" item is still visible as an icon-only affordance with an accessible label, and clicking it navigates to the Games page just like the expanded item does.

---

### User Story 2 - Start a new game from the Games page (Priority: P1)

From the Games page, a signed-in user can start setting up a new game via a prominent, always-visible entry point (e.g., a "New game" button). Clicking it takes them into the existing game-setup flow. This entry point is present whether the list has entries or is empty — for an empty list, it doubles as the primary call to action on the empty state.

**Why this priority**: The user explicitly asked for the Games page to "provide the option to set up a new game", so the CTA is a promised part of the page — not an add-on. It is P1 alongside the list because a Games page that shows only history and offers no path forward would fail the user's own description of what the page is for. It is independent from the list story: even before any games exist, a Games page whose only visible content is an empty state and a "New game" button is a coherent, shippable page.

**Independent Test**: Sign in as a brand-new user with no games. Open the Games page. Verify that a "New game" entry point is prominently visible. Click it and verify that the app opens the existing game-setup flow. Complete setup and confirm that on returning to the Games page, the just-created game now appears in the list.

**Acceptance Scenarios**:

1. **Given** the user is on the Games page, **When** they look for a way to start a new game, **Then** a "New game" (or equivalently labeled) entry point is visible without scrolling and remains accessible whether the games list is empty or populated.
2. **Given** the user is on the Games page and clicks the "New game" entry point, **When** the click is registered, **Then** the app opens the existing game-setup flow with the same behavior a new-game entry point elsewhere in the app would produce (rosters, settings, etc.).
3. **Given** the user has no games and lands on the empty state, **When** the empty state is shown, **Then** the "New game" entry point is featured as the empty state's primary call to action so the user has an obvious next step.
4. **Given** the user has completed the game-setup flow after entering it from the Games page, **When** they return to the Games page, **Then** the newly created game appears in the list per Story 1's ordering rules.

---

### User Story 3 - Open a saved game from the Games page (Priority: P2)

From the Games page's list, a user selects a game. If it is in progress, the app opens the live game view with full state restored (rosters, settings, current period, current clock value, event history, possession, on-court lineup) — the same restoration guarantees feature 006 gives on a local refresh and feature 009 gives for account-sourced games, just with the entry point now being the Games page. If the game is finished, the app opens the read-only review view containing the game's final statsheet and full ordered game log — the same review view established by feature 009.

**Why this priority**: A list of games you cannot open is not useful, so this story is essential to the feature's overall value. It is P2 rather than P1 because the underlying capabilities — restoring an in-progress game, showing a finished game's statsheet and log — already exist in features 006 and 009; this story only extends the entry point. Someone could ship US1 + US2 alone (list + new-game CTA) and it would still be a coherent, if incomplete, feature.

**Independent Test**: On device A, sign in and start a game, record several events, and abandon the tab without finishing. On device B (or a fresh browser session on device A), sign in with the same account, open the Games page from the sidebar, select the in-progress game, and verify that the live game view opens with the same rosters, settings, period, clock value, event history, possession, and on-court lineup, with the clock paused per feature 006's rules. Separately, from the same Games page, select a finished game and verify that the read-only review view opens with the correct final statsheet and game log.

**Acceptance Scenarios**:

1. **Given** the Games page shows an in-progress game, **When** the user selects it, **Then** the app opens the live game view with the full committed game record restored, matching the restoration guarantees defined in features 006 and 009 (rosters, settings, status, period, clock value, break countdown value, ordered event history, possession, on-court lineup).
2. **Given** the Games page shows a finished game, **When** the user selects it, **Then** the app opens the read-only review view with the game's final statsheet and complete ordered game log, matching the review view defined in feature 009 (no controls that would alter the historical record).
3. **Given** the user opens a game from the Games page and later navigates back (browser back, sidebar Games item, or an in-view back control), **When** they land on the Games page again, **Then** any events they recorded during the visit are reflected in that game's list entry status/score/last-activity time.
4. **Given** the user tries to open a game that has been deleted from another device or session, **When** they select it, **Then** the app returns them to the Games page with a clear "unavailable" notice rather than crashing.

---

### Edge Cases

- **Signed-out visitor clicks the sidebar "Games" item**: The Games page is an account-gated route (matching feature 009's account page and library). A signed-out user who clicks Games — or follows a bookmark / deep link to the Games URL — is redirected to the login page and, on successful sign-in, returned to the Games page (per feature 005's deep-link behavior).
- **Sidebar "Games" item when signed out**: The sidebar's Games item is still visible when signed out (the sidebar is a stable app-shell surface); clicking it triggers the redirect above rather than being hidden. This preserves a consistent sidebar layout for anonymous and authenticated users alike.
- **Games page load succeeds but the games list fails to fetch**: The page still renders (header, sidebar, new-game CTA) and the list section shows a retryable error rather than a blank page.
- **Deep link to a specific game URL for a game the user does not own**: The app treats this as "not found" and returns the user to the Games page with a notice, rather than exposing any information about the other user's game.
- **Sidebar item on very narrow viewports / collapsed rail**: The Games item must remain reachable in both the collapsed rail and expanded overlay states of the sidebar established in feature 009 — it appears with an icon (and accessible label) in the collapsed rail and with icon + text in the expanded overlay.
- **Anonymous local-only in-progress game (feature 006) exists on the device**: The Games page is account-scoped, so it does not list the anonymous local game as one of its own rows. The existing sign-in prompt from feature 009 (save-to-account / keep-local / discard) continues to be the path by which a local game can be brought into the account library and thus into the Games page.
- **A game is deleted from another tab or device while the Games page is open**: The next interaction with the stale entry (open, delete, etc.) surfaces an "unavailable" notice and refreshes the list, rather than acting on a game that no longer exists.
- **Very old game record schema**: A saved game from a much older app version may lack fields newer versions expect. The Games page still lists it with whatever labels/date/score it can render; opening it follows feature 009's legacy-record behavior.

## Requirements *(mandatory)*

### Functional Requirements

**Sidebar entry point**

- **FR-001**: The app-shell sidebar MUST expose a top-level nav item labeled "Games" that navigates to the Games page. This is the first non-profile nav item in the sidebar.
- **FR-002**: The "Games" sidebar item MUST be reachable and clickable in both the sidebar's collapsed rail state and its expanded overlay state (established in feature 009). In the collapsed rail it MUST render with a recognizable icon and an accessible label; in the expanded overlay it MUST render with icon + text.
- **FR-003**: The "Games" sidebar item MUST indicate the active state when the user is on the Games page (`/games`) or any child route beneath it (`/games/[id]`, i.e., a game opened from the list).
- **FR-004**: The "Games" sidebar item MUST be visible for both signed-in and signed-out users. For signed-out users, activating it MUST route through the account-gated redirect described in FR-006.

**Games page — access and gating**

- **FR-005**: The system MUST provide a dedicated Games page mounted at the top-level route `/games`, separate from the account page. Individual games opened from this page MUST live at `/games/[id]`, mirroring the top-level structure.
- **FR-006**: Both `/games` and `/games/[id]` MUST be treated as account-gated routes (matching the pattern established in feature 005 and applied to the account page in feature 009): unauthenticated visitors MUST be redirected to the login page and, on successful sign-in, returned to the specific route they were trying to reach (`/games` or the exact `/games/[id]`).

**Games list — display**

- **FR-007**: The Games page MUST list every game saved to the signed-in user's account, both in-progress and finished, reading from the same account-scoped saved-games data source introduced by feature 009 (no new persistence layer). This page becomes the single surface where the account's games are listed.
- **FR-008**: For each listed game, the page MUST display, at minimum: the two team labels, the date the game was played, a per-row visual status indicator (e.g., a pill) reading "In progress" or "Finished", and the score (final for finished games, current for in-progress). The status indicator MUST be discoverable at a glance so a user can tell mixed statuses apart in a single scan.
- **FR-009**: The Games list MUST be ordered by most-recent activity first (a game with newer edits ranks above an older one, regardless of when it was first created), preserving feature 009's ordering rule now that this page is the sole library surface. In-progress and finished games MUST be interleaved into this single ordering — the page MUST NOT split them into separate sections, tabs, or filtered views in v1. Status differentiation is carried only by the per-row indicator defined in FR-008.
- **FR-010**: The Games page MUST show an empty-state message when the user has no saved games. The empty state MUST explain that games will appear here as they are played and MUST include the "New game" entry point (FR-013) as its primary call to action.
- **FR-011**: The Games page MUST render responsively for a large library (e.g., 50+ games); it MAY load games beyond an initial batch incrementally.
- **FR-012**: If the games list cannot be fetched (network error, backend unavailable), the page MUST still render its shell (header, sidebar, "New game" entry point) and the list section MUST show a retryable error rather than blocking the whole page.

**New game entry point**

- **FR-013**: The Games page MUST provide a prominent, always-visible "New game" entry point (button or equivalent affordance). It MUST be reachable without scrolling on standard viewports and MUST be present whether the list is empty or populated.
- **FR-014**: Activating the "New game" entry point MUST open the existing game-setup flow with the same behavior it has when launched from any other entry point (no duplicate or divergent setup surface introduced by this feature).
- **FR-015**: After the user completes game setup entered from the Games page and returns to the Games page, the newly created game MUST appear in the list per FR-009's ordering.

**Opening a game from the list**

- **FR-016**: Selecting an in-progress game from the Games page MUST open the live game view for that game with the full committed game record restored (rosters, settings, status, period, clock value, break countdown value, ordered event history, possession, on-court lineup), matching feature 006's restoration guarantees and feature 009's account-sourced restoration.
- **FR-017**: Selecting a finished game from the Games page MUST open the read-only review view established in feature 009 (final statsheet + complete ordered game log; no controls that would alter the historical record).
- **FR-018**: Returning to the Games page from a game opened out of it MUST show up-to-date status, score, and last-activity information for that game.
- **FR-019**: Selecting a game that has since become unavailable (e.g., deleted from another device or session) MUST return the user to the Games page with a clear "unavailable" notice rather than crashing or showing stale data as if it were live.

**Relationship to feature 009's account-page library**

- **FR-020**: The account page introduced by feature 009 MUST no longer render a games library section. The account page's scope is reduced to profile information only (email display, editable display name, password change). Every library capability defined by feature 009 — the list of saved games, its ordering, empty state, "continue in-progress" entry, "review finished" entry, and any per-game management actions (e.g., deletion with confirmation) — re-homes to the Games page defined here. No games list is rendered inside the account page after this feature ships.
- **FR-021**: The old per-game route beneath the account page (`/account/games/[id]`, established by feature 009) MUST issue a permanent redirect to `/games/[id]` for the same game id, so existing bookmarks and shared links continue to resolve to the same game rather than 404. Any in-app navigation that previously targeted `/account/games/[id]` MUST be updated to target `/games/[id]` directly (no reliance on the redirect for internal navigation).

### Key Entities *(include if feature involves data)*

- **Saved Game**: Represents a game associated with the signed-in user's account. Reuses the entity defined by feature 009 (no new fields or schema changes). Relevant attributes for this feature: team labels, date, status (in progress / finished), score (final or current), last-activity timestamp (used for ordering).
- **Sidebar Nav Item**: Represents a top-level entry in the app-shell sidebar. This feature introduces the first such nav item ("Games"). Relevant attributes: label, icon, target route, visibility rules (signed-in / signed-out), active-state indicator.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in user with existing games can reach their full games list from anywhere in the app in at most two interactions (open sidebar if collapsed → click Games), with no manual URL entry required.
- **SC-002**: A signed-in user with no games can start their first game from the Games page in at most one interaction from the empty state (click "New game").
- **SC-003**: The Games page renders its first meaningful content (shell + either the empty state or the first batch of games) within 2 seconds of navigation on a typical broadband connection for a user with up to 50 saved games.
- **SC-004**: After this feature ships, 100% of a user's account-saved games are reachable from the Games page and 0% are reachable from a library section on the account page (the account page no longer renders one). Any pre-existing bookmark to a game under the old account-page route resolves to the equivalent Games-page destination without a 404.
- **SC-005**: An unauthenticated visitor clicking the sidebar "Games" item, following a Games bookmark, or opening a per-game deep link ends up back at the intended Games destination within one sign-in attempt (login → redirect back), with no dead ends.
- **SC-006**: When the games list fails to load, the page shell (including the "New game" entry point) is still interactive within the same time budget as a successful load (SC-003) — the failure never blocks the user from starting a new game.

## Assumptions

- The Games page reuses the same set of account-scoped saved games that feature 009's library section reads from, with the same restoration and ordering rules; this feature introduces no new persistence, no new game fields, and no new game entity.
- The "New game" entry point on the Games page routes into the *existing* game-setup flow (the same flow reachable from the home page's "New game" button today) — this feature does not introduce a new setup surface.
- The sidebar's collapsed-rail vs. expanded-overlay behavior established in feature 009 remains in force; this feature only adds a nav item into that existing sidebar.
- The Games page is account-gated (like feature 009's account page). Anonymous / signed-out users have no per-account library to show; their locally persisted single game (feature 006) continues to be handled by feature 009's sign-in prompt when they eventually sign in — this feature does not change that flow.
- Opening a game from the Games page uses the same live-game and review views established by features 006 and 009 (no new views for viewing or reviewing games are introduced here).
- Per-game management actions that feature 009 defined (e.g., deletion with confirmation, including the in-progress deletion warning that names the count of recorded events lost) are retained by this feature and re-hosted on the Games page — this feature does not remove or redesign them, but they no longer live on the account page.
- The exact label ("Games") and icon for the sidebar nav item are the design's choice; the label used here is the one the user asked for and is treated as the default.
