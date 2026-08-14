"use client";

/**
 * Collapsible left-side app shell nav (feature 009-account-library, US1).
 *
 * Hosts the AuthPill at the top and — when signed in — the profile icon at
 * the bottom, both supplied as slot props so the sidebar itself can stay a
 * Client Component while the two auth-dependent surfaces render server-side.
 *
 * State:
 *   - Collapsed / expanded is persisted in `localStorage` under
 *     `SIDEBAR_STORAGE_KEY`. First load defaults to expanded on ≥ 1024 px
 *     viewports and collapsed on smaller ones (Research R-06).
 *   - The transform-based collapse animation avoids layout thrash so page
 *     content stays responsive during the toggle (Principle IV).
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconChevronLeft } from "./icons/IconChevronLeft";
import { IconChevronRight } from "./icons/IconChevronRight";

export const SIDEBAR_STORAGE_KEY = "thestats.sidebar.v1";

export interface AppSidebarProps {
  /** Slot for the (server-rendered) AuthPill — rendered inside the sidebar. */
  authPill: ReactNode;
  /** Slot for the (server-rendered) SidebarProfileIcon — only visible when
   *  signed in; renders null otherwise. */
  profileIcon: ReactNode;
}

function readInitialCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "boolean") return parsed;
    }
  } catch {
    /* fall through to viewport default */
  }
  // Default: expanded on desktop, collapsed on mobile / tablet.
  if (typeof window.matchMedia === "function") {
    return !window.matchMedia("(min-width: 1024px)").matches;
  }
  return false;
}

/** Width of the always-visible collapsed rail. `<main>` reserves this
 *  as a permanent left inset so no content sits under it. */
export const SIDEBAR_RAIL_WIDTH_PX = 56;

export function AppSidebar({ authPill, profileIcon }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState(false);

  // Read the persisted state (and viewport-based default) only after mount
  // to keep server-rendered output stable.
  useEffect(() => {
    setCollapsed(readInitialCollapsed());
    setHydrated(true);
  }, []);

  const setCollapsedPersisting = useCallback((next: boolean) => {
    setCollapsed(next);
    try {
      window.localStorage.setItem(
        SIDEBAR_STORAGE_KEY,
        JSON.stringify(next),
      );
    } catch {
      /* localStorage may be unavailable — non-fatal */
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsedPersisting(!collapsed);
  }, [collapsed, setCollapsedPersisting]);

  const close = useCallback(() => {
    setCollapsedPersisting(true);
  }, [setCollapsedPersisting]);

  // Escape collapses the expanded overlay — matches modal-like semantics
  // without stealing focus (this is a nav, not a proper dialog).
  useEffect(() => {
    if (collapsed) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [collapsed, close]);

  return (
    <>
      {/* Backdrop — dim + click-to-close when the sidebar is expanded.
          Fades out and becomes non-interactive when collapsed. */}
      <div
        aria-hidden="true"
        onClick={close}
        className={cn(
          "fixed inset-0 z-30 bg-black/40 transition-opacity duration-200",
          collapsed ? "opacity-0 pointer-events-none" : "opacity-100",
        )}
      />
      <nav
        role="navigation"
        aria-label="Primary"
        data-collapsed={collapsed ? "true" : "false"}
        data-hydrated={hydrated ? "true" : "false"}
        className={cn(
          "flex flex-col",
          // Fixed-position overlay: expanding no longer participates in
          // page layout, so the content column stops shifting.
          "fixed inset-y-0 left-0 z-40",
          "border-r border-surface-border bg-surface",
          "transition-[width] duration-200 ease-out",
          collapsed ? "w-14" : "w-64",
        )}
      >
        <div className="flex items-center justify-between p-3">
          
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className={cn(
              "shrink-0 inline-flex items-center justify-center h-8 w-8",
              "text-ink hover:text-accent",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              "transition-colors",
            )}
          >
            {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
          </button>
        </div>

        <div className="flex-1" />

        <div className="p-3 border-t border-surface-border flex items-center justify-center">
          {profileIcon}
        </div>
      </nav>
    </>
  );
}
