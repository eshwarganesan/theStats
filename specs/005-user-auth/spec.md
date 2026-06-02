# Feature Specification: User Authentication

**Feature Branch**: `005-user-auth`
**Created**: 2026-05-31
**Status**: Draft
**Input**: User description: "Add a login page that authenticates the user. The user must sign up to create a new account or sign in if an account already exists."

## Clarifications

### Session 2026-05-31

- Q: After this feature ships, is signing in required to use any part of theStats, or does an anonymous/local-only mode continue to coexist? → A: Hybrid — anonymous local-only scorekeeping is still supported on the device; authentication unlocks sync, save, and multi-device features only.
- Q: Which password policy should the system enforce on sign-up? → A: Defer to the integrated auth provider's default policy; theStats does not impose its own additional rules.
- Q: How long does a signed-in session stay valid before the user has to sign in again? → A: Long sliding session of ~30 days, refreshed on any authenticated activity, with no idle timeout within an active session.
- Q: What is the failed-sign-in throttle policy? → A: Exponential backoff applied per-account AND per-source-IP that grows with each failure (e.g. 1s → 2s → 4s → 8s, capped at ~30s) and decays after a quiet window; no permanent account lockout.
- Q: What happens to a user account whose email has not been confirmed after a defined waiting period? → A: Auto-delete unconfirmed accounts 7 days after creation, freeing the email address for a new sign-up.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign up for a new account (Priority: P1)

A visitor wants to unlock the account-gated features of theStats (sync, save, and
multi-device access). They reach the login page from a "Sign in / Sign up" control
in the app shell — or directly via the login URL — and are presented with a way to
create an account using their email address and a password. After submitting valid
details, their account is created, they are automatically signed in for their
current session, and they are returned to the screen they were on (or sent to the
main scorekeeping screen if they arrived at the login page directly). A
confirmation email is sent so they can verify ownership of the address.

**Why this priority**: Sign-up is the only way for a user to ever enter the
authenticated mode of the application — without it, no account-gated feature can
exist or be tested. It is the minimum viable slice of authentication.

**Independent Test**: Open the login page in a fresh browser session with no prior
account, complete the sign-up form with a never-before-used email and a valid
password, and verify that (a) an account is created, (b) the user is signed in for
the session, (c) the user is taken to the main scorekeeping screen (or the screen
they were redirected from), and (d) a confirmation email is delivered to the
address used.

**Acceptance Scenarios**:

1. **Given** the user is on the login page with no account, **When** they switch to
   the "Sign up" mode, enter a valid, unused email and a password accepted by the
   auth provider's policy, and submit, **Then** the system creates a new account,
   signs them in for the current session, and navigates them to the main
   scorekeeping screen (or back to whichever screen they were redirected from, if
   any).
2. **Given** the user submits a sign-up form, **When** a confirmation email is
   required, **Then** the system sends a verification email to the submitted address
   and surfaces an in-app banner telling the user to confirm before their next
   sign-in.
3. **Given** the user submits a sign-up form using an email that already has an
   account, **When** they submit, **Then** the system rejects the attempt with a
   clear message ("An account already exists for this email — sign in instead") and
   offers a one-click switch to the sign-in mode.
4. **Given** the user submits a sign-up form with an invalid email format or a
   password rejected by the auth provider's policy, **When** they submit, **Then**
   the system surfaces specific inline validation messages, the account is NOT
   created, and the user can correct the input without losing the other field's
   value.

---

### User Story 2 - Sign in to an existing account (Priority: P2)

A returning user opens theStats. They already have an account from a prior visit
and want to access their account-gated features (sync, save, multi-device). They
reach the login page from the app shell or by being redirected when they attempt
to use an account-gated feature, and they are presented with a way to sign in
using their email and password. After submitting correct credentials, they are
signed in and either returned to whichever screen they were trying to reach or
taken to the main scorekeeping screen. Their session persists across page reloads
and browser restarts until they explicitly sign out or the session expires.

**Why this priority**: Sign-up (P1) is required before any sign-in can succeed, so
sign-in is logically the second slice. Once shipped, it covers the everyday return-
visit path that the majority of sessions will use over time.

**Independent Test**: With a previously created (and confirmed) account, navigate
to the login page, enter the correct email and password, submit, and verify that
the user is signed in, taken to the main scorekeeping screen, and remains signed in
after a full page reload.

**Acceptance Scenarios**:

1. **Given** the user has a confirmed account, **When** they enter the correct email
   and password and submit, **Then** the system signs them in and navigates them to
   the main scorekeeping screen.
2. **Given** the user enters an email/password combination that does not match an
   account, **When** they submit, **Then** the system shows a single generic error
   ("Invalid email or password") that does not reveal whether the email or the
   password was wrong.
3. **Given** the user has an account but has not confirmed their email, **When**
   they submit correct credentials, **Then** the system surfaces a "Please confirm
   your email" message and offers to resend the confirmation email, and does not
   grant access to the main app.
4. **Given** the user has been signed in and has had any authenticated activity
   within the last 30 days, **When** they reload the page or reopen the browser
   tab, **Then** they remain signed in and are taken directly to the main
   scorekeeping screen without seeing the login page.
5. **Given** the system has recorded several consecutive failed sign-in attempts
   for the same email or from the same source IP, **When** the next attempt is
   made before the backoff window for that account/IP has elapsed, **Then** the
   system delays evaluation by the current backoff interval and surfaces a clear
   "too many attempts, please wait" message rather than immediately evaluating
   credentials. The account is NOT permanently locked, and the backoff decays
   once the quiet window passes.

---

### User Story 3 - Sign out of the current session (Priority: P3)

A signed-in user wants to end their session — typically because they are on a
shared device (a courtside tablet passed between scorekeepers) or simply want to
switch accounts. They trigger a sign-out action from within the app. Their session
ends immediately, the app reverts to its anonymous local-only mode, and any
subsequent attempt to reach an account-gated screen will require signing in again.

**Why this priority**: Sign-out is essential for shared-device use but is not on
the critical path to delivering value. Stories 1 and 2 are usable without it for
the very first wave of users on personal devices; sign-out hardens the experience
for the real-world courtside use case the project is built around.

**Independent Test**: While signed in, trigger the sign-out action from the app's
navigation, then attempt to access an account-gated screen by URL, and verify
that the user is redirected back to the login page and that no account-gated
content is shown. Anonymous-accessible screens MUST remain reachable without
signing in.

**Acceptance Scenarios**:

1. **Given** the user is signed in, **When** they trigger the sign-out action,
   **Then** the system ends their session, reverts the app to anonymous local-only
   mode, clears any in-memory authenticated state, and (if the user was on an
   account-gated screen at the time) returns them to the main scorekeeping screen.
2. **Given** the user has just signed out, **When** they attempt to navigate
   directly to any account-gated route (by URL, back button, or bookmark), **Then**
   the system redirects them to the login page. Anonymous-accessible routes load
   normally without redirect.

---

### Edge Cases

- **Already signed in arriving at the login page**: A signed-in user navigating to
  the login page is redirected to the main scorekeeping screen rather than shown
  the form, so they cannot accidentally create or sign into a second account.
- **Email confirmation link opened on a different device**: Clicking the
  confirmation link must mark the account confirmed regardless of which browser /
  device opens it; the user then signs in normally on their working device.
- **Browser autofill of stale credentials**: The form must accept browser-managed
  password autofill and update the password manager prompt when sign-up succeeds.
- **Unauthenticated deep link**: An unauthenticated user opening a deep link to
  an account-gated screen is redirected to the login page; after a successful
  sign-in, they are returned to the originally requested screen. A deep link to
  an anonymous-accessible screen loads normally without any redirect.
- **Concurrent sessions on multiple devices**: The same account may be signed in
  on more than one device at once; signing out on one device does not affect the
  others.
- **Network failure mid-submit**: A sign-up or sign-in attempt that fails due to a
  network error surfaces a retryable error state without creating a duplicate
  account or silently dropping the request.
- **Repeated sign-up attempts with the same email**: Submitting the same address
  twice in quick succession does not create duplicate accounts or send multiple
  confirmation emails beyond a reasonable rate.
- **Typo'd email on first sign-up**: If a user accidentally signs up with a
  mistyped email and never confirms, their account is purged 7 days later
  (FR-016) and the address (the correctly typed one, after a retry) is once
  again available for a clean sign-up. There is no manual "delete unconfirmed
  account" affordance in v1 — the user just waits or retries with the correct
  address.
- **Password strength feedback**: The form surfaces the auth provider's
  password requirements (e.g. minimum length) to the user before submit so
  they are not surprised by a rejection. Real-time validation is not required,
  but the requirements MUST be discoverable on the form itself.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a dedicated login page at a stable, bookmarkable
  route from which both sign-up and sign-in can be initiated.
- **FR-002**: System MUST allow a new visitor to create an account by submitting an
  email address and a password.
- **FR-003**: System MUST validate the email format before creating an account
  and MUST enforce the integrated auth provider's default password policy (no
  additional project-level rules). When the email format is invalid or the
  password is rejected by that policy, the system MUST surface a specific
  inline validation error sourced from (or faithful to) the provider's
  rejection reason — not a generic "invalid input" message.
- **FR-004**: System MUST prevent two accounts from being created with the same
  email address, and MUST tell the user a matching account already exists when a
  duplicate sign-up is attempted.
- **FR-005**: System MUST require the user to confirm ownership of their email
  address (via a confirmation link sent to that address) before granting full
  access to the main application on subsequent sign-ins.
- **FR-006**: System MUST allow a user with an existing, confirmed account to sign
  in by submitting the correct email and password.
- **FR-007**: System MUST return a single generic error message on failed sign-in
  attempts that does not disclose whether the email is registered.
- **FR-008**: System MUST persist a successful sign-in across page reloads and
  browser restarts until the user signs out or the session has been idle (no
  authenticated activity) for 30 consecutive days. Any authenticated activity
  MUST refresh the session; there is no idle timeout WITHIN an active session
  (so a long, low-activity game does not sign the user out mid-game).
- **FR-009**: System MUST redirect any unauthenticated visitor who requests an
  account-gated screen to the login page, and MUST return them to their
  originally requested screen after a successful sign-in. Screens that exist in
  the anonymous local-only mode MUST remain reachable without signing in.
- **FR-010**: System MUST allow a signed-in user to sign out from a clearly
  reachable control inside the app, ending their session immediately.
- **FR-011**: System MUST throttle repeated failed sign-in attempts using
  exponential backoff applied independently per target account and per source
  IP. The delay between accepted attempts MUST grow with each consecutive
  failure (e.g. ~1s → 2s → 4s → 8s, capped near 30s) and MUST decay back to
  zero after a quiet window with no failures. The system MUST NOT permanently
  lock an account on the basis of failed sign-in attempts (no lockout-based
  denial-of-service vector). The same backoff scheme MUST apply to repeated
  sign-up attempts from the same source to prevent email-bombing.
- **FR-012**: System MUST send a confirmation email containing a one-time
  verification link when an account is first created, and MUST allow the user to
  request a resend of that email if it is lost.
- **FR-013**: System MUST store user credentials in a way that does not expose
  passwords in plaintext anywhere in the system (storage, logs, or error
  messages).
- **FR-014**: System MUST prevent the login page itself from being shown to an
  already-signed-in user — redirecting them into the application instead.
- **FR-015**: System MUST not leak account-existence information through error
  messages, response timing differences, or password-reset triggers (when reset
  is added later).
- **FR-016**: System MUST automatically delete unconfirmed accounts 7 days after
  their creation. After deletion, the email address MUST be re-usable for a
  fresh sign-up as if the prior attempt had never occurred. This automatic
  retention rule MUST NOT remove confirmed accounts under any circumstances.

### Key Entities *(include if data involved)*

- **User Account**: Represents a person authorized to use theStats'
  account-gated features. Holds the email address (unique among current
  accounts), an irreversibly hashed password, a confirmation status
  (unconfirmed / confirmed), the time the account was created, and the time of
  the most recent sign-in. An unconfirmed account is automatically deleted 7
  days after its creation (FR-016); a confirmed account is retained
  indefinitely until the user (or a future account-deletion feature) removes
  it.
- **Session**: Represents an authenticated browser/device for a specific user
  account. Holds a reference to the user account, an issue time, and an expiry
  time. A user may have multiple concurrent sessions across devices.
- **Confirmation Token**: A short-lived, single-use token bound to a User Account
  and delivered via email, used to confirm ownership of the email address.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor can create an account and reach the main
  scorekeeping screen in under 60 seconds (excluding time spent confirming the
  email).
- **SC-002**: A returning user with a confirmed account can sign in and reach the
  main scorekeeping screen in under 15 seconds.
- **SC-003**: 100% of requests to account-gated screens from an unauthenticated
  browser are blocked and redirected to the login page. Requests to
  anonymous-accessible screens are never redirected.
- **SC-004**: At least 95% of sign-up attempts that begin with the email field
  result in a created account (i.e., the form does not lose users to confusion or
  validation friction).
- **SC-005**: Fewer than 1% of valid sign-in attempts (correct credentials,
  confirmed account, normal network conditions) fail.
- **SC-006**: The login page is fully usable on a 360px-wide touchscreen device,
  matching the responsiveness bar already required of the rest of the app.
- **SC-007**: Generic-error messaging is consistent enough that an external
  observer cannot determine whether a tried email is registered by comparing
  error responses across attempts.

## Assumptions

- **Authentication method**: Email + password is the only supported authentication
  method for v1. OAuth/social sign-in, magic links, passkeys, and multi-factor
  authentication are explicitly out of scope and may be added as separate
  features later.
- **Email confirmation required**: New accounts must confirm their email address
  before being granted full access on subsequent sign-ins. This matches standard
  practice and is the safer default for a system that stores game data.
- **Hybrid auth mode**: Anonymous, local-only scorekeeping remains available
  without an account; authentication unlocks the account-gated features (sync,
  save, multi-device, access to past games and any other cloud-backed
  capabilities introduced in future features). Anonymous-accessible screens are
  always reachable without signing in; account-gated routes redirect
  unauthenticated visitors to the login page. The login page itself is reachable
  by any visitor at any time. The specific catalog of which screens are
  account-gated vs. anonymous-accessible is established as those screens are
  added (this feature provides the gate mechanism, not the catalog).
- **Login route**: The login page lives at a single dedicated route (e.g.
  `/login`). Both sign-up and sign-in are presented on this same page, with the
  user able to toggle between the two modes.
- **Post-sign-in landing**: After a successful sign-in or sign-up, users land on
  the existing main scorekeeping entry screen unless they were redirected from a
  deep link, in which case they land on that originally requested screen.
- **Password reset out of scope**: "Forgot password" / password reset flows are
  out of scope for this feature and will be addressed in a separate follow-up
  feature. The spec still requires (FR-015) that whatever reset mechanism ships
  later must not leak account existence.
- **Account profile management out of scope**: Display name, avatar, account
  deletion, and email change are out of scope for v1. The account stores only the
  email and authentication-related fields.
- **Multi-device sessions allowed**: The same account may be signed in on more
  than one device at once. Signing out on one device does not invalidate sessions
  on other devices.
- **No organizational accounts**: A user account represents a single person, not
  a team, league, or organization. Multi-tenant concepts are not part of this
  feature.
- **Email delivery**: A working transactional email channel is available for
  confirmation messages. The specific provider is an implementation concern, not
  a spec concern.
