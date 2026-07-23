# Phase 0 Research: Account Page & Saved Games Library

**Feature**: `009-account-library`
**Date**: 2026-07-22

The Technical Context on the plan had no `NEEDS CLARIFICATION` markers — the spec's own `## Clarifications` session resolved everything user-facing. The research decisions below cover the **technical** unknowns that the codebase survey surfaced, plus best-practice choices required to move to Phase 1.

---

## R-01 — Where does the write-through save happen: client hook or Route Handler?

**Decision**: Both. A client-side hook (`useLibraryWriteThrough`) subscribes to Zustand via `subscribeWithSelector` (already enabled) and, when a signed-in session is active, POSTs to `PATCH /api/games/[id]` after each committed mutation. The hook debounces writes to a small window (250 ms) and always includes an `Idempotency-Key` header so retries are safe. The Route Handler validates the body with Zod, verifies the session, checks ownership via RLS, and upserts the row.

**Rationale**:
- Zustand state changes happen in the client — that's the only place we can observe a "committed event". Doing the write-through purely from a Server Action would require every user interaction to round-trip a form submit, which breaks Constitution Principle IV (100 ms interaction target).
- Constitution Principle VI still requires the authoritative check to live at the server boundary. The client hook decides *when* to push; the Route Handler decides *whether it may succeed*.
- Debouncing at 250 ms lets a scorekeeper who fires 3–4 events in a row on a busy possession send one write instead of four, but still keeps the "last event lost on tab close" window sub-second.

**Alternatives considered**:
- **Pure Server Action per event**: Rejected — every score/foul/sub would round-trip a form submit; latency and DX both suffer.
- **Batch save on unload only**: Rejected — a tab crash or forced kill would lose everything since the last visit. FR-022 requires interruption recoverability without an explicit save.
- **Supabase realtime channels**: Rejected for v1 — assumption in the spec is last-write-wins per event across devices, not real-time collaborative editing. Realtime would be premature.

---

## R-02 — Denormalize summary fields onto `public.games` or query the JSONB blob?

**Decision**: Denormalize a small, well-known set of summary columns (`status`, `home_team_name`, `away_team_name`, `home_score`, `away_score`, `event_count`, `current_period`, `started_at`, `last_activity_at`, `finished_at`) into first-class columns on `public.games`. The full authoritative record lives in a single `state jsonb NOT NULL` column. Summary columns are written server-side inside the same transaction as `state`.

**Rationale**:
- Library rendering (`GameLibrary.tsx`) needs one row per game with team names, score, status, and start time. Reading those from JSONB for 50+ rows is slower and forces every list render to know the JSONB schema.
- Delete-confirmation for in-progress games (FR-025) needs `event_count` and `current_period` — surfacing them as columns keeps the delete confirmation path off the JSONB blob.
- Constitution Principle IV (SC-003, first batch under 2s) is realistic with denormalized columns and a `(owner_id, last_activity_at DESC)` index; less realistic if every library entry re-parses a full game record.

**Alternatives considered**:
- **Postgres generated columns** on the JSONB blob: Rejected — Supabase-supported but rebuilds on every write; couples DB schema to JSONB shape more tightly than server code writing scalar columns.
- **Fully normalized schema (separate `game_events` table, etc.)**: Rejected as premature. Feature 006 already treats the full record as an atomic blob in localStorage; matching that on the server keeps the mental model consistent and avoids a large migration when the event shape evolves.

---

## R-03 — Where does the `Profile` row come from — trigger, or lazy upsert?

**Decision**: **Lazy upsert on first read** by the Server Component that loads `/account`. The `profiles` row is created with a null `display_name` the first time an authenticated user visits the account page; further visits update the same row.

**Rationale**:
- No database trigger needed → smaller migration surface, easier to reason about in tests, no `SECURITY DEFINER` function to review.
- The account page is the only surface that reads / writes the profile row in v1. Other surfaces (e.g., app shell greetings that show the display name — Assumption "Display name is optional at first sign-in") fall back to the local part of the email if no row exists yet, so we don't need the row to exist before it is first read.
- An `INSERT ... ON CONFLICT DO NOTHING` upsert under the session's JWT interacts with RLS cleanly: the `INSERT` policy is `WITH CHECK (id = auth.uid())`, so a user can only create their own row.

**Alternatives considered**:
- **Postgres trigger on `auth.users` insert**: Rejected — requires a `SECURITY DEFINER` function to write into `public.profiles`, which the constitution flags for extra review. Not worth the complexity for a nullable display name.
- **Client-side prompt to set display name at first sign-in**: Rejected — adds a mandatory step to sign-up not required by the spec (display name is optional per assumption).

---

## R-04 — Idempotency key strategy for `POST /api/games` and `PATCH /api/games/[id]`

**Decision**: A dedicated `public.game_writes(idempotency_key text primary key, game_id uuid not null, created_at timestamptz default now())` table. Every mutating handler:

1. Reads the `Idempotency-Key` header (required; missing → 400 with `idempotency_key_required`).
2. `INSERT INTO game_writes ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING game_id`.
3. If no row was returned (conflict → already processed), return the current record with `200`.
4. Otherwise, perform the mutation and return the new state.
5. Optionally clean up rows older than 24 h via a nightly `pg_cron` job (same pattern as `0001_user_auth.sql`).

**Rationale**:
- Constitution Principle VI: "Endpoints the client can retry (recording a play, ending a quarter) MUST be safely retryable". Write-through save is retried on every network hiccup — needs true idempotency.
- Client generates one UUID per event mutation attempt; the Zustand event's `id` (already unique) is a natural source.
- Using a unique constraint enforces at the storage layer; can't be bypassed by application code.

**Alternatives considered**:
- **Trust the client to only retry on network errors**: Rejected — cannot enforce in code, and browser retry-on-navigation could double-write.
- **Upsert with client-provided game state version**: Feasible for `PATCH` but not for `POST` (no ID yet). Idempotency-key table is uniform across both.

---

## R-05 — Statsheet component: build now or descope?

**Decision**: Build a minimal statsheet component (`packages/web/src/components/game/StatSheet.tsx`) as part of this feature. The `packages/core` package already exports `PlayerStats` and `TeamStats` types; the aggregation logic that computes them from the ordered `GameEvent[]` array will live in a new pure function `computeStatSheet(events, teams)` in `packages/core/src/stats.ts` (following the existing structure of the domain layer). The `StatSheet` component consumes the result and renders a per-player + team-totals table.

**Rationale**:
- Spec Assumption "Statsheet and game log views already exist" is **incorrect** — the codebase survey found only `GameLog.tsx` in `packages/web/src/components/game/`. FR-019 and SC-005 require a statsheet on the review view. Delivering the account page without a statsheet would fail the spec.
- The stats types already live in `packages/core`. The aggregation function is pure and testable in isolation (Principle I / III).
- Read-only rendering is straightforward with existing UI primitives; no new UI library.

**Alternatives considered**:
- **Descope: review view = game log only**: Rejected — leaves SC-005 partially unmeasurable and drops the user-requested "statsheet" review affordance.
- **Blocking follow-up feature for statsheet**: Rejected — decoupling the two adds coordination cost with no user benefit. The statsheet is small enough to include here.

**Spec follow-up**: The spec's Assumption "Statsheet and game log views already exist" is stale. It will be corrected in a spec-update commit alongside this plan.

---

## R-06 — Sidebar collapsed/expanded state: local UI only, or persisted?

**Decision**: Persist the collapsed/expanded state in `localStorage` under a new key `thestats.sidebar.v1`. Default on first load is **expanded** on ≥ 1024 px viewports (desktop) and **collapsed** on smaller viewports (mobile / tablet). The state is a single boolean; no server round-trip.

**Rationale**:
- Constitution Principle IV — 360 px baseline. On mobile, a permanently expanded sidebar covers the scorekeeping surface. Auto-collapse on load matches the courtside use case (a tablet or phone at the scorer's table).
- Persisting the state avoids a "why did it collapse again?" surprise on every reload.
- No user identity involved; a device-scoped preference is fine.

**Alternatives considered**:
- **Session-only state (no persistence)**: Rejected — annoying on repeated reloads.
- **Store on `public.profiles`**: Rejected — cross-device sync of a UI toggle is over-engineered.
- **Tailwind responsive-only (no toggle)**: Rejected — the spec's app shell entry point (FR-001) implies user-initiated collapse.

---

## R-07 — How the "continue an interrupted game" flow hydrates the Zustand store on a fresh device

**Decision**: When the user clicks "Continue" on an in-progress library entry:

1. Client calls `GET /api/games/[id]` — returns the full `state` blob (server-side RLS ensures ownership).
2. Client calls `store.hydrateFromLibrary(record)`, a new action on the Zustand store that:
   - Rejects the load if the local Zustand state is not on the setup screen and the user has not confirmed via the "already have a local game" prompt (FR-017).
   - Sets the persisted slice to the incoming record.
   - Forces the clock and any break countdown into a paused state (per FR-016, same rule as feature 006).
3. Client `router.push('/')` to land on the live game view.

**Rationale**:
- Reuses the same "restore then pause" invariant that feature 006 already implements for local persistence — the only difference is the source of the record.
- Keeping the hydration action on the store keeps the write-through hook (R-01) and the restore action symmetric and testable.
- FR-017 becomes a client-side guard: "the app must not silently discard local unsaved work."

**Alternatives considered**:
- **Server-side redirect to `/` with `game=<id>` and Server Component pre-hydration**: Rejected — Zustand is a client-side store; pre-hydration would still require a client wrapper. Adding a query param muddies the URL for no gain.

---

## R-08 — Sign-in prompt for anonymous local game (FR-024): where does it live?

**Decision**: A new Client Component `AnonymousGameOnSignInPrompt.tsx` mounts at the login page. After a successful `signInWithPassword` returns, before the router navigates, the client checks whether a local in-progress game exists in `localStorage`. If yes, it renders a `Modal` blocking the redirect with three choices:

- **Save to my account**: `POST /api/games` with the local game state → on success, clear local key, then redirect to the original destination.
- **Keep local only**: leave the local key untouched, redirect. (The account library will not contain the local game — user is expected to start a new game if they want it in the library.)
- **Discard**: clear the local key, redirect.

The prompt is shown at most once per sign-in event. The sign-in flow blocks (no redirect) until a choice is recorded.

**Rationale**:
- Matches the FR-024 wording — "sign-in flow MUST NOT complete until the user makes a choice".
- Living on the login page rather than in a global overlay keeps the trigger contextual and testable.
- Uses the existing `<Modal>` primitive.

**Alternatives considered**:
- **Server Action inside the sign-in Route Handler**: Rejected — the local game lives in the browser's `localStorage`; the server has no way to observe it.
- **Show the prompt on `/account` instead of on the login page**: Rejected — the user could land on any other page after sign-in and never see it.

---

## R-09 — Where the Supabase-generated TS types live and how they're regenerated

**Decision**: Types are generated by the developer running:

```bash
supabase gen types typescript --local --schema public > packages/web/src/lib/supabase/types.gen.ts
```

after every migration lands, and the file is committed. All `.from('games')` / `.from('profiles')` calls at the Route Handler layer are typed via `SupabaseClient<Database>` where `Database` is `import type { Database } from '@/lib/supabase/types.gen'`. String literals for table / RPC names are prohibited at call sites per Constitution Principle VI.

**Rationale**:
- Matches the constitution's explicit requirement.
- Committing the generated file makes CI checks fully self-contained (no live DB required at typecheck time).

**Alternatives considered**:
- **Generate at build time via a hook**: Rejected for v1 — the generation step needs a running Supabase instance; failing CI on missing DB access would be brittle.

---

## R-10 — Icon system for the sidebar & profile icon

**Decision**: Inline SVG icons colocated in `packages/web/src/components/shell/icons/` (three tiny SVG-only components: `IconChevronLeft`, `IconChevronRight`, `IconUser`). No new dependency.

**Rationale**:
- Codebase survey confirms no icon library exists; the app currently uses inline Tailwind/SVG.
- Constitution Principle V: adding a runtime dependency needs justification. Three static glyphs don't justify a library.
- Keeps bundle impact zero on non-account routes.

**Alternatives considered**:
- **`lucide-react`**: Rejected for v1 — bundle cost > 20 KB per Principle IV threshold, no other icons currently needed.

---

## Summary of decisions

| ID | Topic | Decision |
|----|-------|----------|
| R-01 | Write-through save mechanism | Client hook + PATCH Route Handler, 250 ms debounce, idempotency-key required |
| R-02 | Library query performance | Denormalize summary columns onto `public.games` |
| R-03 | Profile row creation | Lazy upsert on first `/account` load (no trigger) |
| R-04 | Idempotency strategy | `public.game_writes` dedupe table, unique idempotency key |
| R-05 | Statsheet | Build now (`StatSheet.tsx` + `computeStatSheet` in core); spec Assumption is stale |
| R-06 | Sidebar collapsed/expanded persistence | `localStorage` key `thestats.sidebar.v1`; default responsive |
| R-07 | Continue-in-progress hydration | Client fetch → `store.hydrateFromLibrary` → paused clock → `router.push('/')` |
| R-08 | Anonymous local-game prompt on sign-in | Client Component on `/login`, Modal, three choices, blocks redirect |
| R-09 | Supabase generated types | `types.gen.ts` committed under `packages/web/src/lib/supabase/`; regenerated after each migration |
| R-10 | Icon system | Inline SVG components; no new dependency |
