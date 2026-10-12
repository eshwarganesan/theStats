/**
 * Platform-neutral persistence layer for the game state.
 *
 * Every function that touches storage takes a `KeyValueStorage` — the
 * synchronous `getItem`/`setItem`/`removeItem` subset shared by browser
 * `localStorage` and React Native MMKV. Each platform owns the decision
 * of which backing store to pass in (web: `packages/web/src/lib/persistence.ts`).
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
  PossessionArrowDirection,
  Side,
  Team,
} from "@thestats/core";

export const GAME_STORAGE_KEY = "thestats.game.v1";
export const CLOCK_CHECKPOINT_KEY = "thestats.clock.v1";

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
  /** Alternating-possession arrow direction (feature 007). Optional for
   *  backward compatibility — records persisted before feature 007 lack
   *  this field; the store's `merge` callback substitutes `'unset'`. */
  possessionArrow?: PossessionArrowDirection;
  onCourt: { home: string[]; away: string[] };
}

// ─── Storage abstraction ───────────────────────────────────────────────

/**
 * Minimal synchronous key-value store. Synchronous on purpose: the
 * persist `merge` callback and `hydrateFromLibrary` read the clock
 * checkpoint inline, so an async store would change restore semantics.
 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
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
  // possessionArrow is optional (feature 007 added it post-1.0; older
  // records lack the field). When present it MUST be one of the three
  // literal values; an unknown value invalidates the record.
  if (
    "possessionArrow" in raw &&
    raw.possessionArrow !== undefined &&
    raw.possessionArrow !== "unset" &&
    raw.possessionArrow !== "home" &&
    raw.possessionArrow !== "away"
  ) {
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

export function parseClockCheckpoint(raw: string): ClockCheckpoint | null {
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

export function readClockCheckpoint(
  storage: KeyValueStorage,
): ClockCheckpoint | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(CLOCK_CHECKPOINT_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  return parseClockCheckpoint(raw);
}

export function writeClockCheckpoint(
  storage: KeyValueStorage,
  checkpoint: ClockCheckpoint,
): void {
  try {
    storage.setItem(CLOCK_CHECKPOINT_KEY, JSON.stringify(checkpoint));
  } catch {
    // Quota, security, etc. Persistence is best-effort — the
    // storage-unavailable modal has already informed the user.
  }
}

// ─── Clear ─────────────────────────────────────────────────────────────

export function clearPersistedGame(storage: KeyValueStorage): void {
  try {
    storage.removeItem(GAME_STORAGE_KEY);
  } catch {
    // ignore
  }
  try {
    storage.removeItem(CLOCK_CHECKPOINT_KEY);
  } catch {
    // ignore
  }
}

// ─── Storage adapters used by the persist middleware ──────────────────

/**
 * In-memory fallback used when the platform store is unavailable
 * (Safari private mode, quota errors, SSR). Keeps the running app
 * functional even though restart recovery cannot work in this session.
 */
export function createMemoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem(key): string | null {
      return data.get(key) ?? null;
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
 * Storage wrapper that intercepts a malformed game-record payload
 * before Zustand's `createJSONStorage` can throw a `JSON.parse` error.
 * Zustand's `persist` middleware does NOT call our `merge` callback when
 * the underlying storage throws — it silently falls back to initial
 * state and leaves the bad payload in place. That would defeat FR-008
 * and leave the user stuck on a corrupted record forever. The wrapper
 * eagerly cleans up at the storage layer and notifies the recovery
 * banner exactly once per load.
 */
export function createGuardedStorage(
  storage: KeyValueStorage,
): KeyValueStorage {
  return {
    removeItem(key): void {
      storage.removeItem(key);
    },
    setItem(key, value): void {
      storage.setItem(key, value);
    },
    getItem(key): string | null {
      const raw = storage.getItem(key);
      if (raw === null) return null;
      // Only validate the game record. The clock checkpoint is read by
      // our own code (readClockCheckpoint) which already handles bad
      // JSON.
      if (key !== GAME_STORAGE_KEY) return raw;
      try {
        JSON.parse(raw);
      } catch {
        clearPersistedGame(storage);
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
