"use client";

/**
 * Editable profile form (feature 009-account-library, US1).
 *
 * Shows the caller's email (read-only) and their display name. Submit
 * invokes the `updateDisplayName` Server Action; on failure the input
 * keeps its dirty value so the user does not lose in-flight edits
 * (FR-006 / FR-008).
 */

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { updateDisplayName } from "@/app/(authenticated)/account/actions";

export interface ProfileFormProps {
  email: string;
  initialDisplayName: string;
}

export function ProfileForm({ email, initialDisplayName }: ProfileFormProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const fd = new FormData();
    fd.set("displayName", displayName);
    startTransition(async () => {
      const result = await updateDisplayName(fd);
      if (result.ok) {
        setMessage("Saved.");
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <span className="label-eyebrow">Email</span>
        <span className="text-ink font-mono text-sm">{email}</span>
      </div>

      <Input
        id="profile-display-name"
        label="Display name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        error={error ?? undefined}
        maxLength={64}
        aria-invalid={error ? true : undefined}
      />

      {message ? (
        <p className="text-sm text-accent" role="status">
          {message}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
