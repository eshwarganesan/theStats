"use client";

/**
 * Password change form (feature 009-account-library, US1).
 *
 * Two password fields. Submit calls the `changePassword` Server Action;
 * on `current_password_incorrect`, the current-password field stays
 * populated so the user does not have to re-type both. On success, the
 * form clears and the user remains signed in on this device (FR-005).
 */

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { changePassword } from "@/app/(authenticated)/account/actions";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const fd = new FormData();
    fd.set("currentPassword", currentPassword);
    fd.set("newPassword", newPassword);
    startTransition(async () => {
      const result = await changePassword(fd);
      if (result.ok) {
        setMessage("Password updated.");
        setCurrentPassword("");
        setNewPassword("");
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <Input
        id="account-current-password"
        type="password"
        label="Current password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        autoComplete="current-password"
      />
      <Input
        id="account-new-password"
        type="password"
        label="New password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        autoComplete="new-password"
        error={error ?? undefined}
      />

      {message ? (
        <p className="text-sm text-accent" role="status">
          {message}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Updating…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}
