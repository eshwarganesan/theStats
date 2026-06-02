"use client";

import { useState } from "react";
import { SignInForm } from "./sign-in-form";
import { SignUpForm } from "./sign-up-form";
import { cn } from "@/lib/utils";

type Mode = "sign-in" | "sign-up";

interface LoginPanelProps {
  from?: string;
  initialMode?: Mode;
}

/**
 * Login panel: a mode toggle (Sign in / Sign up) plus the corresponding
 * form. US2 introduces both modes; the default is "sign-in" since
 * returning users are the more common case.
 */
export function LoginPanel({ from, initialMode = "sign-in" }: LoginPanelProps) {
  const [mode, setMode] = useState<Mode>(initialMode);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h2 className="heading-display text-2xl">
          {mode === "sign-in" ? "Sign in to theStats" : "Create your account"}
        </h2>
        <p className="text-sm text-ink-dim">
          {mode === "sign-in"
            ? "Sign in to your account to sync games, save play-by-play, and access them across devices."
            : "Sign up to unlock sync, save, and multi-device features. You can keep scorekeeping anonymously without an account."}
        </p>
      </header>

      <div role="tablist" aria-label="Authentication mode" className="flex">
        <ModeTab
          mode="sign-in"
          label="Sign in"
          active={mode === "sign-in"}
          onClick={() => setMode("sign-in")}
        />
        <ModeTab
          mode="sign-up"
          label="Sign up"
          active={mode === "sign-up"}
          onClick={() => setMode("sign-up")}
        />
      </div>

      {mode === "sign-in" ? <SignInForm from={from} /> : <SignUpForm from={from} />}
    </div>
  );
}

function ModeTab({
  mode,
  label,
  active,
  onClick,
}: {
  mode: Mode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="tab"
      type="button"
      aria-selected={active}
      data-mode={mode}
      onClick={onClick}
      className={cn(
        "flex-1 h-11 text-sm font-mono uppercase tracking-widest transition-colors",
        "border first:border-r-0",
        active
          ? "border-accent bg-accent text-surface"
          : "border-surface-border bg-surface-raised text-ink-muted hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}
