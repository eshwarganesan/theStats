"use client";

/**
 * Presentational sidebar nav item.
 *
 * Renders an accessible link with icon + visible label. The drawer is
 * either fully open (this item on-canvas) or fully off-canvas, so there
 * is no separate icon-only rail state to disambiguate.
 *
 * Active-state indicator (`data-active="true"`) matches the current
 * path exactly or as a prefix (`/games` matches `/games/abc`),
 * satisfying spec FR-003.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SidebarNavItemProps {
  /** Route the item navigates to when activated. */
  href: string;
  /** Human-readable label rendered next to the icon. */
  label: string;
  /** Presentational icon rendered at 20 px. */
  icon: ReactNode;
  /** Optional extra Tailwind classes appended after the base + active
   *  classes. Callers should rarely need this. */
  className?: string;
}

export function SidebarNavItem({ href, label, icon, className }: SidebarNavItemProps) {
  const pathname = usePathname();
  const active =
    pathname === href || (pathname?.startsWith(href + "/") ?? false);

  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      data-active={active ? "true" : "false"}
      className={cn(
        "flex items-center h-10 mx-2 my-1 rounded-md text-ink transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        active
          ? "bg-accent/15 text-accent"
          : "hover:bg-surface-hover hover:text-accent",
        "px-3 gap-3",
        className,
      )}
    >
      <span className="inline-flex items-center justify-center shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span className="text-sm font-medium truncate">{label}</span>
    </Link>
  );
}
