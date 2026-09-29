"use client";

/**
 * Confirmation dialog surfaced when a user on `/game/*` tries to
 * navigate away via the sidebar drawer. Prevents accidental loss of
 * in-progress scorekeeping state.
 *
 * Fully controlled — the caller (currently `<AppSidebar>`) owns the
 * `open` state, the pending target, and the two decision handlers.
 */

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

export interface GameLeaveConfirmDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function GameLeaveConfirmDialog({
  open,
  onCancel,
  onConfirm,
}: GameLeaveConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Leave the current game?"
      size="sm"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={onConfirm}>
            OK
          </Button>
        </div>
      }
    >
      <p className="text-sm text-ink">
        You have an in-progress game. Any unsaved progress will be lost if you
        leave this page.
      </p>
    </Modal>
  );
}
