# Contract: Delete account UI (web and iOS)

The user-visible elements, wording and states of the delete action and its confirmation step. This covers FR-001 to FR-004, FR-012 to FR-016 and SC-006. The two platforms share the wording; their layouts follow each app's existing patterns.

## Entry point

| | Web | iOS |
|---|---|---|
| Where | Account page (`/account`), last section, below Profile, Password and Sign out | New Account screen, reached from Home's "Account" button next to "Sign out" (one tap) |
| Section | Panel headed **"Delete account"**, styled as a danger zone (danger-coloured border and heading), set apart from the other settings | Same heading, below "Signed in as <email>", in its own danger-styled block |
| Section text | "Permanently delete your account, your profile and all of your saved games. This can't be undone." | Same |
| Action | Button **"Delete account"** (`variant="danger"`) | Button **"Delete account"** (`variant="danger"`) |

## Confirmation step

| | Web | iOS |
|---|---|---|
| Container | Existing `Modal` (native `<dialog>`): focus trap, Esc to close, backdrop click to close | Existing `Sheet` (form sheet on iPad, full screen on iPhone); swipe down or Close to dismiss |
| Title | **"Delete your account?"** | Same |
| Explanation | "This permanently deletes your account, your profile and all of your saved games, including any game in progress. You can't undo this." | Same |
| Password field | Label "Password"; `type="password"`, `autocomplete="current-password"`; focused when the dialog opens | `TextField` label "Password"; `secureTextEntry`, `textContentType="password"`, `autoComplete="current-password"`; return key "Go" submits |
| Buttons | **Cancel** (ghost) and **"Delete account"** (danger). The danger button's accessible name is "Delete account permanently" | Same, inside the scrolling content so both stay reachable above the keyboard in landscape |
| Submit | Enter in the field, or the danger button | Return key, or the danger button |
| Enabled when | The password isn't empty and nothing is pending | Same |

## States

| State | Display | Behavior |
|---|---|---|
| Idle | As above | |
| Pending | Danger button shows "Deleting…" and `aria-busy` / `accessibilityState.busy`; inputs and Cancel disabled | Reached within 100 ms of the tap. A second submit is impossible (FR-014) |
| Wrong password (`403`) | "Current password is incorrect." under the field, with `role="alert"` / `accessibilityRole="alert"` | Field keeps focus with its text selected; the user can retry |
| Rate limited (`429`) | "Too many attempts. Try again in N seconds." (N from `retry_after_seconds`; "1 second" when N = 1) | Field stays enabled. The server enforces the wait |
| Failed (`500`) | "Something went wrong, and your account wasn't deleted. Please try again." | User stays signed in (FR-013) |
| Offline (no response) | "Couldn't reach theStats. Check your connection and try again." | A retry that finds the account already gone continues as a success (research R4) |
| Session gone (`401 unauthenticated`) | | Web: `/login?from=/account`. iOS: the auth wall already shows sign-in |
| Success (`204`, or `401 account_deleted`) | | Cleanup, then the start screen with "Your account has been deleted." ([account-gone-signals.md](./account-gone-signals.md)) |
| Cancelled | Dialog closes, field cleared | Nothing sent; nothing changes (FR-012) |

## Accessibility

- **Web**:
  - Operable with the keyboard alone: Tab order is field, Cancel, Delete; Enter submits; Esc cancels.
  - The dialog is labelled by its title, and error text is announced.
  - Usable from 360 px width up.
  - Danger colours meet WCAG 2.1 AA contrast against `surface-elevated`.
- **iOS**:
  - VoiceOver reads the title as a header, the field by its label, and each button by its name; errors are announced.
  - On the smallest supported iPhone in landscape, with the keyboard showing, the field and both buttons can be scrolled into view (FR-015, US2 scenario 5).

## Component tests

**Web** (Vitest + Testing Library):
- The `useAccountDeletion` hook: each response row's behavior, the pending state, and one request per double click.
- The dialog, with the hook mocked:
  - it opens with the field focused;
  - Delete is disabled while the field is empty;
  - each failure shows its text, and the pending state renders;
  - Cancel and Esc send nothing.
- The section renders apart from the profile panels.

**iOS** (Jest + RNTL):
- Home → Account in one press.
- The screen shows the email.
- The sheet opens; Delete is disabled until a password is typed.
- Each response row above produces its display.
- Success calls `handleAccountGone("deleted")`.
- Close and Cancel send nothing.
