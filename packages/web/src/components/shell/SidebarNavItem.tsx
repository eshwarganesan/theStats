"use client";

/**
 * Presentational sidebar nav item (feature 010-games-library, US1).
 *
 * Single-purpose composition primitive: an accessible link that renders
 * icon-only in the sidebar's collapsed rail state and icon + visible
 * label in the expanded overlay state. The rail-vs-overlay decision is
 * read from `document.body`'s `data-sidebar-collapsed` attribute, which
 * `AppSidebar` mirrors on every state change — this keeps the item
 * decoupled from the sidebar's internal `useState` while still animating
 * in lockstep with it (Research R-01).
 *
 * Active-state indicator (`data-active="true"`) matches the current path
 * exactly or as a prefix (`/games` matches `/games/abc`), satisfying
 * spec FR-003.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SidebarNavItemProps {
  /** Route the item navigates to when activated. */
  href: string;
  /** Human-readable label. Rendered as visible text in the expanded
   *  overlay and as `aria-label` + `sr-only` companion in the collapsed
   *  rail so keyboard and screen-reader users have parity. */
  label: string;
  /** Presentational icon rendered at 20 px in both rail and overlay. */
  icon: ReactNode;
  /** Optional extra Tailwind classes appended after the base + active
   *  classes. Callers should rarely need this. */
  className?: string;
}

const COLLAPSED_ATTR = "data-sidebar-collapsed";

function subscribeToCollapsed(callback: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const observer = new MutationObserver(callback);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: [COLLAPSED_ATTR],
  });
  return () => observer.disconnect();
}

function readCollapsed(): boolean {
  if (typeof document === "undefined") return true;
  return document.body.getAttribute(COLLAPSED_ATTR) !== "false";
}

function readCollapsedServer(): boolean {
  // Match SSR to the collapsed default so first client paint doesn't
  // flicker before hydration.
  return true;
}

export function SidebarNavItem({ href, label, icon, className }: SidebarNavItemProps) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(
    subscribeToCollapsed,
    readCollapsed,
    readCollapsedServer,
  );
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
        collapsed ? "justify-center w-10" : "px-3 gap-3",
        className,
      )}
    >
      <span className="inline-flex items-center justify-center shrink-0" aria-hidden="true">
        {icon}
      </span>
      {collapsed ? (
        <span className="sr-only">{label}</span>
      ) : (
        <span className="text-sm font-medium truncate">{label}</span>
      )}
    </Link>
  );
}
