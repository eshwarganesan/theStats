import { Pressable } from "react-native";

import { INK, MenuIcon } from "@/components/shell/icons";
import { useOpenSidebar } from "@/components/shell/SidebarContext";
import { cx } from "@/lib/cx";

/**
 * Opens the navigation sidebar, like web's HamburgerButton: a 40-pt
 * button for the start of a screen's header. Where it sits is the
 * caller's job.
 */
export function HamburgerButton({ className }: { className?: string }) {
  const openSidebar = useOpenSidebar();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open navigation menu"
      onPress={openSidebar}
      className={cx("h-10 w-10 items-center justify-center", className)}
    >
      <MenuIcon color={INK} />
    </Pressable>
  );
}
