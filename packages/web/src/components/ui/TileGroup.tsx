"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TileGroupProps {
  /** Group label — shown visually as an eyebrow heading and exposed
   *  as the group's accessible name (`aria-label`). */
  label: string;
  /** Grid column count. Defaults to 2. */
  columns?: 1 | 2 | 3;
  children: ReactNode;
}

/**
 * Visual grouping of `Tile` buttons (or other selectable controls)
 * with a label. Exposed as a `role="group"` so assistive technology
 * announces the grouping, and queryable via
 * `getByRole("group", { name: <label> })` in tests.
 */
export function TileGroup({ label, columns = 2, children }: TileGroupProps) {
  return (
    <div role="group" aria-label={label}>
      <p className="label-eyebrow mb-2">{label}</p>
      <div
        className={cn(
          "grid gap-2",
          columns === 1 && "grid-cols-1",
          columns === 2 && "grid-cols-2",
          columns === 3 && "grid-cols-3",
        )}
      >
        {children}
      </div>
    </div>
  );
}

interface TileProps {
  /** Whether this tile represents the currently chosen value. */
  selected: boolean;
  /** Visual treatment. Use `danger` for destructive or foul-flavored
   *  choices (red accent on selection). Ignored when `accentColor`
   *  is provided. */
  variant?: "default" | "danger";
  /** Optional explicit accent color (hex string, e.g. team color).
   *  When set, overrides the `variant`-based accent for the selected
   *  state: the border and text take the color, and the background is
   *  tinted with ~10% alpha. The unselected state stays neutral so
   *  contrast against the modal background remains readable. */
  accentColor?: string;
  onClick: () => void;
  children: ReactNode;
}

/**
 * A single selectable tile button. Mirrors the visual idiom of
 * `ActionModal`'s ActionTile so different modals feel consistent.
 * Use inside a `TileGroup`.
 */
export function Tile({
  selected,
  variant = "default",
  accentColor,
  onClick,
  children,
}: TileProps) {
  const useCustomAccent = accentColor !== undefined;
  // Selected + custom accent → inline-style the border/text/bg. We
  // append `1A` (≈10% alpha) to the hex for the background tint; this
  // works for the 6-digit hex format produced by the team color picker.
  const customStyle: CSSProperties | undefined =
    useCustomAccent && selected
      ? {
          borderColor: accentColor,
          color: accentColor,
          backgroundColor: `${accentColor}1A`,
        }
      : undefined;

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      style={customStyle}
      className={cn(
        "flex items-center justify-center px-3 py-2 border text-sm font-medium",
        "transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        // Variant-based styling is skipped entirely when accentColor is set.
        !useCustomAccent && variant === "danger" && selected && "border-danger text-danger bg-danger/10",
        !useCustomAccent &&
          variant === "danger" &&
          !selected &&
          "border-surface-border text-ink-muted bg-surface-raised hover:border-danger/60",
        !useCustomAccent && variant === "default" && selected && "border-accent text-accent bg-accent/10",
        !useCustomAccent &&
          variant === "default" &&
          !selected &&
          "border-surface-border text-ink-muted bg-surface-raised hover:border-accent/60",
        // Custom-accent unselected: neutral base.
        useCustomAccent &&
          !selected &&
          "border-surface-border text-ink-muted bg-surface-raised hover:border-accent/60",
      )}
    >
      {children}
    </button>
  );
}
