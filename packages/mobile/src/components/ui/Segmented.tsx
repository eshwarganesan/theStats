import { Pressable, Text, View } from "react-native";

import { cx } from "@/lib/cx";

import { Field } from "./Field";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/** A labelled row of mutually exclusive choices, e.g. 5v5 / 3v3. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <Field label={label}>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} className="flex-row">
        {options.map((option, i) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={`${label}: ${option.label}`}
              accessibilityState={{ checked: selected }}
              onPress={() => {
                if (!selected) onChange(option.value);
              }}
              className={cx(
                "flex-1 items-center border py-2.5",
                i === 0 && "rounded-l-lg",
                i === options.length - 1 && "rounded-r-lg",
                selected ? "border-accent bg-accent" : "border-surface-border bg-surface-raised",
              )}
            >
              <Text
                className={cx(
                  "text-sm font-semibold uppercase tracking-widest",
                  selected ? "text-surface" : "text-ink-muted",
                )}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Field>
  );
}

export const ON_OFF: readonly SegmentedOption<"on" | "off">[] = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];
