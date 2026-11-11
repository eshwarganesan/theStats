import { Pressable, Text } from "react-native";

import { cx } from "@/lib/cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

const CONTAINER: Record<ButtonVariant, string> = {
  primary: "bg-accent",
  secondary: "border border-surface-border bg-surface-raised",
  ghost: "border border-surface-border",
  danger: "bg-danger",
};

const LABEL: Record<ButtonVariant, string> = {
  primary: "text-surface",
  secondary: "text-ink",
  ghost: "text-ink-muted",
  danger: "text-ink",
};

const PADDING: Record<ButtonSize, string> = {
  sm: "px-3 py-2",
  md: "px-4 py-3",
  lg: "px-5 py-4",
  xl: "px-6 py-5",
};

const TEXT: Record<ButtonSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
  xl: "text-xl",
};

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  /** Announced as busy by VoiceOver, e.g. while its request is in flight. */
  busy?: boolean;
  /** Read by VoiceOver instead of `label`, when the label alone is unclear. */
  accessibilityLabel?: string;
  className?: string;
}

/** The app's button: a full-height tap target with an uppercase label. */
export function Button({
  label,
  onPress,
  variant = "secondary",
  size = "md",
  disabled = false,
  busy = false,
  accessibilityLabel,
  className,
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      className={cx(
        "items-center justify-center rounded-lg",
        CONTAINER[variant],
        PADDING[size],
        disabled && "opacity-40",
        className,
      )}
    >
      <Text
        className={cx("text-center font-semibold uppercase tracking-wider", LABEL[variant], TEXT[size])}
      >
        {label}
      </Text>
    </Pressable>
  );
}
