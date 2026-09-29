"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface SignOutButtonProps {
  className?: string;
}

/**
 * Client Component child of <AuthPill />. Posts to /api/auth/sign-out
 * then returns the user to the public landing page (feature 011 FR-013).
 * Uses a full-document navigation to `/` so middleware re-evaluates the
 * (now signed-out) session on the next request and serves the landing.
 */
export function SignOutButton({ className }: SignOutButtonProps) {
  const [pending, setPending] = useState(false);

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
