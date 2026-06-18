# Phase 1 Data Model: Preserve Game State on Browser Refresh

**Branch**: `006-preserve-game-state-on-refresh` | **Date**: 2026-06-07

This feature introduces no new domain entities. It introduces **two persisted records** in `localStorage` plus a **storage availability signal** read at startup. The in-memory Zustand store shape from `packages/web/src/lib/store.ts` is unchanged; the persistence layer is a wrapper.

---

## Persisted records (localStorage)

### `thestats.game.v1` — persisted game record

A JSON-serialized snapshot of the `partialize`d game state. Written automatically by Zustand's `persist` middleware on every store mutation.

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `schemaVersion` | `1` (literal) | constant | Bumped on any breaking change to this shape. Unrecognized values → corrupted-record fallback (FR-008). |
| `homeTeam` | `Team` (from `@thestats/core`) | store | Full team record including roster. |
| `awayTeam` | `Team` | store | Full team record including roster. |
| `settings` | `GameSettings` | store | Includes format, periods, period length, timeout counts, overtime flags. |
| `status` | `GameStatus` | store | One of `setup`, `ready`, `live`, `timeout`, `period-break`, `finished`. |
| `currentPeriod` | `number` | store | 1-based; > `settings.periods` indicates overtime. |
| `events` | `GameEvent[]` | store | Full event history in chronological order. Authoritative source for stats. |
| `possession` | `Side \| null` | store | Which team has the ball. |
| `onCourt` | `{ home: string[]; away: string[] }` | store | Cached lineup IDs (derived from substitution events; cached for restore convenience). |

**Excluded from this record (handled by clock checkpoint or rehydration logic instead)**:
- `clockSeconds` — updates every animation frame; would dominate write volume. Stored in `thestats.clock.v1` instead.
- `breakSeconds` — same reason. Stored in `thestats.clock.v1`.
- `clockRunning` — never persisted; always restored as `false` per FR-005/FR-006.

**Validation rules on rehydrate**:
- JSON must parse without error.
- `schemaVersion` must equal `1`.
- Top-level field set must match the typed parser exactly (no missing fields; unknown fields rejected to preserve forward-compat predictability).
- `status` must be a known `GameStatus` literal.
- `events` must be an array; each element passes a discriminated-union shape check by `type`.
- Failure on any of these → delete both keys, fall back to setup screen, surface the "prior game could not be recovered" banner.

### `thestats.clock.v1` — clock checkpoint

A small JSON blob written at most once per second while the live clock or break countdown is running, and once synchronously on `pagehide` / `visibilitychange: hidden`.

| Field | Type | Notes |
|-------|------|-------|
| `schemaVersion` | `1` (literal) | Bumped independently of the game record schema. |
| `clockSeconds` | `number` | Remaining seconds in the current period at the moment of the write. |
| `breakSeconds` | `number` | Remaining seconds on the active timeout / period-break countdown, or `0`. |
| `savedAt` | `number` | `Date.now()` at the time of the write. Diagnostic only — not used for wall-clock arithmetic (spec rules that out). |

**Validation rules on rehydrate**:
- JSON must parse.
- `schemaVersion === 1`.
- `clockSeconds` and `breakSeconds` are non-negative finite numbers.
- Failure → ignore the checkpoint, use the values from `thestats.game.v1` (which fall back to `settings.periodSeconds` and `0` for a fresh game). The main record fallback path still drives the user notice.

---

## In-memory entities

### `PersistenceAvailability`

A startup signal read once and exposed via a small module/context. Not stored in the Zustand store (it's a property of the browser environment, not the game).

| Field | Type | Notes |
|-------|------|-------|
| `localStorageAvailable` | `boolean` | Result of the canary probe in `lib/persistence.ts:isStorageAvailable()`. `false` when the probe throws (Safari private mode `SecurityError`, quota error, undefined `window.localStorage`). |
| `recoveryFailed` | `boolean` | `true` when on this load we detected a corrupted prior record and deleted it. Drives the dismissable banner. Reset to `false` after the user dismisses. |

State transitions:
- On app mount: probe → set `localStorageAvailable`. If `true`, attempt rehydrate → on parse/validate failure, delete keys and set `recoveryFailed = true`.
- On modal "Continue without saving" click: no state mutation, modal hidden via Zustand-independent context.
- On banner dismiss: `recoveryFailed = false`.

---

## Existing in-memory entities (unchanged)

The Zustand store's `GameState` interface in `packages/web/src/lib/store.ts` is **not modified** — neither its fields nor its actions. The persistence middleware operates entirely externally. This preserves Constitution Principle V (no premature abstraction) and keeps the store's existing test surface intact.

The one effective behavioral change is that the store is rehydrated synchronously from `localStorage` on first Client-Component render rather than starting from `INITIAL_SETTINGS` — but this is invisible to the store's consumers and to its unit tests (which can opt out of the middleware by importing the store factory directly, see `contracts/store-rehydration.md`).
