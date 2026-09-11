"use client";

/**
 * Authenticated-app navigation drawer.
 *
 * A fully controlled off-canvas panel: `open` and `onClose` are supplied
 * by the parent shell (`AuthenticatedShell`), which owns the toggle
 * state and mounts the hamburger button that opens this drawer.
 *
 * Interaction contract:
 *   - Backdrop click → onClose.
 *   - Escape while open → onClose.
 *   - Clicking a nav item → onClose (drawer dismisses after navigation).
 */

import { useCallback, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconGames } from "./icons/IconGames";
import { SidebarNavItem } from "./SidebarNavItem";

export interface AppSidebarProps {
  /** Whether the drawer is on-canvas. */
  open: boolean;
  /** Called for every gesture that dismisses the drawer: backdrop
   *  click, Escape keypress, or nav-item click. */
  onClose: () => void;
  /** Slot for the (server-rendered) SidebarProfileIcon — only visible
   *  when signed in; renders null otherwise. */
  profileIcon: ReactNode;
}

export function AppSidebar({ open, onClose, profileIcon }: AppSidebarProps) {
  // Escape collapses the expanded overlay — matches modal-like semantics
  // without stealing focus (this is a nav, not a proper dialog).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const handleNavClick = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <>
      {/* Backdrop — dim + click-to-close when the drawer is open. */}
      <div
        aria-hidden="true"
        data-testid="sidebar-backdrop"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-30 bg-black/40 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      />
      <nav
        id="primary-navigation"
        role="navigation"
        aria-label="Primary"
        aria-hidden={!open}
        data-open={open ? "true" : "false"}
        className={cn(
          "flex flex-col",
          // Off-canvas by default. Slides in from the left when open.
          "fixed inset-y-0 left-0 z-40 w-64",
          "border-r border-surface-border bg-surface",
          "transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <ul className="flex-1 flex flex-col pt-16" role="list">
          <li onClick={handleNavClick}>
            <SidebarNavItem
              href="/games"
              label="Games"
              icon={<IconGames />}
            />
          </li>
        </ul>

        <div className="p-3 border-t border-surface-border flex items-center justify-center">
          {profileIcon}
        </div>
      </nav>
    </>
  );
}
