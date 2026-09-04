# Phase 1 — Data Model: Games Page (Sidebar Library + New Game Entry)

**Feature**: `010-games-library` | **Plan**: [plan.md](./plan.md)

## Summary

**This feature introduces no new persisted entities, no new fields on existing entities, and no schema migration.** It reuses feature 009's data model verbatim. This document exists to (a) enumerate the entities the new surface reads and writes so downstream tasks reference a single canonical description, and (b) call out the *shape* of two purely presentational, non-persisted types the new UI adds.

---

## Persisted entities (all reused from feature 009 — no changes)

### `public.games`

Source of truth: `packages/web/supabase/migrations/0002_account_library.sql`.

Reused columns (this feature reads all of them via the existing `GET /api/games` and `GET /api/games/[id]` handlers; no writes originate in this feature):

| Column | Type | Role in this feature |
|-------|------|---------------------|
| `id` | `uuid` (PK) | Segment of the `/games/[id]` route; passed to `GET /api/games/[id]` when a user opens a game. |
| `owner_id` | `uuid` (FK → `auth.users(id)`) | Enforced by RLS; not sent to the client by the library-list query. |
| `state` | `jsonb` | Full `PersistedGameRecord` blob; only fetched when the user opens a game — never on the list route. |
| `status` | `text` (`'in-progress' \| 'finished'`) | Drives the per-row status pill (FR-008) and the "which view opens on click" branch (FR-016 vs. FR-017). |
| `home_team_name`, `away_team_name` | `text` | Row labels (FR-008). |
| `home_score`, `away_score` | `integer` | Row score (final for finished, current for in-progress). |
| `event_count`, `current_period` | `integer` | Available for row-level detail; retained for future use, unchanged. |
| `started_at` | `timestamptz` | Rendered as the row's date. |
| `last_activity_at` | `timestamptz` | Sole `ORDER BY` key (FR-009); also the cursor value for `GET /api/games?cursor=…` pagination. |
| `finished_at` | `timestamptz \| null` | Present on finished rows for the review view; not shown on the list. |

RLS policies (unchanged, reused): `games_select_own`, `games_insert_own`, `games_update_own`, `games_delete_own` — each keyed on `owner_id = auth.uid()`. This feature adds NO new policies and does NOT weaken any existing policy.

Composite index (unchanged, reused): `games_owner_last_activity_idx (owner_id, last_activity_at desc)` — the exact index the Games page's initial-batch server query and the paginated `GET /api/games` handler already exploit.

### `public.profiles`

Unchanged, reused. Not read by any code path this feature introduces; retained on the (reduced) account page for display-name / email display and password change (feature 009 responsibility).

### `public.game_writes`

Unchanged, reused. Idempotency table backing `POST /api/games`. This feature does not invoke `POST /api/games` from any new surface — the new "New game" CTA routes to `/setup`, which is the same flow that eventually POSTs.

---

## Client-side domain types (reused from `src/lib/games/types.ts`)

The three types below are consumed by the new Games page and its per-game route. They live in `packages/web/src/lib/games/types.ts` today and stay there — no fields added, no fields removed.

- **`LibraryEntry`** — the denormalized row shape rendered by `<LibraryEntry>`. Fields: `id`, `status`, `homeTeamName`, `awayTeamName`, `homeScore`, `awayScore`, `eventCount`, `currentPeriod`, `startedAt`, `lastActivityAt`, `finishedAt`.
- **`SavedGameRecord`** — a `LibraryEntry` plus `ownerId` and the full `state: PersistedGameRecord`; returned by `GET /api/games/[id]` and consumed by `useGameStore.hydrateFromLibrary()`.
- **`LibraryPage`** — one paginated response: `{ entries: LibraryEntry[]; nextCursor: string | null }`.

The Games page's *initial* batch (server-rendered) is materialized into `LibraryEntry[]` directly from a scoped Supabase query in the Server Component — mirroring exactly what the existing account page does (`packages/web/src/app/(authenticated)/account/page.tsx` lines 24–63). No new server-side shape is introduced.

---

## New in-memory / presentational types (this feature)

These are TypeScript interfaces for React component props — not persisted, not sent over the wire, not part of any schema. They exist only so the new components have explicit, type-safe boundaries per Constitution II.

### `SidebarNavItemProps` (in `src/components/shell/SidebarNavItem.tsx`)

```ts
export interface SidebarNavItemProps {
  /** Route to navigate to when the item is activated. */
  href: string;
  /** Human-readable label. Rendered as the visible text in the expanded
   *  overlay and as an `aria-label` / `sr-only` companion in the collapsed
   *  rail so keyboard and screen-reader users have the same information. */
  label: string;
  /** Presentational icon. Rendered at 20 px in both rail and overlay. */
  icon: React.ReactNode;
  /** Optional extra Tailwind classes appended after the base + active-state
   *  classes. Kept optional to preserve the component's single-purpose
   *  shape; callers should not need this. */
  className?: string;
}
```

**Active-state rule** (encoded in the component, not the props): `data-active="true"` when `usePathname()` equals `href` OR starts with `href + "/"`. For the Games nav item (`href="/games"`), that matches `/games` and any `/games/:id`. This satisfies FR-003.

### `GamesPageProps` (in `src/app/(authenticated)/games/page.tsx`)

The Games page Server Component takes **no props** (Next.js App Router page). Its Server Component body performs:

1. `await requireAuth({ from: "/games" })` — auth gate (FR-006).
2. `await loadInitialLibrary()` — a private helper mirroring `packages/web/src/app/(authenticated)/account/page.tsx` line 24, returning `{ entries: LibraryEntry[], nextCursor: string | null }`.
3. Renders a shell: header, `<NewGameCta />`, `<LibraryErrorBoundary><GameLibrary initialEntries={…} initialNextCursor={…} /></LibraryErrorBoundary>`.

No new interface is exported because no other module imports this page — it's a route file.

### `GameDetailPageProps` (in `src/app/(authenticated)/games/[id]/page.tsx`)

Standard Next.js dynamic route contract:

```ts
interface GameDetailPageProps {
  params: Promise<{ id: string }>;
}
```

Behavior mirrors the current `/account/games/[id]/page.tsx`: `requireAuth` at the top → fetch the full row via Supabase server client (RLS-scoped) → deserialize → if `status !== "finished"`, `redirect("/games")` (matching feature 009's redirect-to-list behavior for in-progress ids opened via the detail route); otherwise render `<GameReviewView record={…} />`.

---

## Entity-relationship diagram

```
                        ┌─────────────────┐
                        │  auth.users     │
                        │  (Supabase)     │
                        └────────┬────────┘
                                 │ 1:1 (lazy)
                                 ▼
                        ┌─────────────────┐         ┌─────────────────┐
                        │  public.profiles│         │  public.games   │
                        │  (unchanged)    │         │  (unchanged)    │
                        └─────────────────┘         └────────┬────────┘
                                                             │
                                              ┌──────────────┼──────────────┐
                                              ▼              ▼              ▼
                                   LibraryEntry[]  SavedGameRecord  PersistedGameRecord
                                   (list route)   (detail route)   (via .state jsonb)

Sidebar nav item (new, non-persisted) ─── mounts inside AppSidebar, targets /games
NewGameCta        (new, non-persisted) ─── on click: clearPersistedGame → resetAll → /setup
```

---

## Data-related invariants this feature MUST preserve

- **RLS is the ownership check.** No code this feature adds may pass a client-supplied `userId` / `ownerId` into a Supabase query. The Server Components read via the SSR Supabase client, which carries the authenticated session cookie, and RLS filters by `owner_id = auth.uid()`.
- **`state` jsonb is never sent to the list surface.** The `LIBRARY_COLUMNS` allowlist in `GET /api/games` (existing) and the equivalent `.select(…)` in the account page's initial-batch loader (which is being ported into `/games/page.tsx`) both exclude `state`. The new Games page MUST reuse the same column list.
- **Cursor pagination is `last_activity_at`-based.** The Server Component's initial batch and the client's `loadMore()` in `<GameLibrary>` both use `last_activity_at` as the cursor. Anything that reorders the list (see R-04 in `research.md`) would break the cursor.
- **`GET /api/games/[id]` return shape is `{ game: SavedGameRecord }`.** Consumed by `LibraryEntry.loadAndHydrate()` unchanged. The new `/games/[id]` Server Component reads the row directly (bypassing the API handler) — same shape derivation via `fromSavedGameRecord()`.

---

## What is explicitly NOT in this data model

- No new tables.
- No new columns.
- No new indexes.
- No new RPCs.
- No new RLS policies.
- No new Zod schemas (the existing `LibraryQuerySchema` / `PostGameBodySchema` are the only ones on the reused endpoints, and they are untouched).
- No new fields on `PersistedGameRecord`, `SavedGameRecord`, `LibraryEntry`, `LibraryPage`, or `ProfileRow`.
- No migration file under `supabase/migrations/`.
- No changes to the `record_game_write` / `get_game_write_game_id` RPCs.
