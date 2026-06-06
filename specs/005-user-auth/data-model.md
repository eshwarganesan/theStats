# Phase 1 Data Model: User Authentication

**Branch**: `005-user-auth` | **Date**: 2026-05-31 | **Plan**: [plan.md](./plan.md)

Two schemas are in play: the Supabase-managed `auth` schema (read-only from
our migrations' perspective) and our own `public` schema (we own this).
This document captures only the columns the application code reads or writes.

---

## `auth.users` (Supabase-managed)

Fields theStats reads from this table:

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key. Used as the foreign key target for any future `public.*` user-scoped tables. |
| `email` | `text` | Unique among non-deleted rows. Read for display in the `AuthPill`. |
| `email_confirmed_at` | `timestamptz \| null` | NULL until the confirmation link is clicked. Drives FR-005 (must be confirmed before full access) and FR-016 (auto-purge after 7 days if still NULL). |
| `created_at` | `timestamptz` | Used by the purge cron to find unconfirmed rows older than 7 days. |
| `last_sign_in_at` | `timestamptz \| null` | Read for debugging only. |

theStats never `UPDATE`s or `DELETE`s rows in `auth.users` directly except
through Supabase Auth's own RPCs (sign-up, sign-out, exchange code) or the
admin-key purge cron. Direct table writes from application code are
PROHIBITED per Constitution Principle VI.

### State transitions

```text
(no row)
   │ POST /api/auth/sign-up succeeds
   ▼
unconfirmed (email_confirmed_at IS NULL)
   │ user clicks confirmation link → GET /auth/callback succeeds
   ▼
confirmed (email_confirmed_at IS NOT NULL)
   │ session lifecycle below — row persists indefinitely
```

If the `unconfirmed` state persists 7 days, the row is deleted by the
`purge_unconfirmed_users` `pg_cron` job (FR-016).

---

## `public.auth_attempts` (new)

Bookkeeping for the per-account + per-IP brute-force backoff (FR-011).
One row per "identity key" — either an email address (lowercased) or the
string `ip:<source-ip>`. Each Route Handler that wants throttle protection
queries this table for **both** keys and respects the longer of the two
backoff windows.

| Column | Type | Constraints |
|---|---|---|
| `key` | `text` | PRIMARY KEY |
| `consecutive_failures` | `integer` | NOT NULL, DEFAULT 0, CHECK (consecutive_failures >= 0) |
| `next_allowed_at` | `timestamptz` | NOT NULL, DEFAULT now() |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT now() |

### RLS

RLS is **enabled** on `public.auth_attempts`. The policy set:

- `SELECT`: deny all roles. No client, anon or authenticated, may read this
  table.
- `INSERT` / `UPDATE` / `DELETE`: deny all roles.

All access is mediated by the two SECURITY DEFINER RPCs below, which run
with the privileges of the migration owner (effectively `service_role`).
This means even a Route Handler using the anon-key client can call the
RPCs (which is what we want) but cannot read raw rows (which is the threat
we're avoiding — letting an attacker observe their own throttle state).

### RPCs

#### `public.is_auth_attempt_allowed(keys text[]) RETURNS jsonb`

Reads `next_allowed_at` for each row matching any key in `keys` and
returns:

```json
{ "allowed": true,  "retry_after_seconds": 0  }
// or
{ "allowed": false, "retry_after_seconds": 17 }
```

If no row exists for a key, that key is treated as having
`next_allowed_at = now()` (i.e. allowed). The function picks the maximum
`next_allowed_at` across all matched rows; if that timestamp is in the
past it returns `allowed: true`.

#### `public.record_auth_attempt(keys text[], success boolean) RETURNS void`

Upserts one row per key:

- On `success = true`: set `consecutive_failures = 0`, `next_allowed_at =
  now()`. (The bookkeeping row is kept rather than deleted so that
  successful sign-ins still light up the audit trail if we add one.)
- On `success = false`: set `consecutive_failures = consecutive_failures
  + 1`, `next_allowed_at = now() + (least(power(2,
  consecutive_failures - 1)::int, 30)) * interval '1 second'`.

The function is a single statement per key wrapped in an `INSERT ... ON
CONFLICT (key) DO UPDATE`, so the read-modify-write is atomic per key.
Multiple keys are processed inside a single transaction.

### Decay

`consecutive_failures` is **not** automatically reset by the passage of
time — it resets only on a `record_auth_attempt(success=true)`. This
matches the "decays after a quiet window" requirement effectively: after
the cap (30s) a successful attempt resets the counter, and unsuccessful
attempts continue to be capped at 30s. The only side effect is that
`consecutive_failures` may grow unboundedly for a key under sustained
attack, which is fine — the cap on the *backoff* keeps the user-facing
behavior bounded.

### Retention

Rows in `auth_attempts` are not purged. The table is bounded by the number
of distinct emails the system has ever seen plus the number of distinct
IPs that have ever attempted sign-in. For a hobby-scale deployment this is
small; if we ever scale up, a follow-up migration can add a TTL purge.
This decision is logged here so it is challengeable.

---

## `Confirmation Token` (spec entity, no app-level table)

The spec's `Confirmation Token` entity is fully owned by Supabase Auth
(it's the `confirmation_token` in `auth.users`). We do not store or read
it directly. Including it in the data model only to explicitly state that
**no new table is created for it**.

---

## `Session` (spec entity, no app-level table)

Session state lives in encrypted cookies set by `@supabase/ssr`. The
canonical session record on the server side is the JWT in the cookie plus
Supabase's `auth.refresh_tokens` table (Supabase-managed). theStats does
not maintain its own session table.

The 30-day idle policy from FR-008 is configured in
`packages/web/supabase/config.toml` as:

```toml
[auth]
jwt_expiry = 3600                # 1 hour access token
refresh_token_rotation_enabled = true
refresh_token_reuse_interval = 10
[auth.security]
refresh_token_lifetime = 2592000  # 30 days
```

---

## Indexes

- `auth.users` — Supabase-managed; we add no indexes.
- `public.auth_attempts` — primary key on `key` is the only access path
  needed. No additional index.

## Migrations

A single migration file delivers all the above:

```text
packages/web/supabase/migrations/0001_user_auth.sql
```

That file:

1. Creates `public.auth_attempts` with the columns above.
2. Enables RLS and writes the deny-all policies.
3. Creates `public.is_auth_attempt_allowed` and `public.record_auth_attempt`
   as SECURITY DEFINER functions, granting `EXECUTE` to `anon` and
   `authenticated`.
4. Enables the `pg_cron` extension if not already.
5. Schedules the daily `purge_unconfirmed_users` job described in R3 of
   `research.md`.

The migration is reviewed in the same PR as the rest of this feature, per
the Constitution v1.1.0 "Backend PR gate."
