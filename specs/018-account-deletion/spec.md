# Feature Specification: Account Deletion

**Feature Branch**: `018-account-deletion`  
**Created**: 2026-11-09  
**Status**: Draft  
**Input**: User description: "Add account deletion feature on the account page. When account is deleted, user is signed out and redirected to landing page."

## Clarifications

### Session 2026-11-09

- Q: Should the iOS app get account deletion in this feature, and if so, how? → A: Yes, inside the app. The iOS app gets an account screen with the "Delete account" action. It doesn't send people to the web account page, and iOS isn't left for a later feature.
- Q: What should happen to the failed-attempt records stored under the deleted account's email address? → A: Keep them. They're security records, not account data, so the email address stays in them indefinitely.
- Q: Should theStats show a short notice saying what happened after an account is deleted? → A: Yes, on both kinds of device. The deleting device's start screen confirms "Your account has been deleted", and other devices say they were signed out because the account was deleted.
- Q: What should a signed-in user who doesn't know their password be able to do? → A: Nothing new in this feature. Deletion keeps requiring the password. Password reset comes in a separate feature, and the spec notes the limitation.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Delete my account from the account page (Priority: P1)

A signed-in user who no longer wants to use theStats opens the account page in the web app and chooses to delete their account.

Before anything happens, theStats explains what deletion means. The account, its profile and every saved game, finished or in progress, are removed permanently and can't be recovered.

The user re-enters their password to confirm. theStats then deletes the account and everything stored with it, signs the user out and shows the public landing page, with a notice that the account has been deleted. The old email and password no longer sign in.

**Why this priority**: This is the feature itself. People must be able to leave theStats and have their data removed. Without this story, nothing else here has value.

**Independent Test**:
1. Create an account and save a game.
2. Delete the account from the account page.
3. Check that the landing page appears with a notice that the account was deleted.
4. Check that signing in with the old email and password fails.
5. Check that the saved game can no longer be opened.

**Acceptance Scenarios**:

1. **Given** a signed-in user on the account page, **When** the page loads, **Then** it shows a "Delete account" action that is set apart from the other account settings and marked as permanent.
2. **Given** the user chooses to delete their account, **When** the confirmation step appears, **Then** it says that the account, profile and all saved games (including any game in progress) will be permanently deleted, and it asks for the current password.
3. **Given** the confirmation step, **When** the user enters the correct password and confirms, **Then** the account and all its data are deleted, the user is signed out, and the public landing page is shown with a notice that the account has been deleted.
4. **Given** a deleted account, **When** anyone tries to sign in with its email and password, **Then** sign-in fails with the same message shown for an email that has no account.
5. **Given** a deleted account, **When** someone opens a link to one of its saved games or to the account page, **Then** they are asked to sign in, and no data from the deleted account is shown.

---

### User Story 2 - Delete my account in the iOS app (Priority: P2)

A scorekeeper who uses theStats on an iPad or iPhone deletes their account without leaving the app.

One tap from the home screen opens their account screen. It shows which account is signed in and the same "Delete account" action as the web app. The confirmation step gives the same explanation and asks for the password.

The app then deletes the account and everything stored with it, signs the user out, clears the account's games from the device and shows the sign-in screen, with a notice that the account has been deleted.

**Why this priority**: The App Store requires apps that let people create an account to also let them delete it inside the app, so the iOS app can't be submitted without this story. Only the way in is new: what gets deleted, and how, is the same as in Story 1.

**Independent Test**:
1. In the iOS app, sign in to an account that has a finished game saved, and leave another game in progress on the device.
2. Delete the account from the app's account screen.
3. Check that the sign-in screen appears with a notice that the account was deleted.
4. Check that signing in with the old email and password fails, in the app and on the web.
5. Sign up again in the app with the same email, and check that neither game appears.

**Acceptance Scenarios**:

1. **Given** a signed-in user on the iOS app's home screen, **When** they look for their account, **Then** one tap opens an account screen. It shows which account is signed in and a "Delete account" action that is set apart and marked as permanent.
2. **Given** the user chooses to delete their account in the app, **When** the confirmation step appears, **Then** it gives the same explanation as the web app and asks for the current password.
3. **Given** the confirmation step, **When** the user enters the correct password and confirms, **Then** the account and all its data are deleted, the user is signed out, the device no longer holds any of the account's games, and the sign-in screen is shown with a notice that the account has been deleted.
4. **Given** the device held a game in progress or changes not yet saved, **When** the account is deleted, **Then** they are discarded, not saved. They don't come back for anyone who signs in on that device later, including someone who signs up again with the same email.
5. **Given** the confirmation step is open on an iPhone in landscape, **When** the on-screen keyboard appears for the password, **Then** the password field and the confirm and cancel actions can still be reached.

---

### User Story 3 - Back out or make a mistake safely (Priority: P3)

On the web or in the iOS app, a user must not lose anything if they open the delete option by accident, change their mind or mistype their password:
- Cancelling leaves everything as it was.
- A wrong password is refused with a clear message.
- If deletion can't be finished, the user is told so and stays signed in. A server failure says it didn't happen; a dropped connection says to try again.

**Why this priority**: Deletion can't be undone, so the protections around it matter almost as much as the deletion itself. A delete action that fires by accident, or stops halfway, would be worse than having none. Stories 1 and 2 already ask for the password before anything is deleted. This story comes after them so that each protection is built and checked on the web and in the iOS app at once.

**Independent Test**: Try each of these in turn, on the web and then in the iOS app: open the confirmation step and cancel, enter a wrong password, and make the deletion request fail. After each one, check that the user is still signed in on the account page or screen, and that their profile and saved games are intact.

**Acceptance Scenarios**:

1. **Given** the confirmation step is open, **When** the user cancels or closes it, **Then** nothing is deleted and they stay signed in on the account page or screen.
2. **Given** the confirmation step, **When** the user enters a wrong password and confirms, **Then** deletion is refused with a message saying the password is incorrect, nothing is deleted, and they can try again.
3. **Given** repeated wrong passwords, **When** the attempt limit is reached, **Then** further attempts are blocked for a while and the user is told how long to wait, the same way repeated failed sign-ins are handled.
4. **Given** the user confirms with the correct password, **When** deletion fails because of a server problem, **Then** the user is told deletion didn't happen, nothing is deleted, and they stay signed in and can retry. If the connection drops instead, they're told theStats couldn't be reached and to try again, and the retry finishes the deletion or confirms the account is already gone.
5. **Given** the user confirms twice quickly (a double click or double tap), **When** deletion runs, **Then** the account is deleted once and the user sees a single outcome.

---

### User Story 4 - Other signed-in devices stop using the deleted account (Priority: P4)

Scorekeepers often use more than one device, such as the web app on a laptop and the iPad app courtside. After the account is deleted on one device, every other device signed in to it can no longer load or save its games.

The next time one of those devices contacts theStats, it signs the user out, clears the deleted account's games it was holding, and returns to its signed-out start screen with a notice that the user was signed out because the account was deleted. This happens without errors, and without showing the deleted account's data.

**Why this priority**: Stories 1 and 2 already cover the device the user deletes from. Other devices are a rarer case and only need to fail safely, but a deleted account must not keep working, or stay visible, somewhere else.

**Independent Test**:
1. Sign in to the same account in two browsers, or in a browser and the iOS app.
2. Delete the account in one of them.
3. In the other, try to open the games list or record a play.
4. Check that it signs out to its start screen, says the account was deleted, and no longer shows the account's games.

**Acceptance Scenarios**:

1. **Given** the account is signed in on a second device, **When** the account is deleted on the first, **Then** the second device's next attempt to load or save the account's data is refused.
2. **Given** that refusal, **When** the second device receives it, **Then** it does all of the following:
   - signs the user out
   - clears the deleted account's game data from the device, including any game in progress and changes not yet saved
   - shows its signed-out start screen: the landing page on web, or the sign-in screen in the iOS app
   - tells the user they were signed out because the account was deleted
3. **Given** the second device had changes that weren't saved yet, **When** it finds the account deleted, **Then** it discards them instead of retrying, because there is no account left to save them to.

---

### Edge Cases

- **Game in progress on the deleting device**: The confirmation step mentions it. Deletion removes it with everything else, and the device's own copy is cleared.
- **Changes not yet saved**: Deleting the account discards them. Nothing is saved for a deleted account. This is different from signing out of the iOS app, which keeps unsaved changes on the device so they can be saved when the same person signs back in.
- **No connection**: Deletion needs a connection, which a courtside iPad may not have. Without one, the user is told theStats couldn't be reached and to try again, and nothing changes.
- **Connection lost after confirming**: Deletion is all-or-nothing. If the user can't tell whether it finished, signing in again tells them:
  - If sign-in works, the account still exists.
  - If it gives the no-account message, the account was deleted.
- **iOS app closed during deletion**: If deletion finished, the app finds the account gone the next time it contacts theStats, and signs out as in User Story 4. If it didn't finish, the user is still signed in and everything is intact.
- **Same email signs up again**: This is allowed. The new account starts empty, and nothing from the deleted account reappears.
- **Shared computer or iPad**: After deletion, the browser or iPad keeps no sign-in and no game data from the deleted account. The next person to use it sees the signed-out start screen. If a deletion notice is still showing, it doesn't name the account.
- **Another tab in the same browser**: That tab is signed out at once and shows the landing page with the same notice, so it can't save the deleted account's game back to the device.
- **A device left signed in**: Because deletion requires the password, someone who picks up a signed-in device can't delete the account without knowing it.
- **Forgotten password**: A signed-in user who doesn't know their password can't delete their account. They need a password reset first, and this feature doesn't add one.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The web app's account page MUST offer signed-in users a "Delete account" action that is visually separated from the other account settings and labeled as permanent.
- **FR-002**: Before deleting, the system MUST show a confirmation step stating that the account, its profile and all saved games (including any game in progress) will be permanently deleted and can't be recovered.
- **FR-003**: The confirmation step MUST require the user's current password. The system MUST refuse to delete the account if the password is wrong.
- **FR-004**: Failed password confirmations MUST be limited the same way failed sign-ins are, including telling the user how long to wait before trying again.
- **FR-005**: When deletion is confirmed, the system MUST permanently delete the account and all of its account data:
  - the sign-in credentials
  - the profile
  - every saved game, with its rosters, settings and play-by-play
- **FR-006**: Deletion MUST be all-or-nothing. Either everything listed in FR-005 is deleted, or none of it is and the account keeps working.
- **FR-007**: After a successful deletion, the system MUST sign the user out on the device they deleted from and show that device's signed-out start screen with a notice confirming that the account has been deleted. The start screen is the public landing page on the web, or the sign-in screen in the iOS app.
- **FR-008**: After a successful deletion, the device the user deleted from MUST hold no sign-in and no game data belonging to the deleted account. This includes any game in progress and any changes not yet saved.
- **FR-009**: Every other browser or device signed in to the deleted account MUST lose access. Its next attempt to load or save the account's data MUST be refused. That device MUST then sign the user out, clear the account's game data it holds, and show its signed-out start screen with a notice saying the user was signed out because the account was deleted.
- **FR-010**: Signing in with a deleted account's email and password MUST fail with the same message as an email that has no account, so the response doesn't reveal that the account ever existed.
- **FR-011**: A deleted account's email address MUST be available for a new account, and that new account MUST start with no data from the deleted one.
- **FR-012**: Cancelling or closing the confirmation step MUST leave the account and its data untouched, with the user still signed in.
- **FR-013**: If deletion can't be completed, the system MUST tell the user it didn't happen, leave all data in place, and keep them signed in so they can retry. If theStats can't be reached, the system MUST say so and ask the user to try again. It can't tell whether a request that lost its connection got through, so the retry completes the deletion or confirms it already happened.
- **FR-014**: Confirming the same deletion more than once, for example with a double click or a retry, MUST result in a single deletion and show the user a single outcome.
- **FR-015**: The delete action and confirmation step MUST work with a screen reader, on the web and in the iOS app. On the web they MUST also be usable with a keyboard alone and on screens as narrow as a small phone. In the iOS app they MUST stay usable in landscape on the smallest supported iPhone, including while the on-screen keyboard is showing.
- **FR-016**: The iOS app MUST let signed-in users delete their account without leaving the app. One tap from its home screen MUST open an account screen that shows which account is signed in and offers the "Delete account" action described in FR-001. Deleting from the iOS app MUST meet the same requirements as deleting on the web (FR-002 to FR-015).
- **FR-017**: Deletion MUST leave failed-attempt records in place, including those stored under the deleted account's email address.
- **FR-018**: The notices in FR-007 and FR-009 MUST NOT show the account's email address or any other data from it.

### Key Entities *(include if feature involves data)*

- **Account**: A person's sign-in identity: their email address and password. Deleted.
- **Profile**: The details shown for the account, currently the display name. Deleted with the account.
- **Saved game**: A game in the account's library, finished or in progress, with its teams, rosters, settings and play-by-play. All of the account's saved games are deleted with it. Each game belongs to exactly one account, so no one else's games are affected.
- **Device copy of a game**: The game a signed-in device holds locally, including changes not yet saved to the account. It is cleared on the deleting device, and on any other device when that device finds the account gone.
- **Failed-attempt records**: Records kept for each email address and network address that has tried to sign in. They limit repeated wrong passwords at sign-in and when confirming a deletion. They are security records, not account data. Deletion leaves them in place, and the record under the deleted account's email address is kept indefinitely. The limits then keep working for that address just as they do for an address that never had an account.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the web and in the iOS app, a user can go from opening the account page or screen to seeing the signed-out start screen, with their account deleted, in under 1 minute.
- **SC-002**: Immediately after deletion, none of the account's profile or saved games can be reached by anyone. That includes signing in again, and registering the same email as a new account.
- **SC-003**: No account is ever deleted by cancelling, by a wrong password or by a failed attempt. Each of these paths leaves all of the account's data in place.
- **SC-004**: Other devices signed in to a deleted account lose access to its data the next time they contact theStats. They return to their signed-out start screen with a notice saying why, and without an error message or a crash.
- **SC-005**: After deletion, reopening theStats on the device that was used shows its signed-out start screen (the landing page on the web, the sign-in screen in the iOS app), with no trace of the deleted account's games.
- **SC-006**: On the web, the whole deletion flow can be completed with a keyboard alone. On the web and in the iOS app, a screen reader announces every step.
- **SC-007**: An iOS user can start and finish deleting their account entirely inside the app, and reaches the "Delete account" action in one tap from the home screen.

## Assumptions

- **Immediate and permanent**: Deletion takes effect at once, with no grace period and no way to restore the account. This is the simplest choice that fully removes the data. It also meets app store rules, which ask for deletion rather than deactivation.
- **Password confirmation**: Re-entering the current password is the confirmation. This matches the existing change-password flow, which also asks for it. Every account signs in with an email and password, so every user has one to enter.
- **One owner per game**: Each saved game belongs to a single account and nothing is shared, so deleting one account changes no one else's data.
- **Landing page**: "Landing page" means the existing public landing page (feature 011). Signing out already returns users there.
- **iOS start screen**: The iOS app has no landing page. Its signed-out start screen is the sign-in screen, so deleting in the app ends there, as signing out already does.
- **Deleting inside the iOS app**: The App Store asks apps that let people sign up to let them delete their account from inside the app. Deleting in the app, rather than on the website, also saves iOS users from signing in again on the web.
- **No confirmation email**: theStats doesn't email the user after deletion. This can be added later.
- **Out of scope**:
  - Downloading your data before deleting the account.
  - An administrator deleting an account on someone's behalf.
  - The other account settings in the iOS app, such as the display name and changing the password. They stay on the web.
  - Resetting a forgotten password. It comes in a separate feature (see Edge Cases).
- **Backups**: Copies of deleted data in the hosting provider's routine backups expire on the provider's normal schedule. Restoring from those backups isn't part of normal operation.
- **iOS devices count as other devices**: An iOS device signed in to an account that was deleted somewhere else, on the web or on another iOS device, behaves as FR-009 describes.
