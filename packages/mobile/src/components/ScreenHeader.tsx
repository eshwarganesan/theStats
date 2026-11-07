import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

/** A screen's title bar: a back button, the title, and optional actions. */
export function ScreenHeader({
  title,
  onBack,
  backLabel = "Games",
  right,
}: {
  title: string;
  onBack: () => void;
  backLabel?: string;
  right?: ReactNode;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3 border-b border-surface-border px-4 py-3">
      <View className="shrink flex-row items-center gap-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Back to ${backLabel}`}
          onPress={onBack}
          hitSlop={8}
        >
          <Text className="text-base text-accent">‹ {backLabel}</Text>
        </Pressable>
        <Text accessibilityRole="header" className="shrink text-lg font-bold text-ink" numberOfLines={1}>
          {title}
        </Text>
      </View>
      {right ? <View className="flex-row items-center gap-2">{right}</View> : null}
    </View>
  );
}
