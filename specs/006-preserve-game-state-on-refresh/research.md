# Phase 0 Research: Preserve Game State on Browser Refresh

**Branch**: `006-preserve-game-state-on-refresh` | **Date**: 2026-06-07

All Technical Context entries in [plan.md](./plan.md) are resolved — there are no `NEEDS CLARIFICATION` markers. This document records the decisions made during planning and the alternatives that were considered.

---

## Decision 1: Storage mechanism — `localStorage` (single-key per concern)

**Decision**: Persist the game record via Zustand's `persist` middleware backed by `localStorage`, under the key `thestats.game.v1`. Persist the clock checkpoint to a separate sibling key `thestats.clock.v1`.

**Rationale**:
- User input for this command explicitly mandates `localStorage`.
- `localStorage` is synchronous, so rehydration in a Next.js Client Component happens before first paint of the game view, which keeps SC-003's 2 s restore target comfortably reachable.
- Two keys keep concerns separable: the main game record changes only on user actions (bounded write rate, small enough to never threaten the ~5 MB quota for ≥500 events); the clock checkpoint is small and overwritten in place at most once per second.
- Versioning the keys (`...v1`) lets a future breaking change land cleanly via FR-008's fallback path instead of attempting a migration.

**Alternatives considered**:
- **`sessionStorage`** — rejected: dies on tab close, defeating the entire feature for users who briefly background or close a tab.
- **IndexedDB** — rejected: async API and broader surface area for failure (transaction lifecycle, version onupgradeneeded). The dataset is far below `localStorage`'s practical limit; the extra complexity is not earned.
- **Single combined key with the clock value inside the main record** — rejected: forces the per-second clock write to re-serialize and rewrite the full event history, which violates Principle IV's 100 ms budget once the event log grows.

---

## Decision 2: Use Zustand `persist` middleware with `partialize`, not a hand-rolled `subscribe`

**Decision**: Wrap the store with `persist` from `zustand/middleware`, supply a `partialize` that emits only the fields safe to write on every store mutation, and configure `onRehydrateStorage` to force `clockRunning: false` after restore.

**Rationale**:
- `persist` already handles JSON serialize/parse, the hydration race (first paint vs restored state), and a typed `version` field with `migrate` callbacks — features we'd otherwise reinvent.
- `partialize` is the supported escape valve to keep frame-rate-updating fields (`clockSeconds`, `breakSeconds`, `clockRunning`) out of the per-mutation write path, which is the single biggest perf risk in this feature.
- `onRehydrateStorage` is the documented hook for "fix up restored state" — exactly the place to enforce FR-005/FR-006's "clock paused on reload" rule, independent of whether the checkpoint write succeeded.

**Alternatives considered**:
- **Hand-rolled `useGameStore.subscribe` writing to localStorage** — rejected: re-implements `partialize`, version handling, and rehydration race logic that `persist` already covers. The middleware is in the same package; no extra dep.
- **Periodic snapshot from a `setInterval`** — rejected: lags real user input (state can be lost between a recorded play and the next snapshot tick) and adds a permanent background timer.

---

## Decision 3: Clock checkpointing — 1 Hz while running + final write on `pagehide` / `visibilitychange`

**Decision**: A new `useClockCheckpoint` hook writes `{ clockSeconds, breakSeconds, savedAt }` to `thestats.clock.v1` at most once per second whenever either countdown is running (live clock OR break countdown), and writes one final synchronous snapshot when the page is hidden or unloaded (`pagehide` + `visibilitychange: hidden`). On rehydration, the store re-reads this key and patches the clock values, then `onRehydrateStorage` forces `clockRunning: false`.

**Rationale**:
- The clarification answer for Q1 sets ≤1 s drift as the target. A 1-Hz checkpoint trivially meets this even if the page is killed without firing `pagehide` (common on mobile). The final-write listeners shrink drift to near-zero on the common case where the browser fires them.
- `pagehide` is the most reliable hidden-unload event across desktop and mobile browsers; `visibilitychange: hidden` covers the mobile-tab-backgrounded case where the browser may kill the tab without firing `pagehide`. Writing on both is belt-and-suspenders.
- 1 Hz means at most 60 writes/minute of a ~30-byte JSON blob — well below the perf threshold that motivates excluding the per-frame fields from the main partialize in the first place.
- Driving the checkpoint from the same effect-level lifecycle as the existing `useGameClock` hook keeps both behaviors in the same architectural layer, mountable once in `app/game/layout.tsx`.

**Alternatives considered**:
- **Persist clock value on every rAF tick (~60 Hz)** — rejected: 60 localStorage writes per second is a Principle IV regression and burns wear on storage with no UX benefit over 1 Hz.
- **Wall-clock arithmetic on rehydrate** (store `(clockAtStart, startedAtWallclock)`, recompute on reload) — rejected explicitly by spec Out of Scope: "Resuming the clock 'as if no time had passed' using wall-clock arithmetic across the refresh gap." Even though we'd pause immediately after computing, the underlying mechanism is the one the spec rules out, and the 1-Hz checkpoint achieves the same UX without the wall-clock dependency.
- **Save clock value only on user-driven boundaries (event, start, stop)** — rejected: a long stretch with no events (e.g., a stoppage where the clock keeps ticking) would let drift exceed several seconds, failing Q1.

---

## Decision 4: "New Game" on the home page must wipe persistence

**Decision**: Convert the home page's `<Link href="/setup">` "New Game →" button into a Client Component button that calls `clearPersistedGame()` from `lib/persistence.ts` (deletes both `thestats.game.v1` and `thestats.clock.v1`), then calls `resetAll()` on the store, then navigates to `/setup`. The existing setup-page "Reset" button keeps its current scope (clear store only — does not wipe localStorage, since the same partialize write will overwrite the persisted record on the next mutation anyway).

**Rationale**:
- User input mandates this explicitly: *"New game on home page should now wipe localStorage and start a fresh new game."*
- Wiping before resetting means a refresh in between is safe: even if the user closes the browser between the wipe and `resetAll`, the next load lands on a clean setup screen instead of resurrecting the prior game.
- Keeping the setup-page Reset behavior unchanged avoids surprising users who currently use it to clear partial roster entries mid-setup.

**Alternatives considered**:
- **Wipe inside `resetAll`** — rejected: `resetAll` is also called during the in-app "discard finished game" flow we'd add later, and entangling storage I/O with the store reducer makes the store harder to test in isolation. Better to keep the wipe at the UI layer for the home page entry point.
- **Two-step confirm dialog** — out of scope; the spec doesn't require a confirm and adding one is a UX change that should ship separately if desired.

---

## Decision 5: Storage-unavailable detection and modal

**Decision**: Probe storage availability once at app startup via `lib/persistence.ts:isStorageAvailable()` — write/read/delete a tiny canary key inside a `try/catch`. If the probe throws (Safari private mode `SecurityError`, quota errors, or `localStorage` undefined on first paint), surface the result via a small Zustand-independent module state plus a context provider, and render `<StorageUnavailableModal />` from the root layout. The modal blocks app interaction behind a backdrop until the user clicks "Continue without saving" (an explicit acknowledgment per the Q2 clarification answer).

**Rationale**:
- A blocking modal is the chosen UX (Q2 → B). A banner risks being missed; a setup-only inline warning misses the home-page "Continue Game" path; a tip-off-time warning is too late.
- One-time-per-load (not "remember dismissal across reloads") matches the FR-009 wording — every reload re-probes and re-asks, because the user's choice to continue *was* "for this session only."
- The probe is sub-millisecond and runs once on mount. It does not introduce any layout shift risk because the modal sits above the app shell on a portal-style overlay.

**Alternatives considered**:
- **Persist the acknowledgment in `localStorage`** — self-defeating: the whole reason for the modal is that `localStorage` is broken.
- **Persist the acknowledgment in `sessionStorage`** — rejected: `sessionStorage` can fail in the same Safari private-mode scenario that triggers the modal in the first place, and even when it works, asking again on each reload is the safer default given the stakes (a scorekeeper losing a game).
- **Toast instead of modal** — rejected per Q2; toasts on mobile setup screens are too easy to miss.

---

## Decision 6: Schema version and corrupted-record handling (FR-008)

**Decision**: The persisted payload carries an integer `schemaVersion` field (currently `1`). On rehydration, if the stored value (a) cannot be JSON-parsed, (b) does not match the typed parser (Zustand `persist` rejects via thrown error or `migrate` returning `undefined`), or (c) has an unrecognized `schemaVersion`, the persistence module DELETES both keys and surfaces a one-shot "Your previous game could not be recovered" notice via the same context provider that drives the storage-unavailable modal (rendered as a non-blocking banner the user can dismiss). The app then shows the empty setup screen.

**Rationale**:
- FR-008 requires "fall back to setup, inform the user, don't crash." Deleting on bad-parse prevents the same error from re-firing forever, which would defeat the fallback.
- A non-blocking banner (rather than the blocking modal used for storage-unavailable) is appropriate because (a) the underlying capability is fine — only one record was bad, and (b) the user's task is unaffected; they just need to know their prior game is gone.
- Pinning a schema version now is the cheapest defense against future breakage — bump `v1` → `v2` whenever any field in the persisted payload changes shape.

**Alternatives considered**:
- **Keep the broken record and attempt repair on each load** — rejected: turns a one-time recoverable failure into a sticky one.
- **Block with a modal on recovery failure** — rejected: too noisy for a fault that doesn't affect the user's ability to start a new game.

---

## Decision 7: Two-tab and concurrent-edit handling

**Decision**: Out of scope for this feature (per spec). The implementation does no `storage` event listening and does not coordinate writes between tabs. The "last write wins" behavior that naturally falls out of `localStorage` is acceptable for the spec's scope.

**Rationale**:
- Spec explicitly lists "Resolving conflicts when the same game is open in two browser tabs simultaneously" as Out of Scope.
- Scorekeeping in practice happens in a single tab; the cost of coordination (BroadcastChannel, conflict resolution UI) is not earned.

**Alternatives considered**:
- **Subscribe to the `storage` event to live-sync tabs** — deferred to a future feature if real users hit it.

---

## Open questions

None. All `NEEDS CLARIFICATION` slots in the Technical Context are resolved either by the spec's existing Clarifications session or by the decisions above.
