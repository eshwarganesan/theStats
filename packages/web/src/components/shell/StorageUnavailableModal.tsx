"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useStorageAvailability } from "@/lib/storageAvailability";

/**
 * Blocking modal shown once per page lifetime when persistent storage
 * is unavailable (Safari private mode, quota errors, storage disabled).
 *
 * Satisfies FR-009: the user must explicitly acknowledge that saving
 * will not work before continuing. The acknowledgment is NOT persisted
 * — every reload re-probes and, if storage is still broken, re-asks.
 */
export function StorageUnavailableModal() {
  const { localStorageAvailable } = useStorageAvailability();
  const [dismissed, setDismissed] = useState(false);

  const open = !localStorageAvailable && !dismissed;
  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={() => setDismissed(true)}
      title="Saving is disabled"
      size="sm"
      footer={
        <Button variant="primary" onClick={() => setDismissed(true)}>
          Continue without saving
        </Button>
      }
    >
      <p className="text-ink-muted text-sm leading-relaxed">
        This browser is blocking persistent storage, so any game you start in
        this session will be lost when you refresh or close the tab.
      </p>
      <p className="text-ink-muted text-sm leading-relaxed mt-3">
        This usually happens in private / incognito windows or when site
        storage has been disabled in browser settings.
      </p>
    </Modal>
  );
}
