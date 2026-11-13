import { usePathname, useRouter } from "expo-router";
import { useEffect, useState, type ComponentType } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ACCENT, GamesIcon, INK } from "@/components/shell/icons";
import { cx } from "@/lib/cx";

/** Web's w-64. */
const WIDTH = 256;

/**
 * The navigation sidebar, like web's AppSidebar: a panel that slides in
 * from the left over a dimmed backdrop, with Games at the top. Unlike
 * web, it has no profile button at the foot; that's in Home's header.
 * Tapping the backdrop or an item closes it. While closed it stays
 * mounted off-screen, hidden from touches and VoiceOver, so it can slide
 * both ways.
 */
export function AppSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [open, progress]);

  // Wider by the notch, when it's on the left, so the content is as wide as web's.
  const width = WIDTH + insets.left;
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] });

  const toGames = () => {
    onClose();
    if (pathname !== "/") router.dismissTo("/");
  };

  return (
    <View
      aria-hidden={!open}
      aria-modal={open}
      pointerEvents={open ? "auto" : "none"}
      onAccessibilityEscape={onClose}
      style={StyleSheet.absoluteFill}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close navigation menu"
          onPress={onClose}
          className="flex-1 bg-black/40"
        />
      </Animated.View>
      <Animated.View style={[styles.panel, { width, transform: [{ translateX }] }]}>
        <View
          className="flex-1 border-r border-surface-border bg-surface"
          style={{ paddingLeft: insets.left, paddingTop: insets.top + 64 }}
        >
          <NavItem
            label="Games"
            Icon={GamesIcon}
            // Games is Home, and a saved game's review belongs to it.
            active={pathname === "/" || pathname.startsWith("/games/")}
            onPress={toGames}
          />
        </View>
      </Animated.View>
    </View>
  );
}

/** A destination in the sidebar, like web's SidebarNavItem. */
function NavItem({
  label,
  Icon,
  active,
  onPress,
}: {
  label: string;
  Icon: ComponentType<{ color: string }>;
  /** Whether it's the page on screen, which lights it up. */
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={cx(
        "mx-2 my-1 h-10 flex-row items-center gap-3 rounded-md px-3",
        active && "bg-accent/15",
      )}
    >
      <Icon color={active ? ACCENT : INK} />
      <Text
        className={cx("shrink text-sm font-medium", active ? "text-accent" : "text-ink")}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: { position: "absolute", top: 0, bottom: 0, left: 0 },
});
