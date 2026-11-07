import { Pressable, Text, View } from "react-native";

import { cx } from "@/lib/cx";

import { Field } from "./Field";
import type { SegmentedOption } from "./Segmented";

/**
 * A labelled grid of choices, one of which is picked. For lists too long
 * for a Segmented row, such as the five foul kinds.
 */
export function ChoiceGrid<T extends string>({
  label,
  options,
  value,
  onChange,
  tone = "accent",
}: {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  tone?: "accent" | "danger";
}) {
  return (
    <Field label={label}>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} className="-m-1 flex-row flex-wrap">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <View key={option.value} className="w-1/2 p-1 md:w-1/3">
              <Pressable
                accessibilityRole="radio"
                accessibilityLabel={`${label}: ${option.label}`}
                accessibilityState={{ checked: selected }}
                onPress={() => onChange(option.value)}
                className={cx(
                  "rounded-lg border px-3 py-2.5",
                  !selected && "border-surface-border bg-surface-raised",
                  selected && tone === "accent" && "border-accent bg-accent/10",
                  selected && tone === "danger" && "border-danger bg-danger/10",
                )}
              >
                <Text
                  className={cx(
                    "text-sm font-medium",
                    !selected && "text-ink-muted",
                    selected && tone === "accent" && "text-accent",
                    selected && tone === "danger" && "text-danger",
                  )}
                >
                  {option.label}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </Field>
  );
}
