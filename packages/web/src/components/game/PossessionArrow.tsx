"use client";

import type { PossessionArrowDirection, Side } from "@thestats/core";
import { cn } from "@/lib/utils";

export interface PossessionArrowProps {
  /** Current selected direction. Drives which button is highlighted. */
  direction: PossessionArrowDirection;
  /** Called when the scorekeeper taps a NOT-currently-selected arrow.
   *  Tapping the already-selected arrow does NOT fire this handler
   *  (the no-op is enforced in the component). */
  onSelect: (side: Side) => void;
  /** When true, both arrow buttons render dimmed and non-interactive.
   *  Used for `status === 'finished'`. Defaults to `false`. */
  disabled?: boolean;
  /** Optional className for layout positioning by the parent. */
  className?: string;
}

/**
 * Reusable presentational indicator for the alternating-possession arrow
 * (spec 007). Renders two large, side-by-side arrow buttons — a left
 * arrow that selects `'home'` and a right arrow that selects `'away'`.
 *
 * Selection model (FR-006):
 *   - Tapping an arrow that is NOT currently selected fires
 *     `onSelect(side)`.
 *   - Tapping the arrow that IS currently selected is a no-op.
 *   - The `'unset'` state (neither arrow highlighted) is the start of a
 *     fresh game; there is no path back to `'unset'` through this
 *     component.
 *
 * Props in, JSX out — no Zustand subscriptions, no side-effects.
 */
export function PossessionArrow({
  direction,
  onSelect,
  disabled = false,
  className,
}: PossessionArrowProps) {
  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-1",
        className,
      )}
    >
      <span
        aria-hidden
        className="text-[0.6rem] font-mono uppercase tracking-widest text-ink-muted"
      >
        Possession
      </span>
      <div className="flex items-stretch gap-1.5">
        <ArrowButton
          side="home"
          selected={direction === "home"}
          disabled={disabled}
          onSelect={onSelect}
        />
        <ArrowButton
          side="away"
          selected={direction === "away"}
          disabled={disabled}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}

// ─── Internal ──────────────────────────────────────────────────────────────

interface ArrowButtonProps {
  side: Side;
  selected: boolean;
  disabled: boolean;
  onSelect: (side: Side) => void;
}

function ArrowButton({ side, selected, disabled, onSelect }: ArrowButtonProps) {
  const glyph = side === "home" ? "◀" : "▶";
  const label = `Possession arrow: ${side}`;

  const handleClick = () => {
    if (disabled) return;
    if (selected) return; // Tapping the already-selected arrow is a no-op.
    onSelect(side);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      aria-pressed={selected}
      aria-disabled={disabled || undefined}
      className={cn(
        "inline-flex items-center justify-center",
        "min-w-[10px] min-h-[10px] px-3 py-2",
        "text-2xl leading-none",
        "border transition-colors",
        selected
          ? "border-accent bg-accent text-surface"
          : "border-surface-border bg-surface-raised text-ink-muted hover:text-ink",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <span aria-hidden>{glyph}</span>
    </button>
  );
}
