import type { ReactNode } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";

import { cx } from "@/lib/cx";

/** A small uppercase label above a control. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="gap-1.5">
      <Text className="text-xs uppercase tracking-widest text-ink-muted">{label}</Text>
      {children}
    </View>
  );
}

export const INPUT_CLASS =
  "rounded-lg border border-surface-border bg-surface-elevated px-3 py-2.5 text-base text-ink";

/** A labelled text input. VoiceOver reads the label as the input's name. */
export function TextField({
  label,
  className,
  ...input
}: TextInputProps & { label: string; className?: string }) {
  return (
    <Field label={label}>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#737373"
        className={cx(INPUT_CLASS, className)}
        {...input}
      />
    </Field>
  );
}
