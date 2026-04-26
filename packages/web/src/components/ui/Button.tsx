"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "xl";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-accent text-surface hover:bg-accent-hover active:bg-accent-hover disabled:bg-accent-muted disabled:text-ink-dim",
  secondary:
    "bg-surface-raised text-ink border border-surface-border hover:bg-surface-hover disabled:text-ink-dim",
  ghost:
    "bg-transparent text-ink hover:bg-surface-hover disabled:text-ink-dim",
  danger:
    "bg-danger/90 text-white hover:bg-danger disabled:bg-danger/30",
  outline:
    "bg-transparent text-ink border border-surface-border hover:border-accent hover:text-accent disabled:text-ink-dim disabled:border-surface-border",
};

const sizeStyles: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-sm",
  xl: "h-16 px-8 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", fullWidth, children, ...props },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2",
          "font-medium uppercase tracking-wider",
          "transition-colors duration-150",
          "disabled:cursor-not-allowed",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          variantStyles[variant],
          sizeStyles[size],
          fullWidth && "w-full",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
