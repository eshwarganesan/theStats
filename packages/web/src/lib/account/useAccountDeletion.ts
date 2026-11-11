"use client";

/**
 * The state behind the delete-account dialog (feature 018-account-deletion,
 * research R9): the request, whether it's in flight, the last failure,
 * and what each outcome does. Keeping it here leaves the dialog
 * presentational (Constitution Principle III).
 */
import { useCallback, useRef, useState } from "react";
import type { DeleteAccountFailure } from "@thestats/app";
import { handleAccountGone } from "@/lib/account/account-gone";
import { requestAccountDeletion } from "@/lib/account/delete-account-request";
import { beginOwnDeletion, endOwnDeletion } from "@/lib/account/device-account";

export interface AccountDeletion {
  /** True while a request is in flight. */
  pending: boolean;
  /** Why the last attempt didn't delete the account, if it didn't. */
  failure: DeleteAccountFailure | null;
  /** Sends the password. Ignored while a request is already in flight (FR-014). */
  submit: (password: string) => Promise<void>;
  /** Forgets the last failure. */
  reset: () => void;
}

export function useAccountDeletion(): AccountDeletion {
  // A ref, not state: a double click lands before React re-renders.
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<DeleteAccountFailure | null>(null);

  const submit = useCallback(async (password: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setFailure(null);
    beginOwnDeletion();

    const outcome = await requestAccountDeletion(password);
    if (outcome.kind === "deleted") {
      // Navigates to the landing page; stay pending until it does.
      handleAccountGone("deleted");
      return;
    }

    endOwnDeletion();
    inFlight.current = false;
    setPending(false);
    if (outcome.kind === "signed-out") {
      window.location.assign("/login?from=/account");
      return;
    }
    setFailure(outcome);
  }, []);

  const reset = useCallback(() => setFailure(null), []);

  return { pending, failure, submit, reset };
}
