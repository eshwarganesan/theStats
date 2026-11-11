/**
 * What both clients share about deleting an account (feature
 * 018-account-deletion): the wording from contracts/confirmation-ui.md and
 * how a reply from `POST /api/account/delete` maps to an outcome.
 */
import { parseApiError } from "../api/errors";

export const DELETE_ACCOUNT_COPY = {
  sectionHeading: "Delete account",
  sectionText:
    "Permanently delete your account, your profile and all of your saved games. This can't be undone.",
  actionLabel: "Delete account",
  dialogTitle: "Delete your account?",
  dialogExplanation:
    "This permanently deletes your account, your profile and all of your saved games, including any game in progress. You can't undo this.",
  passwordLabel: "Password",
  cancelLabel: "Cancel",
  confirmLabel: "Delete account",
  confirmAccessibleName: "Delete account permanently",
  pendingLabel: "Deleting…",
} as const;

export type DeleteAccountFailure =
  | { kind: "wrong-password" }
  | { kind: "rate-limited"; retryAfterSeconds: number }
  | { kind: "invalid" }
  | { kind: "failed" }
  | { kind: "offline" };

export type DeleteAccountOutcome =
  | { kind: "deleted" }
  | { kind: "signed-out" }
  | DeleteAccountFailure;

/** The throttle's longest wait, used when a 429 doesn't say. */
const DEFAULT_RETRY_SECONDS = 30;

/**
 * Maps a reply to an outcome. `401 account_deleted` means an earlier
 * attempt already went through (a retry after a lost response), so it
 * counts as deleted.
 */
export function toDeleteAccountOutcome(status: number, body: unknown): DeleteAccountOutcome {
  const error = parseApiError(body);
  switch (status) {
    case 204:
      return { kind: "deleted" };
    case 401:
      return error?.code === "account_deleted" ? { kind: "deleted" } : { kind: "signed-out" };
    case 403:
      return { kind: "wrong-password" };
    case 429:
      return {
        kind: "rate-limited",
        retryAfterSeconds: error?.retryAfterSeconds ?? DEFAULT_RETRY_SECONDS,
      };
    case 400:
      return { kind: "invalid" };
    default:
      return { kind: "failed" };
  }
}

export function deleteAccountErrorText(failure: DeleteAccountFailure): string {
  switch (failure.kind) {
    case "wrong-password":
      return "Current password is incorrect.";
    case "rate-limited": {
      const s = failure.retryAfterSeconds;
      return `Too many attempts. Try again in ${s} second${s === 1 ? "" : "s"}.`;
    }
    case "invalid":
      return "Enter your password to confirm.";
    case "failed":
      return "Something went wrong, and your account wasn't deleted. Please try again.";
    case "offline":
      return "Couldn't reach theStats. Check your connection and try again.";
  }
}
