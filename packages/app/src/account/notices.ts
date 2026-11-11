/**
 * The notice a device shows once its account is gone (feature
 * 018-account-deletion, FR-007 and FR-009). Web and iOS show the same words.
 * Neither names the account: the next person to see it may not own it (FR-018).
 */

export type AccountNoticeKind = "deleted" | "deleted-elsewhere";

export const ACCOUNT_NOTICE_TEXT = {
  deleted: "Your account has been deleted.",
  "deleted-elsewhere": "You were signed out because this account was deleted.",
} as const satisfies Record<AccountNoticeKind, string>;

export function parseAccountNoticeKind(value: unknown): AccountNoticeKind | null {
  return value === "deleted" || value === "deleted-elsewhere" ? value : null;
}
