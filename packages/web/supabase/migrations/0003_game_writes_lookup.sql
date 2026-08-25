-- 0003_game_writes_lookup.sql
--
-- Feature: 009-account-library (post-ship fix)
--
-- POST /api/games's duplicate-Idempotency-Key branch needs to look up the
-- game_id previously recorded for a key. It was querying public.game_writes
-- directly through the RLS-scoped client, but that table is deny-all by
-- design (see 0002_account_library.sql § 3), so the lookup always errored
-- and the handler returned 500 on the second POST with a repeat key.
--
-- Adds a SECURITY DEFINER RPC that returns the recorded game_id for a
-- given idempotency key. Callers must still enforce ownership via a SELECT
-- on public.games (RLS handles that).

create or replace function public.get_game_write_game_id(p_key text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select game_id from public.game_writes where idempotency_key = p_key;
$$;

revoke all on function public.get_game_write_game_id(text) from public;
grant execute on function public.get_game_write_game_id(text) to authenticated;

comment on function public.get_game_write_game_id(text) is
  'Look up the game_id associated with a previously-recorded idempotency '
  'key. Returns null when the key is unknown. Caller must still enforce '
  'ownership via SELECT on public.games (RLS).';
