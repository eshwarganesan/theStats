# Phase 1 Data Model: Account Page & Saved Games Library

**Feature**: `009-account-library`
**Date**: 2026-07-22
**Delivered as**: One new Supabase migration `packages/web/supabase/migrations/0002_account_library.sql`.

Every table below has RLS enabled with explicit policies. Every user- or game-scoped column is keyed on `auth.uid()`; no service-role bypass is used in user-facing request paths. All types below map 1:1 to the generated `Database` TypeScript types after `supabase gen types typescript` runs.

---

## Entity 1 — `public.profiles`

Per-user editable profile. One row per `auth.users` row, created lazily on first `/account` load (Research R-03).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | `PRIMARY KEY`, `REFERENCES auth.users(id) ON DELETE CASCADE` | Same UUID as the auth user; one row per user. |
| `display_name` | `text` | nullable | Optional. When null, UI falls back to the local part of the user's email (spec Assumption). Max length enforced by Zod at the boundary (see contracts). |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` | |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` | Bumped by trigger `set_updated_at` on every UPDATE. |

**RLS policies**:
- `SELECT` `USING (id = auth.uid())`
- `INSERT` `WITH CHECK (id = auth.uid())`
- `UPDATE` `USING (id = auth.uid()) WITH CHECK (id = auth.uid())`
- No `DELETE` policy — deletion cascades from `auth.users` (no self-delete path in v1).

**Validation rules** (enforced at the Zod boundary, not the DB):
- `display_name`: `z.string().trim().min(1).max(64).nullable()`. Empty string → `null`.

**Lifecycle**: Row is created by `POST /api/profile` (upsert `ON CONFLICT DO NOTHING`) on first `/account` load. Updated by the `updateDisplayName` Server Action (see contracts).

---

## Entity 2 — `public.games`

One row per saved game owned by a user. Full authoritative game record lives in `state jsonb`; a small set of summary columns is denormalized for cheap library rendering (Research R-02).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | `PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `owner_id` | `uuid` | `NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` | The Supabase-authenticated user who owns this game. |
| `state` | `jsonb` | `NOT NULL` | Full `PersistedGameRecord` — same shape stored by feature 006 in `localStorage`. Validated at the Zod boundary before write. |
| `status` | `text` | `NOT NULL`, `CHECK (status IN ('in-progress','finished'))` | Denormalized from `state.status` — 'in-progress' when `state.status` is one of `setup / ready / live / timeout / period-break`; 'finished' when `state.status = 'finished'`. |
| `home_team_name` | `text` | `NOT NULL` | Denormalized from `state.homeTeam.label`. |
| `away_team_name` | `text` | `NOT NULL` | Denormalized from `state.awayTeam.label`. |
| `home_score` | `integer` | `NOT NULL DEFAULT 0`, `CHECK (home_score >= 0)` | Current score for in-progress, final score for finished. |
| `away_score` | `integer` | `NOT NULL DEFAULT 0`, `CHECK (away_score >= 0)` | |
| `event_count` | `integer` | `NOT NULL DEFAULT 0`, `CHECK (event_count >= 0)` | Length of `state.events`. Surfaces the "you will lose N events" delete-confirmation warning (FR-025). |
| `current_period` | `integer` | `NOT NULL DEFAULT 1`, `CHECK (current_period >= 1)` | Denormalized from `state.currentPeriod`. |
| `started_at` | `timestamptz` | `NOT NULL DEFAULT now()` | Game creation timestamp. Serves as the "start time" tiebreaker in the library (FR-010, spec clarification Q3). Never updated after row creation. |
| `last_activity_at` | `timestamptz` | `NOT NULL DEFAULT now()` | Most recent update time. Bumped by trigger `set_last_activity_at` on every UPDATE. Used for library sort (FR-011). |
| `finished_at` | `timestamptz` | nullable | Set when `status` transitions to `'finished'`; unset otherwise. |

**Indexes**:
- `PRIMARY KEY (id)`
- `INDEX games_owner_last_activity_idx ON games (owner_id, last_activity_at DESC)` — supports the default library sort at scale (SC-003).

**RLS policies** (all four required — Constitution Principle VI):
- `SELECT` `USING (owner_id = auth.uid())`
- `INSERT` `WITH CHECK (owner_id = auth.uid())`
- `UPDATE` `USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid())`
- `DELETE` `USING (owner_id = auth.uid())`

**Validation rules** (Zod boundary):
- `state`: `PersistedGameRecordSchema` — mirrors the type in `packages/core/src/types.ts`. Rejects unknown fields. `state.homeTeam.label` and `state.awayTeam.label` must be non-empty.
- `state.status` must be one of the `GameStatus` union.
- Server writes recompute `status`, `home_team_name`, `away_team_name`, `home_score`, `away_score`, `event_count`, `current_period` from `state` on every write — the client never sets them directly.

**State transitions**:

```text
        (POST /api/games)
             │
             ▼
      status='in-progress'  ──(PATCH ends game)──▶  status='finished'
             │                                            │
             │(DELETE)                                    │(DELETE)
             ▼                                            ▼
          (removed)                                    (removed)
```

- A game is created as `in-progress` (game state may still be `setup` inside `state`).
- On any PATCH whose `state.status` becomes `finished`, the server also sets `status = 'finished'` and `finished_at = now()`.
- A finished → in-progress reversal is NOT supported in v1 (a finished game cannot be un-finished from the library; spec FR-020 keeps review read-only).

---

## Entity 3 — `public.game_writes`

Idempotency-key dedupe table for `POST /api/games` and `PATCH /api/games/[id]` (Research R-04).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `idempotency_key` | `text` | `PRIMARY KEY` | Client-supplied UUID passed as `Idempotency-Key` request header. |
| `game_id` | `uuid` | `NOT NULL REFERENCES games(id) ON DELETE CASCADE` | The game the write applies to (so cascade cleanup removes stale keys when a game is deleted). |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` | Used by nightly cleanup. |

**RLS policies**: **Deny-all** to the anon and authenticated roles. Only the SECURITY DEFINER RPC `record_game_write(p_key text, p_game_id uuid)` writes to this table on behalf of the authenticated user (mirrors the existing `record_auth_attempt` pattern from `0001_user_auth.sql`).

**Cleanup**: A `pg_cron` job (same schedule pattern as `0001`) deletes rows older than 24 h nightly.

---

## Type layer (in `packages/core/src/types.ts`)

Additions (public exports):

```ts
export type ProfileRow = {
  id: string;               // uuid
  displayName: string | null;
  createdAt: string;        // ISO
  updatedAt: string;        // ISO
};

export type LibraryEntry = {
  id: string;                                   // games.id
  status: 'in-progress' | 'finished';
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  eventCount: number;
  currentPeriod: number;
  startedAt: string;                            // ISO
  lastActivityAt: string;                       // ISO
  finishedAt: string | null;                    // ISO or null
};

export type SavedGameRecord = LibraryEntry & {
  ownerId: string;
  state: PersistedGameRecord;                   // existing type from feature 006
};

export type LibraryPage = {
  entries: LibraryEntry[];
  nextCursor: string | null;                    // last_activity_at ISO of the tail entry, or null when exhausted
};
```

New pure function (in `packages/core/src/stats.ts`):

```ts
export function computeStatSheet(
  events: GameEvent[],
  teams: { home: Team; away: Team }
): { home: TeamStats; away: TeamStats; players: Record<string, PlayerStats> };
```

Reason: Feature-scoped statsheet aggregation (Research R-05). Pure, testable in isolation, no React dependency.

---

## Migration file outline

`packages/web/supabase/migrations/0002_account_library.sql`:

```sql
-- 1. profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- updated_at trigger
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();

-- 2. games table
create table public.games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  state jsonb not null,
  status text not null check (status in ('in-progress','finished')),
  home_team_name text not null,
  away_team_name text not null,
  home_score integer not null default 0 check (home_score >= 0),
  away_score integer not null default 0 check (away_score >= 0),
  event_count integer not null default 0 check (event_count >= 0),
  current_period integer not null default 1 check (current_period >= 1),
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  finished_at timestamptz
);
create index games_owner_last_activity_idx on public.games (owner_id, last_activity_at desc);
alter table public.games enable row level security;
create policy "games_select_own" on public.games for select using (owner_id = auth.uid());
create policy "games_insert_own" on public.games for insert with check (owner_id = auth.uid());
create policy "games_update_own" on public.games for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "games_delete_own" on public.games for delete using (owner_id = auth.uid());

-- last_activity_at trigger
create or replace function public.set_last_activity_at() returns trigger language plpgsql as $$
begin new.last_activity_at = now(); return new; end $$;
create trigger games_set_last_activity_at before update on public.games for each row execute function public.set_last_activity_at();

-- 3. game_writes (idempotency)
create table public.game_writes (
  idempotency_key text primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.game_writes enable row level security;
-- deny-all: no policies for authenticated/anon; only SECURITY DEFINER RPC writes

create or replace function public.record_game_write(p_key text, p_game_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into public.game_writes(idempotency_key, game_id) values (p_key, p_game_id) on conflict do nothing;
  return found;  -- true if inserted; false if duplicate
end $$;
revoke all on function public.record_game_write(text, uuid) from public;
grant execute on function public.record_game_write(text, uuid) to authenticated;

-- 4. nightly cleanup (pg_cron — same pattern as 0001)
select cron.schedule(
  'game_writes_cleanup',
  '30 3 * * *',
  $$delete from public.game_writes where created_at < now() - interval '24 hours'$$
);
```

The exact SQL is finalized during the migration task in `/speckit.tasks`; the outline above documents the intended shape and RLS surface for review.
