import { createContext, useContext } from "react";

/**
 * Opens the navigation sidebar. SidebarProvider supplies it, so a
 * screen's HamburgerButton can open the sidebar from the screen's own
 * header. Outside the provider, e.g. a screen rendered alone in a test,
 * it does nothing.
 */
export const SidebarContext = createContext<() => void>(() => {});

export function useOpenSidebar(): () => void {
  return useContext(SidebarContext);
}
