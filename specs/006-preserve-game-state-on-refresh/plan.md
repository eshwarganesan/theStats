# Implementation Plan: Preserve Game State on Browser Refresh

**Branch**: `006-preserve-game-state-on-refresh` | **Date**: 2026-06-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-preserve-game-state-on-refresh/spec.md`

## Summary

Add client-side persistence to the existing Zustand game store so a browser refresh restores the in-progress game (setup-phase too) within 1 second of the clock value it showed at refresh, with the clock and any break countdown paused on reload. Use `localStorage` via Zustand's `persist` middleware with `partialize` that excludes the per-frame fields (`clockSeconds`, `breakSeconds`, `clockRunning`); a small sibling effect writes a 1-Hz clock checkpoint and a synchronous final write on `pagehide`/`visibilitychange` so the restored clock is ≤1 s off. The home page's "New Game" entry point now wipes persistence before navigating to `/setup`. A one-time modal warns when `localStorage` is unavailable (private browsing, quota errors). Full E2E coverage in Playwright over every acceptance scenario.

## Technical Context

**Language/Version**: TypeScript 5.6.3 (strict mode, no escape hatches per Constitution Principle II)
**Primary Dependencies**: Next.js 15 (App Router), React 19, Zustand 5 (existing — using its `persist` middleware), Tailwind CSS 3.4. No new runtime deps.
**Storage**: Browser `localStorage` only. Single key (`thestats.game.v1`) holds the persisted partial of the game state; a sibling key (`thestats.clock.v1`) holds the clock checkpoint `{ clockSeconds, breakSeconds, savedAt }`. No server-side or Supabase involvement for this feature.
**Testing**: Vitest + @testing-library/react for unit/component (store partialize, rehydration, clock checkpoint, modal). Playwright for E2E covering every acceptance scenario in the spec (refresh during live, refresh during break, refresh during setup, refresh of finished game, "New Game" wipes state, storage-unavailable modal).
**Target Platform**: Browser — Chromium-class engines (Playwright project is Desktop Chrome; production targets tablets and phones courtside per Principle IV).
**Project Type**: Web application — extends the existing `packages/web/` Next.js workspace; no new packages, no backend changes.
**Performance Goals**: Restore-to-live-view within 2 s on a mid-tier mobile device (SC-003). No regression on Principle IV's 100 ms action-to-UI budget (the design avoids per-frame localStorage writes via `partialize` + 1-Hz checkpointing).
**Constraints**: Restored clock value within 1 s of its value at refresh (FR-005/FR-006). No wall-clock catch-up across the refresh gap (Out of Scope). No persistence of transient UI state (FR-010). Single device/browser only (FR-012).
**Scale/Scope**: Persisted record must scale to ≥500 events without noticeable lag (FR-011). One persisted game record per browser at a time (Assumptions).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Test-Driven Development (NON-NEGOTIABLE) | PASS | Every task has a failing test first. Vitest covers store-level partialize/rehydration/checkpoint and the storage-unavailable modal; Playwright covers all six spec acceptance scenarios. |
| II. Strict Type Safety | PASS | New `lib/persistence.ts` and clock-checkpoint hook are fully typed; rehydrated payload validated with a typed parser, never cast with `as`. Schema version field guards future drift. |
| III. Component-Driven Architecture | PASS | One new presentational component (`StorageUnavailableModal`). The persistence wiring lives in `lib/persistence.ts` (data) and a `useClockCheckpoint` hook (effect) — no concern-mixing. |
| IV. Performant & Responsive UX | PASS | `partialize` excludes per-frame fields so user actions trigger at most one localStorage write each. Checkpoint runs at 1 Hz max plus on `pagehide`/`visibilitychange`. Rehydration is sync from `localStorage` — well under SC-003's 2 s target. |
| V. Engineering Discipline & Industry Standards | PASS | No new runtime deps. Keys namespaced and versioned (`thestats.game.v1`, `thestats.clock.v1`). No secrets. Lint/format/typecheck stay green. |
| VI. Secure & Typed Backend Boundary (NON-NEGOTIABLE) | N/A | Feature is purely client-side. No route handler, no server action, no schema change. |

No violations to track in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/006-preserve-game-state-on-refresh/
├── plan.md              # This file (/speckit.plan output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── persistence-module.md
│   ├── store-rehydration.md
│   └── storage-unavailable-modal.md
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

This feature extends the existing `packages/web/` Next.js workspace. No new packages.

```text
packages/web/
├── src/
│   ├── lib/
│   │   ├── store.ts                      # MODIFIED — wrap with persist middleware + partialize
│   │   ├── persistence.ts                # NEW — storage adapter, schema version, parse/serialize, availability probe
│   │   ├── persistence.test.ts           # NEW — Vitest: serialize round-trip, parse rejects corrupt payloads, availability probe handles thrown SecurityError
│   │   └── store.test.ts                 # MODIFIED — add cases for rehydration setting clockRunning=false, partialize excluding per-frame fields
│   ├── hooks/
│   │   ├── useClockCheckpoint.ts         # NEW — 1-Hz checkpoint write + pagehide/visibilitychange final write
│   │   └── useClockCheckpoint.test.ts    # NEW — Vitest: writes at ≤1 Hz, final write on visibilitychange, no-op when clock not running
│   ├── components/
│   │   └── shell/
│   │       ├── StorageUnavailableModal.tsx       # NEW — one-time blocking modal (FR-009)
│   │       └── StorageUnavailableModal.test.tsx  # NEW — Vitest + Testing Library
│   ├── app/
│   │   ├── layout.tsx                    # MODIFIED — mount the storage-unavailable modal at the root layer
│   │   ├── game/
│   │   │   └── layout.tsx                # MODIFIED — mount useClockCheckpoint alongside useGameClock
│   │   └── page.tsx                      # MODIFIED — home page "New Game" button wipes persistence then navigates to /setup
│   └── components/ui/
│       └── (no new primitives — Button/Modal patterns already exist)
└── tests/
    └── e2e/
        └── persistence.spec.ts           # NEW — covers all six acceptance scenarios + storage-unavailable modal
```

**Structure Decision**: Extend the existing `packages/web/` Next.js workspace. The Zustand store remains the single source of truth; `persist` middleware wraps it. A small `lib/persistence.ts` module owns the storage key, the version, the typed parser, and the availability probe — keeping the store free of storage-API concerns. A `useClockCheckpoint` hook owns the 1-Hz clock-value write and the `pagehide`/`visibilitychange` final write. The storage-unavailable modal is a presentational component mounted at the root layout. No new packages, no backend changes.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations to justify. Table intentionally omitted.
