# Quickstart: User Authentication

**Branch**: `005-user-auth` | **Plan**: [plan.md](./plan.md)

How a contributor sets up the auth feature locally end-to-end. Target time:
**~15 minutes** on a clean checkout. If anything in this file is out of date
relative to the source, the source is right and this file needs a PR.

---

## 1. Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | ≥20 | Next.js 15 requires it |
| npm | ≥10 | Workspace support |
| Docker | recent | Local Supabase runs in containers |
| Supabase CLI | ≥1.200 | `supabase start`, `supabase gen types` |

```sh
brew install supabase/tap/supabase   # macOS — adjust for your OS
```

## 2. Install workspace deps

From the repo root:

```sh
npm install
```

This also pulls in **Zod** for `packages/web` (added as part of this feature).

## 3. Boot a local Supabase

From `packages/web`:

```sh
cd packages/web
supabase start
```

This:

- starts Postgres, GoTrue (auth), Mailpit (email outbox UI), and the
  Supabase Studio dashboard;
- runs every migration in `packages/web/supabase/migrations/` against the
  fresh database — including `0001_user_auth.sql`, which creates the
  `auth_attempts` table, the two RPCs, and the `purge_unconfirmed_users`
  cron job.

Expected output ends with a block of URLs and keys. Copy them; the next
step needs them.

## 4. Configure env

Copy `.env.example` to `.env.local` in `packages/web/`:

```sh
cp .env.example .env.local
```

Fill it with the values `supabase start` printed:

```env
# server-only
SUPABASE_SERVICE_ROLE_KEY=eyJ...    # NEVER commit; NEVER expose with NEXT_PUBLIC_ prefix

# public (safe in client bundles)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

`packages/web/src/env.ts` (added by this feature) parses these with Zod at
startup; a typo or missing value fails the build, not a runtime call.

## 5. Regenerate Supabase types

Run from `packages/web`:

```sh
npx supabase gen types typescript --local > src/lib/supabase/database.types.ts
```

Commit this file. Re-run any time `supabase/migrations/*.sql` changes —
this is part of the Constitution VI "Backend PR gate."

## 6. Run the app

```sh
npm run dev      # from repo root, proxies into packages/web
```

Open `http://localhost:3000/login`. You should see the login panel with a
Sign in / Sign up toggle.

### Try the full flow

1. Sign up with `you@example.com` and any password ≥6 chars (Supabase
   default).
2. The page shows a "Check your email" banner. Open the Supabase Studio
   inbox at `http://127.0.0.1:54324` (Mailpit) and click the confirmation
   link.
3. You're redirected to `/`. The top-bar `AuthPill` should now read
   "Signed in as you@example.com".
4. Hit Sign out. You're back on `/` in anonymous mode (per the hybrid
   clarification — no redirect to `/login`).

## 7. Run tests

```sh
# unit + component (jsdom)
npm run test --workspace=scorekeeping-app

# coverage report
npm run test:coverage --workspace=scorekeeping-app

# integration tests (Route Handler tests against running local Supabase)
npm run test --workspace=scorekeeping-app -- tests/integration/auth

# end-to-end Playwright suite (requires the dev server)
npm run test:e2e --workspace=scorekeeping-app -- tests/e2e/auth.spec.ts

# the full CI gate
npm run test:all
```

The integration suite expects `supabase start` to already be running — it
reads `NEXT_PUBLIC_SUPABASE_URL` and the service-role key from `.env.local`.
If `supabase start` is not running, those tests fail fast with a clear
"could not reach Supabase" error.

## 8. Tear down

```sh
supabase stop                                  # from packages/web
```

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `supabase start` fails on port 54321 | Another instance is running — `supabase stop` first. |
| Sign-up returns 500 in dev | Check that `0001_user_auth.sql` ran — `supabase db reset` will replay migrations. |
| "Email not confirmed" never goes away | Mailpit link was not clicked; or your `Site URL` is not `http://localhost:3000` — see `supabase/config.toml`. |
| `database.types.ts` shows red squigglies on `from('auth_attempts')` | Re-run `npx supabase gen types typescript --local > ...` after the migration. |
| Integration tests hang | The `is_auth_attempt_allowed` row is set far in the future — `supabase db reset` clears it. |
