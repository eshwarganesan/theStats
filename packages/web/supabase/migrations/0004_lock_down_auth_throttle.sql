-- 0004_lock_down_auth_throttle.sql
--
-- Makes the FR-011 brute-force backoff RPCs server-only.
--
-- 0001 granted EXECUTE on is_auth_attempt_allowed / record_auth_attempt
-- to anon and authenticated so the Route Handlers could call them with
-- the anon key. But the anon key is public, so anyone could call
-- record_auth_attempt directly to:
--   - reset their own backoff (p_success = true) between guesses, or
--   - lock out any other account or IP (p_success = false, repeatedly).
-- is_auth_attempt_allowed also let anyone probe another key's backoff.
--
-- From here on only service_role may execute them. The web app calls
-- them through the admin client in src/lib/auth/attempt-throttle.ts.
--
-- Supabase's default privileges also grant EXECUTE on new public
-- functions to anon / authenticated directly, so revoke from those roles
-- explicitly, not just from PUBLIC.

revoke execute on function public.is_auth_attempt_allowed(text[])
  from public, anon, authenticated;
revoke execute on function public.record_auth_attempt(text[], boolean)
  from public, anon, authenticated;

grant execute on function public.is_auth_attempt_allowed(text[]) to service_role;
grant execute on function public.record_auth_attempt(text[], boolean) to service_role;
