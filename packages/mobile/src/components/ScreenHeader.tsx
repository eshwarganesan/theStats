import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { HamburgerButton } from "@/components/shell/HamburgerButton";

/**
 * A screen's title bar: a back button or the navigation sidebar's menu
 * button, the title, and optional actions. Setup and the game go back;
 * every other signed-in screen has the sidebar.
 */
export function ScreenHeader({
  title,
  onBack,
  backLabel = "Games",
  right,
}: {
  title?: string;
  /** Shows a back button in place of the sidebar's menu button. */
  onBack?: () => void;
  backLabel?: string;
  right?: ReactNode;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3 border-b border-surface-border px-4 py-3">
      <View className="shrink flex-row items-center gap-4">
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Back to ${backLabel}`}
            onPress={onBack}
            hitSlop={8}
          >
            <Text className="text-base text-accent">‹ {backLabel}</Text>
          </Pressable>
        ) : (
          // Overhangs the padding, keeping the bar 56 pt tall like web's.
          <HamburgerButton className="-my-1" />
        )}
        {title ? (
          <Text accessibilityRole="header" className="shrink text-lg font-bold text-ink" numberOfLines={1}>
            {title}
          </Text>
        ) : null}
      </View>
      {right ? <View className="flex-row items-center gap-2">{right}</View> : null}
    </View>
  );
}
