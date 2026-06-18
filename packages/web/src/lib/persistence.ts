/**
 * Client-side persistence layer for the game state.
 *
 * Owns every direct `localStorage` call in the codebase. The Zustand
 * store reaches storage through the `persist` middleware wired here; the
 * clock-checkpoint hook calls `writeClockCheckpoint` / `readClockCheckpoint`;
 * the home-page "New Game" button calls `clearPersistedGame`; the
 * storage-unavailable modal calls `isStorageAvailable`. Nothing else may
 * touch `window.localStorage` directly.
 *
 * Schema versions are independent per key: the game record and the
 * clock checkpoint can evolve on their own cadence. A version mismatch
 * causes the offending key to be ignored and (for the game record)
 * cleared, with a single `notifyRecoveryFailed()` to drive the
 * dismissable banner.
 */

import type {
  GameEvent,
  GameSettings,
  GameStatus,
  Side,
  Team,
} from "@thestats/core";

export const GAME_STORAGE_KEY = "thestats.game.v1";
export const CLOCK_CHECKPOINT_KEY = "thestats.clock.v1";

const PROBE_KEY = "thestats.probe.v1";

export interface ClockCheckpoint {
  schemaVersion: 1;
  clockSeconds: number;
  breakSeconds: number;
  savedAt: number;
}

export interface PersistedGameRecord {
  schemaVersion: 1;
  homeTeam: Team;
  awayTeam: Team;
  settings: GameSettings;
  status: GameStatus;
  currentPeriod: number;
  events: GameEvent[];
  possession: Side | null;
  onCourt: { home: string[]; away: string[] };
}

// ─── Storage availability ──────────────────────────────────────────────

export function isStorageAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const ls = window.localStorage;
    ls.setItem(PROBE_KEY, "1");
    ls.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

// ─── Game record parsing ───────────────────────────────────────────────

const VALID_STATUSES: ReadonlySet<GameStatus> = new Set([
  "setup",
  "ready",
  "live",
  "timeout",
  "period-break",
  "finished",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidStatus(value: unknown): value is GameStatus {
  return typeof value === "string" && VALID_STATUSES.has(value as GameStatus);
}

const REQUIRED_FIELDS = [
  "schemaVersion",
  "homeTeam",
  "awayTeam",
  "settings",
  "status",
  "currentPeriod",
  "events",
  "possession",
  "onCourt",
] as const;

export function parseGameRecord(raw: unknown): PersistedGameRecord | null {
  if (!isObject(raw)) return null;
  if (raw.schemaVersion !== 1) return null;
  for (const field of REQUIRED_FIELDS) {
    if (!(field in raw)) return null;
  }
  if (!isValidStatus(raw.status)) return null;
  if (!Array.isArray(raw.events)) return null;
  if (typeof raw.currentPeriod !== "number") return null;
  if (!isObject(raw.homeTeam) || !isObject(raw.awayTeam)) return null;
  if (!isObject(raw.settings)) return null;
  if (!isObject(raw.onCourt)) return null;
  if (raw.possession !== null && raw.possession !== "home" && raw.possession !== "away") {
    return null;
  }
  // Trust the inner shape from here — the parser's job is to reject
  // obviously malformed records, not to deep-validate every nested
  // field. A bad inner field is caught downstream by TS at usage sites
  // or surfaces as a no-op in the UI.
  return raw as unknown as PersistedGameRecord;
}

// ─── Clock checkpoint ──────────────────────────────────────────────────

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function readClockCheckpoint(): ClockCheckpoint | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(CLOCK_CHECKPOINT_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(parsed)) return null;
  if (parsed.schemaVersion !== 1) return null;
  if (!isFiniteNonNegative(parsed.clockSeconds)) return null;
  if (!isFiniteNonNegative(parsed.breakSeconds)) return null;
  if (typeof parsed.savedAt !== "number") return null;
  return {
    schemaVersion: 1,
    clockSeconds: parsed.clockSeconds,
    breakSeconds: parsed.breakSeconds,
    savedAt: parsed.savedAt,
  };
}

export function writeClockCheckpoint(checkpoint: ClockCheckpoint): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CLOCK_CHECKPOINT_KEY,
      JSON.stringify(checkpoint),
    );
  } catch {
    // Quota, security, etc. Persistence is best-effort — the
    // storage-unavailable modal has already informed the user.
  }
}

// ─── Clear ─────────────────────────────────────────────────────────────

export function clearPersistedGame(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GAME_STORAGE_KEY);
  } catch {
    // ignore
  }
  try {
    window.localStorage.removeItem(CLOCK_CHECKPOINT_KEY);
  } catch {
    // ignore
  }
}

// ─── Storage adapters used by the persist middleware ──────────────────

/**
 * In-memory `Storage` fallback used when `localStorage` is unavailable
 * (Safari private mode, quota errors, SSR). Keeps the running app
 * functional even though refresh recovery cannot work in this session.
 */
export function createNoopStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length(): number {
      return data.size;
    },
    clear(): void {
      data.clear();
    },
    getItem(key): string | null {
      return data.has(key) ? data.get(key)! : null;
    },
    key(index): string | null {
      return Array.from(data.keys())[index] ?? null;
    },
    removeItem(key): void {
      data.delete(key);
    },
    setItem(key, value): void {
      data.set(key, value);
    },
  };
}

/**
 * `localStorage` wrapper that intercepts a malformed game-record payload
 * before Zustand's `createJSONStorage` can throw a `JSON.parse` error.
 * Zustand's `persist` middleware does NOT call our `merge` callback when
 * the underlying storage throws — it silently falls back to initial
 * state and leaves the bad payload in place. That would defeat FR-008
 * and leave the user stuck on a corrupted record forever. The wrapper
 * eagerly cleans up at the storage layer and notifies the recovery
 * banner exactly once per load.
 */
export function createGuardedLocalStorage(): Storage {
  const ls = window.localStorage;
  return {
    get length(): number {
      return ls.length;
    },
    clear(): void {
      ls.clear();
    },
    key(index): string | null {
      return ls.key(index);
    },
    removeItem(key): void {
      ls.removeItem(key);
    },
    setItem(key, value): void {
      ls.setItem(key, value);
    },
    getItem(key): string | null {
      const raw = ls.getItem(key);
      if (raw === null) return null;
      // Only validate the game record. The clock checkpoint is read by
      // our own code (readClockCheckpoint) which already handles bad
      // JSON.
      if (key !== GAME_STORAGE_KEY) return raw;
      try {
        JSON.parse(raw);
      } catch {
        clearPersistedGame();
        notifyRecoveryFailed();
        return null;
      }
      return raw;
    },
  };
}

// ─── Recovery-failed pubsub ────────────────────────────────────────────

type RecoveryCallback = () => void;
const recoverySubscribers = new Set<RecoveryCallback>();

export function subscribeRecoveryFailed(cb: RecoveryCallback): () => void {
  recoverySubscribers.add(cb);
  return () => {
    recoverySubscribers.delete(cb);
  };
}

export function notifyRecoveryFailed(): void {
  for (const cb of recoverySubscribers) {
    try {
      cb();
    } catch {
      // A misbehaving subscriber must not block other subscribers.
    }
  }
}
