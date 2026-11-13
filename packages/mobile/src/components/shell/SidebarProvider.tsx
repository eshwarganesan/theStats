import { usePathname } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { View } from "react-native";

import { AppSidebar } from "@/components/shell/AppSidebar";
import { SidebarContext } from "@/components/shell/SidebarContext";

/**
 * Hosts the navigation sidebar over every screen, like web's
 * AuthenticatedShell. Screens open it from the HamburgerButton in their
 * headers. It stays open only on the screen it was opened on, so any
 * navigation closes it, including the app's own, like the move to
 * sign-in when the session ends.
 */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  if (openOn !== null && openOn !== pathname) setOpenOn(null);

  const openSidebar = useCallback(() => setOpenOn(pathname), [pathname]);
  const close = useCallback(() => setOpenOn(null), []);

  return (
    <SidebarContext.Provider value={openSidebar}>
      <View className="flex-1">
        {children}
        <AppSidebar open={openOn === pathname} onClose={close} />
      </View>
    </SidebarContext.Provider>
  );
}
