import { Pressable, Text, View } from "react-native";

import { cx } from "@/lib/cx";

import { Field } from "./Field";

/**
 * A labelled − value + control for small whole numbers. Easier courtside
 * than typing into a number field, and it can't hold an invalid value.
 */
export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  format = String,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** How the value reads, e.g. minutes as "10 min". */
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const shown = format(value);
  return (
    <Field label={label}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: shown }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "increment") onChange(Math.min(max, value + step));
          else onChange(Math.max(min, value - step));
        }}
        className="flex-row items-center rounded-lg border border-surface-border bg-surface-elevated"
      >
        <StepButton
          glyph="−"
          label={`Decrease ${label}`}
          disabled={value <= min}
          onPress={() => onChange(Math.max(min, value - step))}
        />
        <Text className="flex-1 text-center text-base text-ink" style={{ fontVariant: ["tabular-nums"] }}>
          {shown}
        </Text>
        <StepButton
          glyph="+"
          label={`Increase ${label}`}
          disabled={value >= max}
          onPress={() => onChange(Math.min(max, value + step))}
        />
      </View>
    </Field>
  );
}

function StepButton({
  glyph,
  label,
  disabled,
  onPress,
}: {
  glyph: string;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cx("h-11 w-11 items-center justify-center", disabled && "opacity-30")}
    >
      <Text className="text-xl text-ink">{glyph}</Text>
    </Pressable>
  );
}
