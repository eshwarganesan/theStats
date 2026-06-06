-- 0001_user_auth.sql
--
-- Feature: 005-user-auth
-- Spec FRs: FR-011 (per-account + per-IP exponential brute-force backoff),
--           FR-016 (auto-delete unconfirmed accounts after 7 days).
--
-- This migration is owned by feature 005-user-auth. It creates:
--   1. public.auth_attempts table (with RLS denying all client roles).
--   2. public.is_auth_attempt_allowed(keys) SECURITY DEFINER RPC.
--   3. public.record_auth_attempt(keys, success) SECURITY DEFINER RPC.
--   4. pg_cron extension + purge_unconfirmed_users daily job.
--
-- See specs/005-user-auth/data-model.md for the full design.

------------------------------------------------------------------------
-- 1. auth_attempts
------------------------------------------------------------------------

create table if not exists public.auth_attempts (
  key                  text         primary key,
  consecutive_failures integer      not null default 0
                          check (consecutive_failures >= 0),
  next_allowed_at      timestamptz  not null default now(),
  updated_at           timestamptz  not null default now()
);

comment on table public.auth_attempts is
  'Per-key (email or "ip:<addr>") brute-force backoff bookkeeping. '
  'Access is mediated by the is_auth_attempt_allowed and record_auth_attempt '
  'SECURITY DEFINER functions; RLS denies all direct client access.';

------------------------------------------------------------------------
-- 2. Row-Level Security: deny ALL client access
------------------------------------------------------------------------

alter table public.auth_attempts enable row level security;

-- Explicit deny-all policies on every operation. Even authenticated users
-- MUST NOT be able to observe their own throttle state — they go through
-- the RPCs below.
create policy "auth_attempts_deny_select"
  on public.auth_attempts for select
  using (false);

create policy "auth_attempts_deny_insert"
  on public.auth_attempts for insert
  with check (false);

create policy "auth_attempts_deny_update"
  on public.auth_attempts for update
  using (false) with check (false);

create policy "auth_attempts_deny_delete"
  on public.auth_attempts for delete
  using (false);

------------------------------------------------------------------------
-- 3. is_auth_attempt_allowed(keys text[]) -> jsonb
--
--    Returns { allowed: bool, retry_after_seconds: int }.
--    Reads next_allowed_at across all keys; returns the MAX backoff.
------------------------------------------------------------------------

create or replace function public.is_auth_attempt_allowed(p_keys text[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_max_next   timestamptz;
  v_retry_secs integer;
begin
  select coalesce(max(next_allowed_at), now())
    into v_max_next
    from public.auth_attempts
    where key = any(p_keys);

  if v_max_next <= now() then
    return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
  end if;

  v_retry_secs := ceil(extract(epoch from (v_max_next - now())))::integer;
  return jsonb_build_object('allowed', false, 'retry_after_seconds', v_retry_secs);
end;
$$;

revoke all on function public.is_auth_attempt_allowed(text[]) from public;
grant execute on function public.is_auth_attempt_allowed(text[]) to anon, authenticated;

------------------------------------------------------------------------
-- 4. record_auth_attempt(keys text[], success boolean) -> void
--
--    On success: reset consecutive_failures = 0, next_allowed_at = now().
--    On failure: bump consecutive_failures, set next_allowed_at = now() +
--                least(power(2, consecutive_failures - 1), 30) seconds.
--    Upsert per key, atomically.
------------------------------------------------------------------------

create or replace function public.record_auth_attempt(p_keys text[], p_success boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text;
begin
  if p_success then
    foreach v_key in array p_keys loop
      insert into public.auth_attempts as a (key, consecutive_failures, next_allowed_at, updated_at)
        values (v_key, 0, now(), now())
      on conflict (key) do update
        set consecutive_failures = 0,
            next_allowed_at      = now(),
            updated_at           = now();
    end loop;
  else
    foreach v_key in array p_keys loop
      insert into public.auth_attempts as a (key, consecutive_failures, next_allowed_at, updated_at)
        values (
          v_key,
          1,
          now() + (least(power(2, 0)::int, 30)) * interval '1 second',
          now()
        )
      on conflict (key) do update
        set consecutive_failures = a.consecutive_failures + 1,
            next_allowed_at      = now()
              + (least(power(2, a.consecutive_failures)::int, 30)) * interval '1 second',
            updated_at           = now();
    end loop;
  end if;
end;
$$;

revoke all on function public.record_auth_attempt(text[], boolean) from public;
grant execute on function public.record_auth_attempt(text[], boolean) to anon, authenticated;

------------------------------------------------------------------------
-- 5. Daily purge of unconfirmed accounts older than 7 days (FR-016)
------------------------------------------------------------------------

create extension if not exists pg_cron;

-- Schedule once. Re-running this migration on an already-scheduled cluster
-- is a no-op because pg_cron disallows duplicate job names.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'purge_unconfirmed_users') then
    perform cron.schedule(
      'purge_unconfirmed_users',
      '0 4 * * *',
      $job$
        delete from auth.users
         where email_confirmed_at is null
           and created_at < now() - interval '7 days'
      $job$
    );
  end if;
end$$;
