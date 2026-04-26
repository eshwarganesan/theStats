"use client";

import { forwardRef, type InputHTMLAttributes, useId } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, error, id, ...props }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    return (
      <div className="flex flex-col gap-1.5">
        {label ? (
          <label htmlFor={inputId} className="label-eyebrow">
            {label}
          </label>
        ) : null}
        <input
          id={inputId}
          ref={ref}
          className={cn(
            "h-11 px-3 bg-surface-raised border border-surface-border",
            "text-ink placeholder:text-ink-dim",
            "transition-colors duration-150",
            "focus:border-accent focus:outline-none",
            error && "border-danger focus:border-danger",
            className,
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint ? `${inputId}-hint` : undefined}
          {...props}
        />
        {error ? (
          <p className="text-xs text-danger">{error}</p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="text-xs text-ink-dim">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);

Input.displayName = "Input";
