# Contract: `lib/persistence.ts`

**Branch**: `006-preserve-game-state-on-refresh`

A small module owning every `localStorage`-touching call in this feature. The Zustand store, the clock-checkpoint hook, the home-page "New Game" button, and the storage-unavailable modal all reach the storage API exclusively through this module.

## Exports

### `GAME_STORAGE_KEY` and `CLOCK_CHECKPOINT_KEY`

```ts
export const GAME_STORAGE_KEY = "thestats.game.v1";
export const CLOCK_CHECKPOINT_KEY = "thestats.clock.v1";
```

Both keys are namespaced with `thestats.` and carry an explicit `.vN` version suffix. Bump the suffix (`v1` → `v2`) when the persisted shape changes in a breaking way.

### `isStorageAvailable(): boolean`

Synchronous probe. Writes a canary key, reads it back, deletes it, all inside a single `try/catch`. Returns `true` on success and `false` on any thrown error or undefined `window.localStorage`. Must be safe to call from a Client Component during SSR (returns `false` when `typeof window === "undefined"`).

Used by:
- The storage-unavailable modal's mount-time check.
- The `persist` middleware's `storage` adapter (returns a no-op storage when `false`).

### `readClockCheckpoint(): ClockCheckpoint | null`

Reads and validates `CLOCK_CHECKPOINT_KEY`. Returns `null` on any of: missing key, JSON parse failure, schema-version mismatch, or shape validation failure. Never throws.

### `writeClockCheckpoint(checkpoint: ClockCheckpoint): void`

Writes the checkpoint via `localStorage.setItem`. Swallows `QuotaExceededError` / `SecurityError` (caller has already opted in via the storage-availability probe, but defenses are belt-and-suspenders). Never throws.

### `clearPersistedGame(): void`

Deletes both `GAME_STORAGE_KEY` and `CLOCK_CHECKPOINT_KEY`. Called from the home-page "New Game" button and from the corrupted-record fallback path on rehydrate. Never throws.

### `parseGameRecord(raw: unknown): PersistedGameRecord | null`

The typed parser used by `persist`'s `migrate`/`merge` hooks. Validates `schemaVersion`, the top-level field set, and the `GameStatus`/`GameEvent` discriminants. Returns `null` on any failure. Does not use `as` casts; narrows via type guards on `unknown`.

### Types

```ts
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
```

All field types come from `@thestats/core`. The `schemaVersion: 1` literal is intentional — it makes a future bump a type error at every call site rather than a runtime surprise.

## Invariants

- **No throw**: every exported function either returns a value or returns `null`. The persistence layer must never crash the app (FR-008).
- **No `as` casts**: parsing uses type guards on `unknown`. (Principle II.)
- **Idempotent writes**: `clearPersistedGame` and `writeClockCheckpoint` are safe to call multiple times.
- **No cross-tab coordination**: the module does not subscribe to the `storage` event. (Two-tab handling is Out of Scope per spec.)
