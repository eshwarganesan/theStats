"use client";

/**
 * Sidebar-drawer toggle context.
 *
 * `AuthenticatedShell` owns the open/closed state and exposes it here
 * so any descendant — most importantly `<HamburgerButton />` mounted
 * inside each page's own header — can flip the drawer without prop
 * drilling. Pages control WHERE the toggle sits; the shell owns
 * WHETHER the drawer is open.
 */
import { createContext, useContext } from "react";

export interface SidebarToggleContextValue {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

export const SidebarToggleContext =
  createContext<SidebarToggleContextValue | null>(null);

export function useSidebarToggle(): SidebarToggleContextValue {
  const ctx = useContext(SidebarToggleContext);
  if (ctx === null) {
    throw new Error(
      "useSidebarToggle must be used inside an AuthenticatedShell (SidebarToggleContext provider is missing).",
    );
  }
  return ctx;
}
