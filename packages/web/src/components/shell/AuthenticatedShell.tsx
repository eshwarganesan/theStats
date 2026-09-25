"use client";

/**
 * Client-side shell wrapper for every route under `(authenticated)/`.
 *
 * Owns the open/closed state of the navigation drawer and exposes it
 * to descendants via `SidebarToggleContext`. Pages render their own
 * `<HamburgerButton />` inside their own headers; the shell itself
 * only mounts the `<AppSidebar>` drawer + the `<main>` slot.
 */

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import {
  SidebarToggleContext,
  type SidebarToggleContextValue,
} from "./SidebarToggleContext";

export interface AuthenticatedShellProps {
  profileIcon: ReactNode;
  children: ReactNode;
}

export function AuthenticatedShell({
  profileIcon,
  children,
}: AuthenticatedShellProps) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  const close = useCallback(() => setOpen(false), []);

  const value = useMemo<SidebarToggleContextValue>(
    () => ({ open, toggle, close }),
    [open, toggle, close],
  );

  return (
    <SidebarToggleContext.Provider value={value}>
      <AppSidebar open={open} onClose={close} profileIcon={profileIcon} />
      <main className="min-h-[100dvh]">{children}</main>
    </SidebarToggleContext.Provider>
  );
}
