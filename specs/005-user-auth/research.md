# Phase 0 Research: User Authentication

**Branch**: `005-user-auth` | **Date**: 2026-05-31 | **Plan**: [plan.md](./plan.md)

The Technical Context in `plan.md` contains no `NEEDS CLARIFICATION` markers —
the five `/speckit.clarify` answers and the existing repo state resolve every
unknown. This document records the key technology decisions the plan depends
on so reviewers can challenge them before implementation begins.

---

## R1 — Session management pattern

**Decision**: Cookie-based sessions managed by `@supabase/ssr` with a
Next.js `middleware.ts` that calls `supabase.auth.getUser()` on every request,
which transparently refreshes the access token if the refresh token is still
valid.

**Rationale**:
- This is the pattern the `@supabase/ssr` package is designed for; deviating
  means re-implementing cookie rotation. Already-installed dep version (0.10)
  ships the helpers we need.
- It satisfies FR-008 (sliding session) automatically — every authenticated
  request refreshes the cookie.
- The middleware doubles as the place where `requireAuth()` for future
  account-gated routes will read the session, so we don't pay for a second
  pass.
- Constitution VI requires `service_role` to stay server-only; cookie auth
  uses only the anon key on the client + a JWT cookie, so the boundary is
  preserved without effort.

**Alternatives considered**:
- *Local-storage JWT (`@supabase/supabase-js` only, no SSR helpers)*: would
  not work cleanly with Next.js Server Components — every gated Server
  Component would need to read auth from a request header bridged by the
  client, and we'd have to roll our own cookie writer. Strictly worse.
- *Custom JWT issued by Route Handler*: reinvents Supabase Auth.
  Unjustifiable per YAGNI (Constitution V).

**Supabase config implication**: set the refresh-token rotation lifetime to
30 days in `config.toml` so FR-008's "30 days idle" matches the provider
config rather than being enforced in application code.

---

## R2 — Where the brute-force backoff lives

**Decision**: Implement the per-account + per-IP exponential backoff
(Clarification Q4) in Postgres via a single RPC `record_auth_attempt(keys
text[], success boolean)` that atomically reads & updates a
`public.auth_attempts` table. Route Handlers call a paired
`is_auth_attempt_allowed(keys text[])` RPC at the top of `sign-in` and
`sign-up`, and the `record_*` RPC after the Supabase Auth result is known.

**Rationale**:
- Constitution VI mandates "endpoints that perform multi-table writes MUST
  execute the writes atomically — preferably via a Postgres function (RPC)."
  Backoff bookkeeping touches a row keyed on email AND a row keyed on IP;
  doing it atomically in Postgres is the prescribed pattern.
- Keeps the rule (clamp(2^(failures−1) s, 1, 30)) in a single place that
  cron + tests + handlers all share.
- No new infrastructure dependency (no Redis, no Upstash, no Vercel KV).
- Self-recovering: backoff decays after a quiet window, satisfying the "no
  permanent lockout" requirement.

**Alternatives considered**:
- *Application-level in-memory counters*: dies on serverless cold start,
  evades per-account discipline across instances. Rejected.
- *External rate-limit service (`@upstash/ratelimit`)*: adds a runtime dep
  and an external service for a problem Postgres can solve in 30 lines of
  SQL. Rejected per YAGNI.
- *Supabase built-in auth rate limiting only*: rate-limits per IP at a
  coarse hourly granularity. Misses the per-account dimension required by
  FR-011 ("applied independently per target account and per source IP").
  Rejected.

---

## R3 — Unconfirmed-account purge

**Decision**: A `pg_cron` job scheduled in the same migration as the rest
of the auth schema runs daily at 04:00 UTC and deletes
`auth.users` rows where `email_confirmed_at IS NULL AND created_at < now() -
interval '7 days'` (Clarification Q5 / FR-016).

**Rationale**:
- `pg_cron` is a first-class Supabase extension; no external scheduler.
- Policy lives next to the schema it operates on (migration file), so
  reviewers see the retention rule when they review the table.
- No HTTP endpoint to defend against accidental triggering.

**Alternatives considered**:
- *Vercel Cron → admin Route Handler*: works but introduces a HTTP path
  whose admin client uses `service_role`; that's the kind of path
  Constitution VI requires us to justify in the PR description. The
  `pg_cron` route avoids that surface entirely.
- *Lazy purge on next sign-up attempt with the same email*: surprising
  behavior; only purges hot rows; leaves zombie rows behind. Rejected.

---

## R4 — Input validation library

**Decision**: Add **Zod** as a runtime dependency in `packages/web` and use
it for every Route Handler body schema (`packages/web/src/lib/auth/schemas.ts`)
and the env parser (`packages/web/src/env.ts`).

**Rationale**:
- Constitution VI explicitly names Zod ("a schema validator (Zod)") as the
  validation tool. Aligning with the constitution is mandatory, not a
  preference.
- TS-first ergonomics: schemas double as type definitions, killing the
  `as` casts we'd otherwise need.
- Tiny bundle impact (Zod is server-only here; the login page does
  client-side validation with native HTML `required`/`type="email"` + a
  small Zod-mirror or duplicate check on submit — no client bundle change
  vs. status quo).

**Alternatives considered**:
- *Valibot / ArkType*: smaller / faster, but Constitution VI names Zod
  explicitly. Re-litigating the choice would itself violate Principle V.
- *Hand-rolled type guards*: viable but loses single-source-of-truth between
  the request body type and the runtime validator. Rejected.

---

## R5 — Password policy (Clarification Q2)

**Decision**: No project-level password policy. Defer to whatever
Supabase Auth's default policy is at implementation time (currently
minimum-length 6 unless overridden in `config.toml`).

**Rationale**:
- Clarification Q2 was explicit: "Defer to the integrated auth provider's
  default policy; theStats does not impose its own additional rules."
- The Route Handler MUST surface the provider's rejection reason verbatim
  (FR-003) so the user sees a meaningful error, not a generic one.

**Implication for `sign-up` Route Handler**: catch Supabase's
`AuthApiError` for `password_too_short` / `weak_password` and map them to
the project's standard `{ error: { code: "invalid_input", message,
details: { field: "password", reason: <provider message> } } }` 400
response shape — without re-translating or paraphrasing the reason.

---

## R6 — Login-page composition

**Decision**: `app/login/page.tsx` is a thin **Server Component** that:
(a) reads the session via `createServerClient`, redirects to `/` (or
`?from=`) if already signed in (FR-014), and (b) renders a Client
Component `<LoginPanel />` containing `<AuthModeToggle />`,
`<SignInForm />`, and `<SignUpForm />`. Each form submits via `fetch` to
the matching `/api/auth/*` Route Handler.

**Rationale**:
- Constitution III: the "already signed in" check is data-fetching (auth
  read) and belongs in a Server Component; the form interactions belong in
  Client Components — they cannot share one file without violating the
  principle.
- Forms POST to Route Handlers rather than invoking Supabase Auth directly
  from the browser so the brute-force backoff (R2), the structured logging
  (Constitution VI), and the consistent error shape are enforced in one
  place. Browsers cannot bypass the throttle by talking to Supabase
  directly because the anon key alone does not get them through our
  handler-level rate limit.

**Alternatives considered**:
- *Server Actions instead of Route Handlers*: also acceptable per the
  constitution, but Route Handlers give us a clean integration-test
  surface (`fetch('/api/auth/sign-in')` works in Vitest with
  `next-test`-style helpers) and a stable contract documented in
  `/contracts/`. Route Handlers chosen.
- *Direct browser `supabase.auth.signInWithPassword`*: bypasses the
  brute-force backoff and the project's error shape. Rejected per
  Constitution VI.

---

## R7 — Confirmation callback URL

**Decision**: Configure Supabase Auth `Site URL` to the app's origin and
`Redirect URLs` to include `/auth/callback`. Implement `app/auth/callback/
route.ts` as a `GET` handler that exchanges the `?code=` for a session via
`supabase.auth.exchangeCodeForSession` and then `redirect()`s to `/` (or to
`?next=` if Supabase appended one).

**Rationale**:
- Standard `@supabase/ssr` pattern; no novelty.
- Single fixed callback URL means email templates don't need updating
  per-environment.

**Alternatives considered**:
- *Magic-link / OTP flow*: out of scope for v1 per spec Assumptions.

---

## R8 — Skipping a `profiles` table for v1

**Decision**: Do **not** create a `public.profiles` table.

**Rationale**:
- Constitution V (YAGNI): the spec explicitly defers profile management
  ("Account profile management is out of scope; v1 stores only email").
  A profiles table with only `id` + `created_at` adds nothing the
  `auth.users` row doesn't already carry.
- Adding it now would prematurely fix the v1 schema; the future profile
  feature can introduce the table with the exact columns it needs.

**Alternatives considered**:
- *Stub profile row created via trigger on sign-up*: the typical Supabase
  example pattern. Justifiable later when v2 adds profile fields. Premature
  now.

---

## R9 — Test strategy

**Decision**: Four layers, in increasing scope:

1. **Unit (Vitest, no I/O)**: Zod schemas (`schemas.test.ts`), env parser
   (`env.test.ts`), error mappers (`errors.test.ts`), backoff math (mirror
   of the SQL in a TS function used only by tests to assert the SQL's
   results — keeps the rule documented in two synchronized places).
2. **Component (Vitest + RTL, jsdom)**: `LoginPanel`, `SignInForm`,
   `SignUpForm`, `AuthPill`, `LoginPage` (Server Component test via
   `next/render` helper or direct call).
3. **Integration (Vitest, hits local Supabase)**: each Route Handler tested
   end-to-end against `supabase start` — covers auth + Zod validation +
   error shape + brute-force backoff. This is the layer the constitution's
   "Backend PR gate" specifically requires.
4. **E2E (Playwright)**: one spec covering the full flow — sign up with a
   fresh email, confirm via a deterministic test-only callback, sign out,
   sign back in, hit a hypothetical future-gated path and assert redirect
   to `/login?from=...`.

**Rationale**: matches the project's existing layering (existing
`tests/e2e/` directory + co-located unit tests + a new `tests/integration/`
that the constitution now requires). The integration layer is the one
genuinely new piece of test infrastructure for theStats — it requires the
Supabase CLI to be available locally (documented in `quickstart.md`).

**Alternatives considered**:
- *Mock the Supabase client*: explicitly prohibited by the constitution's
  intent (Principle VI) — mock-vs-real divergence would mask the kind of
  bug this feature exists to prevent. Integration tests run against a real
  Supabase. The CI doc'd in quickstart bootstraps a Supabase test project
  for the pipeline.

---

## Open follow-ups (not blocking implementation)

- `docs/quickstart.md` at the repo root still does not exist (carried from
  the constitution amendment). The Phase 1 `quickstart.md` written here is
  feature-scoped, not the project-wide quickstart.
- An error tracker is not yet configured (e.g. Sentry). The
  `logAuthEvent()` helper will log to `console.error` for now; the
  Constitution VI line "errors MUST be reported to the project's error
  tracker when one is configured" remains a separate, future task.
