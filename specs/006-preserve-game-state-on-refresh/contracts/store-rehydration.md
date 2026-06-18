# Contract: Store rehydration and `persist` middleware integration

**Branch**: `006-preserve-game-state-on-refresh`

This contract specifies exactly how `packages/web/src/lib/store.ts` is wrapped with Zustand's `persist` middleware, and the invariants the integration must hold.

## Middleware composition

The store is currently wrapped with `subscribeWithSelector`. Add `persist` as the outer middleware so subscribers still fire on rehydrated state:

```ts
export const useGameStore = create<GameState>()(
  persist(
    subscribeWithSelector((set, get) => ({ /* existing implementation */ })),
    {
      name: GAME_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => (isStorageAvailable() ? localStorage : noopStorage)),
      partialize,
      merge,
      onRehydrateStorage,
    },
  ),
);
```

A `noopStorage` (in-memory `Map`-backed) keeps the app functional when `localStorage` is unavailable. The storage-unavailable modal is the user-facing signal; this adapter is the technical fallback.

## `partialize`

```ts
function partialize(state: GameState): PersistedGameRecord {
  return {
    schemaVersion: 1,
    homeTeam: state.homeTeam,
    awayTeam: state.awayTeam,
    settings: state.settings,
    status: state.status,
    currentPeriod: state.currentPeriod,
    events: state.events,
    possession: state.possession,
    onCourt: state.onCourt,
  };
}
```

**Excluded fields**: `clockSeconds`, `breakSeconds`, `clockRunning`. These either update every animation frame (would dominate write volume — Principle IV regression) or must always restore as paused (FR-005/FR-006 — restored from the clock checkpoint instead, with `clockRunning` always `false`).

## `merge`

```ts
function merge(persisted: unknown, current: GameState): GameState {
  const parsed = parseGameRecord(persisted);
  if (!parsed) {
    clearPersistedGame();
    notifyRecoveryFailed();
    return current;
  }
  const checkpoint = readClockCheckpoint();
  return {
    ...current,
    homeTeam: parsed.homeTeam,
    awayTeam: parsed.awayTeam,
    settings: parsed.settings,
    status: parsed.status,
    currentPeriod: parsed.currentPeriod,
    events: parsed.events,
    possession: parsed.possession,
    onCourt: parsed.onCourt,
    clockSeconds: checkpoint?.clockSeconds ?? parsed.settings.periodSeconds,
    breakSeconds: checkpoint?.breakSeconds ?? 0,
    clockRunning: false,
  };
}
```

## `onRehydrateStorage`

```ts
const onRehydrateStorage = () => (state: GameState | undefined) => {
  if (!state) return;
  if (state.clockRunning) {
    useGameStore.setState({ clockRunning: false });
  }
};
```

Defense in depth — `merge` already forces `clockRunning: false`, but `onRehydrateStorage` guarantees it even if the merge path is bypassed by a future change.

## Test entry point for `store.test.ts`

The existing store tests must continue to pass without touching `localStorage`. Provide an internal factory `createGameStore()` that returns an unwrapped store (no `persist`), used by `store.test.ts`. The exported `useGameStore` is the wrapped version. Tests for persistence behavior live in `persistence.test.ts` and exercise the middleware via a fake `Storage` implementation.

## Invariants enforced by this contract

| Invariant | Source | How enforced |
|-----------|--------|--------------|
| Clock is paused on every refresh, regardless of pre-refresh state | FR-005, FR-006 | `merge` sets `clockRunning: false`; `onRehydrateStorage` re-asserts. |
| Restored clock value within 1 s of refresh-moment value | FR-005/FR-006, Q1 clarification | `merge` reads `thestats.clock.v1` which is written at 1 Hz + on `pagehide`. |
| No persistence of transient UI state | FR-010 | `partialize` enumerates the persisted fields explicitly — nothing leaks. |
| Corrupted record → clean setup screen | FR-008 | `merge` calls `clearPersistedGame()` on parse failure, returns `current` (initial) state, and surfaces the banner via `notifyRecoveryFailed()`. |
| Storage unavailable → app still works in-session | FR-009 | `noopStorage` adapter; the user sees the modal but the in-memory store continues to function. |
| Existing store unit tests untouched by persistence | Principle V | Tests use `createGameStore()` factory; the exported `useGameStore` is the only wrapped instance. |
