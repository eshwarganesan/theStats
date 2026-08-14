-- 0002_account_library.sql
--
-- Feature: 009-account-library
-- Spec FRs: FR-004 (editable display name), FR-005 (password change — no DB
--           change, but profiles row anchors identity), FR-009 (library),
--           FR-010 (entry summary fields), FR-011 (most-recent sort),
--           FR-022 (game added at creation), FR-023 (finished status
--           reflected), FR-025 (delete).
--
-- Creates:
--   1. public.profiles — one row per auth.users, editable display name.
--   2. public.games — full game record + denormalized summary columns for
--      cheap library rendering; owner-scoped RLS.
--   3. public.game_writes — idempotency-key dedupe table (deny-all + one
--      SECURITY DEFINER RPC), mirrors the pattern used by 0001 for
--      auth_attempts.
--   4. pg_cron nightly cleanup of game_writes rows older than 24 h.
--
-- See specs/009-account-library/data-model.md for the full design.

------------------------------------------------------------------------
-- 1. profiles
------------------------------------------------------------------------

create table if not exists public.profiles (
  id            uuid         primary key
                             references auth.users(id) on delete cascade,
  display_name  text,
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now()
);

comment on table public.profiles is
  'Per-user editable profile. Lazily upserted on first /account load. '
  'display_name may be null; callers fall back to the local part of the '
  'user email until it is set.';

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------
-- 2. games
------------------------------------------------------------------------

create table if not exists public.games (
  id                uuid         primary key default gen_random_uuid(),
  owner_id          uuid         not null
                                 references auth.users(id) on delete cascade,
  state             jsonb        not null,
  status            text         not null
                                 check (status in ('in-progress', 'finished')),
  home_team_name    text         not null,
  away_team_name    text         not null,
  home_score        integer      not null default 0
                                 check (home_score >= 0),
  away_score        integer      not null default 0
                                 check (away_score >= 0),
  event_count       integer      not null default 0
                                 check (event_count >= 0),
  current_period    integer      not null default 1
                                 check (current_period >= 1),
  started_at        timestamptz  not null default now(),
  last_activity_at  timestamptz  not null default now(),
  finished_at       timestamptz
);

comment on table public.games is
  'One row per saved game owned by a user. `state` is the authoritative '
  'full record (matches feature 006 PersistedGameRecord shape). All other '
  'columns are denormalized summary fields the server recomputes on write '
  'so the library list does not need to deserialize the jsonb blob.';

create index if not exists games_owner_last_activity_idx
  on public.games (owner_id, last_activity_at desc);

alter table public.games enable row level security;

create policy "games_select_own"
  on public.games for select
  using (owner_id = auth.uid());

create policy "games_insert_own"
  on public.games for insert
  with check (owner_id = auth.uid());

create policy "games_update_own"
  on public.games for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "games_delete_own"
  on public.games for delete
  using (owner_id = auth.uid());

-- last_activity_at trigger
create or replace function public.set_last_activity_at()
returns trigger
language plpgsql
as $$
begin
  new.last_activity_at = now();
  return new;
end;
$$;

drop trigger if exists games_set_last_activity_at on public.games;
create trigger games_set_last_activity_at
  before update on public.games
  for each row execute function public.set_last_activity_at();

------------------------------------------------------------------------
-- 3. game_writes (idempotency)
------------------------------------------------------------------------

create table if not exists public.game_writes (
  idempotency_key  text         primary key,
  game_id          uuid         not null
                                references public.games(id) on delete cascade,
  created_at       timestamptz  not null default now()
);

comment on table public.game_writes is
  'Idempotency-key dedupe for POST /api/games and PATCH /api/games/[id]. '
  'RLS denies all client roles; the record_game_write SECURITY DEFINER RPC '
  'is the only path that writes.';

alter table public.game_writes enable row level security;

-- Explicit deny-all: no policies for authenticated/anon means no rows are
-- accessible directly. The RPC below performs the insert as postgres.

------------------------------------------------------------------------
-- 4. record_game_write RPC
------------------------------------------------------------------------

create or replace function public.record_game_write(
  p_key      text,
  p_game_id  uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted boolean := false;
begin
  insert into public.game_writes(idempotency_key, game_id)
  values (p_key, p_game_id)
  on conflict do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.record_game_write(text, uuid) from public;
grant execute on function public.record_game_write(text, uuid) to authenticated;

comment on function public.record_game_write(text, uuid) is
  'Attempts to record an idempotency key for a game write. Returns true if '
  'the key was newly recorded (caller should perform the write); false if '
  'the key was already present (caller should return the existing state).';

------------------------------------------------------------------------
-- 5. Nightly cleanup of stale idempotency keys (pattern from 0001)
------------------------------------------------------------------------

do $$
begin
  perform 1 from pg_extension where extname = 'pg_cron';
  if not found then
    create extension if not exists pg_cron with schema extensions;
  end if;
end;
$$;

do $$
begin
  perform cron.unschedule('game_writes_cleanup')
  where exists (
    select 1 from cron.job where jobname = 'game_writes_cleanup'
  );
exception
  when others then
    -- cron.unschedule raises if the job does not exist; ignore.
    null;
end;
$$;

select cron.schedule(
  'game_writes_cleanup',
  '30 3 * * *',
  $$delete from public.game_writes where created_at < now() - interval '24 hours'$$
);
