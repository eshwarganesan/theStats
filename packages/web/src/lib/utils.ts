import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Project-aware tailwind-merge that knows about our custom `fontSize`
 * tokens. Without this, `text-clock` / `text-score-lg` / `text-score-xl`
 * are treated as belonging to the same `text-*` class group as colors
 * like `text-ink`, and the merge silently drops the size class when
 * both appear in the same `cn` call.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["score-xl", "score-lg", "clock"] }],
    },
  },
});

/**
 * Merge Tailwind class names, deduplicating conflicting utilities.
 * Standard helper used throughout the app so component consumers can
 * pass overrides via a `className` prop.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
