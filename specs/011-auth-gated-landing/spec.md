# Feature Specification: Auth-Gated App with Public Landing Page

**Feature Branch**: `011-auth-gated-landing`
**Created**: 2026-09-09
**Status**: Draft
**Input**: User description: "The web app should be protected behind a login. The current home page that exists should serve as a landing page with no sidebar for navigation or anything. When the user is logged in, that page should automatically redirect to the games page of the web app. If not, the user will land on that page and when pressing start new game or continue new game, they are redirected to the login page."

## Clarifications

### Session 2026-09-10

- Q: Do internal HTTP endpoints backing the protected pages also need to reject unauthenticated requests as part of this feature? → A: Yes — every internal endpoint that reads or writes game or account data must reject unauthenticated requests; a "pages private, endpoints public" split is not acceptable.
- Q: When a user signs in and their browser holds an anonymous game in local storage from an earlier signed-out session, what should happen to that state? → A: **Superseded by feature 009's existing behavior.** Q2 was originally answered "clear it on sign-in", but during implementation we discovered feature 009 (`packages/web/src/components/auth/AnonymousGameOnSignInPrompt.tsx`) already presents a user-facing modal on sign-in with three explicit choices — **Save to my account** (POST to `/api/games`, then clear local), **Keep local** (leave local untouched), **Discard** (clear local). Silently forcing "always clear" would regress that UX. Resolution: feature 011 defers this decision to the existing 009 prompt; FR-016 below is retained as an INTENT (the account never *silently* inherits an unclaimed game), but the mechanism is the 009 modal, not an unconditional wipe.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Public Landing Page for Signed-Out Visitors (Priority: P1)

A prospective user who has never signed in (or who is signed out) opens the app's root URL. Instead of being dropped into the working scoresheet, they see a clean marketing landing page — the existing hero, product pitch, and feature callouts — with **no navigation sidebar**, no in-app chrome, and no signs of a game already in progress. The two calls-to-action on the page ("New Game" and "Continue Game") do not start or resume any game for a signed-out visitor; instead, clicking either sends them to the login page so they can sign in (or sign up) first.

**Why this priority**: This is the only surface the app presents to strangers. Without it the app has no legitimate public front door, and every direct link to the root URL either dumps guests into a partially-broken experience or leaks the sidebar/in-app UI to a person who cannot use it. Everything else in this feature assumes this landing exists.

**Independent Test**: Sign out. Load `/` in a fresh browser session. Verify the landing hero renders with no sidebar and no navigation shell. Click "New Game" → land on the login page. Go back, click "Continue Game" → land on the login page.

**Acceptance Scenarios**:

1. **Given** a visitor with no active session, **When** they load the root URL, **Then** the landing page renders without the app sidebar or any in-app navigation chrome.
2. **Given** a signed-out visitor on the landing page, **When** they click "New Game", **Then** they are taken to the login page.
3. **Given** a signed-out visitor on the landing page, **When** they click "Continue Game", **Then** they are taken to the login page.
4. **Given** a signed-out visitor on the landing page, **When** they successfully sign in from the resulting login page, **Then** they arrive at the games page (not back on the landing page, and not on a game they never started).

---

### User Story 2 - Signed-In Users Skip the Landing (Priority: P2)

A returning user who is already signed in should never land on the marketing page. When they navigate to the root URL — whether by typing it in, using a bookmark, or clicking the app logo — they are immediately taken to the games page (their library of games), which is the true home of the app for authenticated users.

**Why this priority**: Without this redirect, signed-in users repeatedly see a marketing page that has no operational value to them and whose CTAs (New Game / Continue Game) duplicate functionality the games page already exposes more cleanly. It's a small but constant friction that undermines the sense that they are "inside" the app.

**Independent Test**: Sign in. Type `/` in the address bar. Confirm the browser ends up on the games page. Repeat the test from a bookmark to `/` and by clicking the site logo.

**Acceptance Scenarios**:

1. **Given** a user with an active session, **When** they navigate to the root URL, **Then** they are redirected to the games page without the landing hero flashing in first.
2. **Given** a user whose session has expired without them noticing, **When** they navigate to the root URL, **Then** they see the landing page (not the games page).

---

### User Story 3 - All App Routes Require Sign-In (Priority: P3)

Every part of the app that lets a user start a game, run the scoresheet, view stats, browse the library, or manage the account is behind the login wall. A signed-out person who types or is linked to any such URL directly is sent to the login page first, and after signing in they are returned to the URL they originally requested.

**Why this priority**: Auth-gating the visible entry points (root, "New Game", "Continue Game") is not enough on its own — deep links to game routes must be gated too, or a signed-out user with a bookmark can slip past the front door. This story guarantees the wall is complete no matter how the user tries to enter.

**Independent Test**: Sign out. Paste `/setup`, `/game`, `/games`, `/games/<some-id>`, and `/account` into the address bar one at a time. Each should redirect to the login page with the original URL preserved so that after signing in, the user is delivered to what they originally asked for.

**Acceptance Scenarios**:

1. **Given** a signed-out user, **When** they navigate directly to any protected app URL, **Then** they are redirected to the login page.
2. **Given** a signed-out user who was redirected to the login page from a protected URL, **When** they successfully sign in, **Then** they are taken to the URL they originally requested.
3. **Given** a signed-out user on a protected URL, **When** they are redirected to login, **Then** the login page is rendered without the app sidebar.

---

### Edge Cases

- **Session expires while the user is inside the app**: The next protected navigation or reload sends them to the login page with a `from` value pointing at the route they were on, so signing back in returns them to their place.
- **Signed-in user opens the login page directly**: They are redirected to the games page (no reason to show the sign-in form to someone who is already signed in).
- **User signs out while on a protected page**: They are returned to the public landing page.
- **User has a game in progress in local browser storage but no session**: The landing page does not resurrect or advertise that game. Once the user signs in, the existing feature 009 modal (`AnonymousGameOnSignInPrompt`) prompts them to Save-to-account, Keep-local, or Discard the anonymous game — so the newly authenticated session never silently inherits a game the current account never claimed.
- **Direct deep-link into a game the user does not own or that does not exist**: After sign-in, ownership and existence checks in the destination route take over — the routing behavior here only guarantees delivery to the requested URL, not access to it.
- **Bookmarks or search-engine links to the pre-change root URL**: These continue to work; signed-out visitors see the landing, signed-in visitors are redirected onward to the games page.
- **Public routes needed for auth itself** (login, sign-up, password reset, and any linked callback pages) remain reachable without a session and are also rendered without the app sidebar.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The root URL MUST render a public landing page for any visitor without an active session.
- **FR-002**: The public landing page MUST NOT display the app navigation sidebar or any authenticated in-app chrome.
- **FR-003**: The public landing page MUST preserve the current marketing content — hero, tagline, and feature callouts — as the point of transition from "old home page" to "landing page" (no scope creep into new marketing copy in this feature).
- **FR-004**: When a signed-out visitor activates the "New Game" call-to-action on the landing page, the system MUST route them to the login page instead of starting a new game or clearing any persisted game state.
- **FR-005**: When a signed-out visitor activates the "Continue Game" call-to-action on the landing page, the system MUST route them to the login page instead of opening the game console.
- **FR-006**: The root URL MUST redirect authenticated users to the games page.
- **FR-007**: The redirect from the root URL to the games page for authenticated users MUST occur before the landing hero becomes visible (no flash of landing content for signed-in users).
- **FR-008**: The system MUST require authentication for every route — both user-facing page routes and internal HTTP endpoints — that starts a new game, runs a game, reads or writes game data, displays statistics for a game, displays the scoresheet, lists the user's game library, opens a specific game from the library, or reads or manages the user's account. A "pages private, endpoints public" split is not acceptable: any endpoint that backs a protected page MUST itself reject unauthenticated requests.
- **FR-009**: When an unauthenticated user requests a protected route directly, the system MUST redirect them to the login page and preserve the original requested URL so that a successful sign-in returns them to that URL.
- **FR-010**: After a signed-out visitor signs in from a login redirect triggered by clicking a landing-page CTA, the system MUST deliver them to the games page (the app's home for authenticated users).
- **FR-011**: The login page and any other pre-authentication pages required to complete sign-in (sign-up, password reset, verification/callback landings) MUST remain accessible without a session and MUST NOT display the app sidebar.
- **FR-012**: An authenticated user who requests the login page directly MUST be redirected to the games page.
- **FR-013**: A user who signs out MUST be returned to the public landing page.
- **FR-014**: The set of routes required for authentication (login, sign-up, password reset, verification/callback landings) and the public landing page itself MUST be the only routes reachable without a session; every other current or future in-app route or backing endpoint is protected by default.
- **FR-015**: An unauthenticated request to any internal HTTP endpoint that reads or writes game or account data MUST be rejected with an unauthorized response rather than served with any game or account content, even if the endpoint would otherwise return successfully.
- **FR-016**: On a successful sign-in, the account MUST NOT silently inherit an unclaimed anonymous game from local browser storage. The existing feature 009 modal (`AnonymousGameOnSignInPrompt`) satisfies this by presenting Save-to-account / Keep-local / Discard as explicit user choices whenever an anonymous game is detected at sign-in time; feature 011 does NOT introduce an unconditional wipe on top of that flow.

### Key Entities

- **Session**: The signal used to decide "landing vs. redirect to games" at the root URL and "allow vs. redirect to login" at protected URLs. This feature does not create or change sessions; it consumes the existing session concept.
- **Landing Page**: A public, sidebar-free presentation of the app's marketing hero and CTAs, served at the root URL only when no session is present.
- **Protected Route**: Any user-facing page OR internal HTTP endpoint that produces, records, reads, or displays game or account information. Access requires a session. For a protected *page*, unauthenticated access is redirected to the login page with the originally requested URL preserved for post-login delivery. For a protected *endpoint*, unauthenticated access is rejected with an unauthorized response instead of being served.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of unauthenticated requests to protected pages (including root-URL requests, direct deep links, and CTA clicks from the landing page) are redirected to the login page, and 100% of unauthenticated requests to protected internal endpoints are rejected with an unauthorized response instead of serving game or account content.
- **SC-002**: 100% of authenticated requests to the root URL are redirected to the games page with no landing content visible to the user in the meantime.
- **SC-003**: After a successful sign-in triggered by an interrupted deep link into a protected route, the user is delivered to that originally-requested URL in 100% of cases where the URL is well-formed and still exists.
- **SC-004**: The landing page renders no navigation sidebar and no authenticated app chrome in every load, measured across the pages a signed-out user can reach (landing and login/sign-up).
- **SC-005**: The landing page's CTAs never mutate persisted game state for a signed-out visitor (verified by clicking each CTA from a signed-out session and confirming no local game record is cleared, created, or modified).
- **SC-006**: An unauthenticated user reaches the login page from the landing page in a single click of either CTA (no intermediate stops).

## Assumptions

- The existing authentication mechanism (email/password sign-in and sign-up, plus session management) is complete and reused as-is. This feature only changes routing and page framing around it, not the auth mechanism itself.
- The games page (`/games`) is the correct destination for authenticated visitors of the root URL. It is the app's authenticated home and already presents both the game library and a "New Game" call-to-action, so signed-in users do not lose access to the actions that the landing-page CTAs represent.
- After a signed-out visitor signs in via a login redirect triggered by a landing-page CTA, delivering them to the games page (rather than opening a fresh setup flow or resuming a specific persisted game) is the preferred behavior. Both landing CTAs converge on the same authenticated home, from which the user then chooses whether to start new or open an existing game.
- The public landing page keeps the current marketing copy and CTA labels ("New Game", "Continue Game"). Any redesign of that content is out of scope for this feature.
- Local, browser-side game state that was previously produced by anonymous use is not surfaced or recovered on the public landing page. On sign-in, feature 009's `AnonymousGameOnSignInPrompt` prompts the user to Save-to-account / Keep-local / Discard (per FR-016) so authenticated sessions never silently inherit an unclaimed game.
- The sidebar remains visible on authenticated app routes exactly as it does today; the change is scoped to hiding it on the landing page and other pre-auth pages.
- The sign-out flow is expected to exist as part of the current authentication surface; this feature only specifies the destination (landing page) it must return the user to.
- All existing protected routes today (games, account) remain protected; this feature also adds protection to the previously-unprotected setup and in-game routes.
