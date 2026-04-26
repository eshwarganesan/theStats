import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names, deduplicating conflicting utilities.
 * Standard helper used throughout the app so component consumers can
 * pass overrides via a `className` prop.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Generate a short, collision-resistant identifier.
 * Uses `crypto.randomUUID` when available and falls back to a simple
 * time-plus-random string (e.g. during SSR in older environments).
 */
export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Format a clock value (seconds) as `MM:SS` or, when under a minute,
 * `SS.T` to mirror how NBA/FIBA scoreboards display the final seconds.
 */
export function formatClock(seconds: number): string {
  const clamped = Math.max(0, seconds);
  if (clamped < 60) {
    const whole = Math.floor(clamped);
    const tenths = Math.floor((clamped - whole) * 10);
    return `${whole.toString().padStart(2, "0")}.${tenths}`;
  }
  const mins = Math.floor(clamped / 60);
  const secs = Math.floor(clamped % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Ordinal form of a period number — 1st, 2nd, 3rd, 4th, OT1, OT2…
 * `regularPeriods` allows OT to begin numbering from 1 once past it.
 */
export function formatPeriod(period: number, regularPeriods: number): string {
  if (period <= regularPeriods) {
    const ordinals = ["", "1st", "2nd", "3rd", "4th", "5th", "6th"];
    return ordinals[period] ?? `${period}th`;
  }
  const otNum = period - regularPeriods;
  return otNum === 1 ? "OT" : `OT${otNum}`;
}
