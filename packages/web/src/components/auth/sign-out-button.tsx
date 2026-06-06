"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";

interface SignOutButtonProps {
  className?: string;
}

/**
 * Client Component child of <AuthPill />. Posts to /api/auth/sign-out
 * then refreshes server components and returns the user to the main
 * scorekeeping screen in anonymous mode (FR-009 / US3).
 */
export function SignOutButton({ className }: SignOutButtonProps) {
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();

  async function onClick() {
    if (pending) return;
    setPending(true);
    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
    } finally {
      setPending(false);
    }
    window.location.assign("/");
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={cn(
        "text-ink-dim hover:text-accent transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "font-mono uppercase tracking-wider",
        className,
      )}
      aria-label="Sign out"
    >
      Sign out
    </button>
  );
}
