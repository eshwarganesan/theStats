"use client";

/**
 * Inline hamburger toggle for the authenticated app's nav drawer.
 *
 * Reads its open/toggle state from `SidebarToggleContext` (provided by
 * `AuthenticatedShell`) so pages can drop `<HamburgerButton />` into
 * their own header markup without wiring props. Layout — where the
 * button sits, how it lines up with siblings — is the caller's job.
 */
import { cn } from "@/lib/utils";
import { useSidebarToggle } from "./SidebarToggleContext";

export interface HamburgerButtonProps {
  className?: string;
}

export function HamburgerButton({ className }: HamburgerButtonProps) {
  const { open, toggle } = useSidebarToggle();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={open ? "Close navigation menu" : "Open navigation menu"}
      aria-expanded={open}
      aria-controls="primary-navigation"
      className={cn(
        "inline-flex items-center justify-center h-10 w-10",
        "text-ink hover:text-accent transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        className,
      )}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M3 5h14M3 10h14M3 15h14"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
