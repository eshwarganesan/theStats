"use client";

/**
 * The account page's "Delete account" danger zone (feature
 * 018-account-deletion, FR-001): set apart from the other settings, says
 * deletion is permanent, and opens the confirmation step.
 */
import { useId, useState } from "react";
import { DELETE_ACCOUNT_COPY } from "@thestats/app";
import { Button } from "@/components/ui/Button";
import { DeleteAccountDialog } from "./DeleteAccountDialog";

export function DeleteAccountSection() {
  const headingId = useId();
  const [open, setOpen] = useState(false);

  return (
    <section
      aria-labelledby={headingId}
      data-variant="danger"
      className="panel p-6 flex flex-col gap-4 border border-danger/50"
    >
      <header className="flex flex-col gap-1">
        <h2 id={headingId} className="heading-display text-xl text-danger">
          {DELETE_ACCOUNT_COPY.sectionHeading}
        </h2>
        <p className="text-sm text-ink-dim">{DELETE_ACCOUNT_COPY.sectionText}</p>
      </header>
      <div>
        <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
          {DELETE_ACCOUNT_COPY.actionLabel}
        </Button>
      </div>
      <DeleteAccountDialog open={open} onClose={() => setOpen(false)} />
    </section>
  );
}
