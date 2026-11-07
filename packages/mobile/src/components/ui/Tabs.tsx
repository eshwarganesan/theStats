import { Pressable, Text, View } from "react-native";

import { cx } from "@/lib/cx";

/** A row of tabs under a screen's header, one of them selected. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View accessibilityRole="tablist" className="flex-row justify-center border-b border-surface-border">
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <Pressable
            key={tab.value}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(tab.value)}
            className={cx("border-b-2 px-5 py-3", selected ? "border-accent" : "border-transparent")}
          >
            <Text
              className={cx(
                "text-xs uppercase tracking-widest",
                selected ? "text-ink" : "text-ink-muted",
              )}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
