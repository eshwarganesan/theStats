"use client";

/**
 * The confirmation step for deleting the account (feature
 * 018-account-deletion, contracts/confirmation-ui.md).
 *
 * Presentational: the request, its pending state and what each outcome
 * does live in `useAccountDeletion`. The form is mounted only while the
 * dialog is open, so every opening starts with an empty field.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { DELETE_ACCOUNT_COPY, deleteAccountErrorText } from "@thestats/app";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useAccountDeletion } from "@/lib/account/useAccountDeletion";

export interface DeleteAccountDialogProps {
  open: boolean;
  onClose: () => void;
}

export function DeleteAccountDialog({ open, onClose }: DeleteAccountDialogProps) {
  if (!open) return null;
  return <DeleteAccountForm onClose={onClose} />;
}

function DeleteAccountForm({ onClose }: { onClose: () => void }) {
  const formId = useId();
  const [password, setPassword] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);
  const { pending, failure, submit, reset } = useAccountDeletion();

  // Start in the password field. `autoFocus` isn't enough: `showModal()`
  // runs after mount (the Modal's effect, which React runs before this
  // one) and moves focus to the dialog's first focusable control.
  useEffect(() => {
    passwordRef.current?.focus();
  }, []);

  // A wrong password puts the cursor back, with the text selected to retype.
  useEffect(() => {
    if (failure?.kind !== "wrong-password") return;
    passwordRef.current?.focus();
    passwordRef.current?.select();
  }, [failure]);

  function close(): void {
    // Closing mid-request would hide the outcome; the request finishes either way.
    if (pending) return;
    reset();
    onClose();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (password.length === 0) return;
    void submit(password);
  }

  return (
    <Modal
      open
      onClose={close}
      title={DELETE_ACCOUNT_COPY.dialogTitle}
      size="sm"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="ghost" size="sm" onClick={close} disabled={pending}>
            {DELETE_ACCOUNT_COPY.cancelLabel}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="danger"
            size="sm"
            disabled={password.length === 0 || pending}
            aria-busy={pending}
            aria-label={DELETE_ACCOUNT_COPY.confirmAccessibleName}
          >
            {pending ? DELETE_ACCOUNT_COPY.pendingLabel : DELETE_ACCOUNT_COPY.confirmLabel}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4 text-sm">
        <p className="text-ink-dim">{DELETE_ACCOUNT_COPY.dialogExplanation}</p>
        <Input
          ref={passwordRef}
          label={DELETE_ACCOUNT_COPY.passwordLabel}
          type="password"
          autoComplete="current-password"
          value={password}
          disabled={pending}
          onChange={(event) => setPassword(event.target.value)}
        />
        {failure ? (
          <p role="alert" className="text-danger">
            {deleteAccountErrorText(failure)}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
