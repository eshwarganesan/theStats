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
    // Snap to deciseconds in integer space so floating-point noise from
    // typed input (e.g. 9.1 stored as 9.0999...) doesn't drop a tenth.
    // Cap at 59.9 to avoid rolling 59.95+ into a malformed "60.0" — the
    // mm:ss branch will pick up exactly-60 and above.
    const totalTenths = Math.min(599, Math.round(clamped * 10));
    const whole = Math.floor(totalTenths / 10);
    const tenths = totalTenths % 10;
    return `${whole.toString().padStart(2, "0")}.${tenths}`;
  }
  const mins = Math.floor(clamped / 60);
  const secs = Math.floor(clamped % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Parse a user-typed clock string into total seconds.
 *
 * Accepts `mm:ss[.t]` / `m:ss[.t]` (minutes + seconds where seconds < 60,
 * with an optional single-digit tenths suffix) and pure-second shorthand
 * with optional tenths (e.g. `42`, `700`, `42.5`). Returns `null` for any
 * input that cannot be unambiguously interpreted — empty, non-numeric,
 * negative, missing components, more than one tenths digit, or seconds
 * >= 60. Callers (the store action) clamp to the per-period maximum.
 */
export function parseClock(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  if (trimmed.startsWith("-")) return null;

  if (trimmed.includes(":")) {
    const match = /^(\d+):(\d+)(?:\.(\d))?$/.exec(trimmed);
    if (!match) return null;
    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    const tenths = match[3] !== undefined ? Number(match[3]) / 10 : 0;
    if (seconds >= 60) return null;
    return minutes * 60 + seconds + tenths;
  }

  if (!/^\d+(?:\.\d)?$/.test(trimmed)) return null;
  return Number(trimmed);
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
