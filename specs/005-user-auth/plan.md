# Implementation Plan: User Authentication

**Branch**: `005-user-auth` | **Date**: 2026-05-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-user-auth/spec.md`

## Summary

Ship the **mechanism** for account-gated access to theStats — a login page, a
small set of auth Route Handlers, a session-refresh middleware, and the schema
+ infrastructure to support brute-force protection and unconfirmed-account
cleanup. The spec is hybrid (per `/speckit.clarify`): anonymous local
scorekeeping continues to work as today; signing in only unlocks future
account-gated features (sync, save, multi-device). This feature therefore
**does not gate any existing screen** — it provides the `/login` page, the
`/api/auth/*` endpoints, a `requireAuth()` helper for future gated routes, and
the session/cookie machinery the rest of the backend will rely on. Auth
provider is Supabase Auth (already pulled in via `@supabase/ssr` and
`@supabase/supabase-js`); the three placeholder files at
`packages/web/src/lib/supabase/{admin,client,server}.ts` are filled in as part
of Phase 1.

## Technical Context

**Language/Version**: TypeScript 5.6.3 (strict mode, no escape hatches per Constitution Principle II)
**Primary Dependencies**: Next.js 15.1 (App Router, Route Handlers, Server Components, middleware), React 19, `@supabase/ssr` 0.10, `@supabase/supabase-js` 2.106, **Zod** (new — for input validation per Constitution Principle VI), existing UI deps (Tailwind 3.4, `clsx`, `tailwind-merge`)
**Storage**: Supabase Postgres. Uses the managed `auth.users` table. Adds one new `public.auth_attempts` table for per-account + per-IP brute-force backoff (Clarification Q4). Schema delivered as Supabase migrations.
**Testing**: Vitest + @testing-library/react (unit & component, jsdom), Playwright (E2E). New: a `tests/integration/` directory holding Route Handler tests that exercise the auth + validation paths against a local Supabase instance (per Constitution Principle VI "Backend PR gate"). Supabase CLI required locally.
**Target Platform**: Browser-first web app. Mobile-responsive from 360px upward (Constitution Principle IV). Server runtime is Vercel Edge / Node on Next.js 15.
**Project Type**: Full-stack web application in an existing monorepo. Frontend + backend co-located in `packages/web` (Next.js App Router); shared domain types in `packages/core`. No separate backend package.
**Performance Goals**: Login form interactive within 100ms of nav (Constitution IV); auth round-trip ≤1s p95 on a healthy network (informs `<60s` signup SC-001 and `<15s` sign-in SC-002 by leaving headroom for user input).
**Constraints**: 360px responsive (SC-006); same `clsx + tailwind-merge` `cn` helper as the rest of the app; the brute-force backoff is implemented atomically in Postgres (RPC) per Constitution VI; the `service_role` Supabase key is server-only; all auth tables use RLS.
**Scale/Scope**: Hobby-scale (sub-1k users for v1). Concurrency is not a meaningful constraint. The plan is sized for one login page, ~4 Route Handlers, 1 middleware, 1 migration, and ~6 component-test files + 1 E2E spec.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` v1.1.0.

| Principle | Status | Notes |
|---|---|---|
| I. TDD (NON-NEGOTIABLE) | ✅ | Every story has tests-first tasks (component tests for forms, integration tests for handlers, E2E for full flows). See Phase 1 contracts → `/speckit.tasks` will emit failing-test tasks before each implementation task. |
| II. Strict Type Safety | ✅ | No `any` / `as` / `!` introduced. Zod parses request bodies into typed values; generated Supabase types replace string-typed table refs (see Phase 1 → `database.types.ts`). |
| III. Component-Driven Architecture | ✅ | `LoginPage` is a thin Server Component shell; interactive bits split into `SignInForm`, `SignUpForm`, `AuthModeToggle`, `AuthPill` (top-bar affordance). Each gets its own component test. No mixing of fetch + mutation + presentation in one component. |
| IV. Performant & Responsive UX | ✅ | Login UI is tiny (≪20KB gzipped budget). Layout tested at 360px width. Cookie-based sessions mean no client-side bootstrapping race. |
| V. Engineering Discipline | ✅ | New Zod dep justified in the PR description (Constitution VI requires schema validation at boundary). No secrets committed; envs read & Zod-validated at startup via new `packages/web/src/env.ts`. |
| VI. Secure & Typed Backend Boundary (NON-NEGOTIABLE) | ✅ | (a) Auth verified at the boundary — `sign-out` reads session via server Supabase client; `sign-up` / `sign-in` are public by design. (b) `service_role` is `import "server-only"` in `admin.ts` and used only by the daily unconfirmed-purge cron + admin RPC paths. (c) RLS enabled on `public.auth_attempts` with policies that block all client roles (service-role only). (d) Zod parses every Route Handler body. (e) Generated DB types committed; all `from('...')` / `rpc('...')` use the generated `Database` type. (f) HTTP semantics: POST only for mutations; consistent `{ error: { code, message, retry_after_seconds? } }` error shape; status codes 200/204/400/401/403/409/429/500. (g) Atomicity: brute-force backoff is a single Postgres RPC (`record_auth_attempt`) so increment + next-allowed-at are atomic; idempotency keys are not needed for these endpoints (the underlying Supabase Auth calls are themselves idempotent for sign-in and deduplicated by email for sign-up). (h) Migrations as code: `packages/web/supabase/migrations/0001_user_auth.sql`. (i) Observability: a single `logAuthEvent(handler, userId|null, outcome, request_id)` helper called on entry/exit of each handler. |

**Result**: All gates pass. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/005-user-auth/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (auth Route Handler contracts)
│   ├── post_sign_up.md
│   ├── post_sign_in.md
│   ├── post_sign_out.md
│   ├── post_resend_confirmation.md
│   └── get_auth_callback.md
└── tasks.md             # Phase 2 output (NOT created here — /speckit.tasks)
```

### Source Code (repository root)

Existing monorepo layout: `packages/web` (Next.js 15 App Router) is the only
runtime package; `packages/core` holds pure-TS shared domain code. This
feature touches only `packages/web` (plus a one-line export in
`packages/core` if any shared auth-related type emerges — none expected for v1).

```text
packages/web/
├── middleware.ts                                  # NEW — refreshes Supabase session cookie on every request
├── supabase/                                      # NEW — Supabase CLI workspace (config + migrations)
│   ├── config.toml
│   └── migrations/
│       └── 0001_user_auth.sql                     # auth_attempts table + RPCs + pg_cron unconfirmed purge
├── src/
│   ├── env.ts                                     # NEW — Zod-validated env (server + public split)
│   ├── env.test.ts                                # NEW
│   ├── app/
│   │   ├── layout.tsx                             # existing; adds <AuthPill /> to header
│   │   ├── login/
│   │   │   ├── page.tsx                           # NEW — Server Component shell; renders LoginPanel
│   │   │   └── page.test.tsx                      # NEW
│   │   ├── auth/
│   │   │   └── callback/
│   │   │       └── route.ts                       # NEW — GET; Supabase OAuth-style code exchange
│   │   └── api/
│   │       └── auth/
│   │           ├── sign-up/route.ts               # NEW — POST
│   │           ├── sign-in/route.ts               # NEW — POST
│   │           ├── sign-out/route.ts              # NEW — POST
│   │           └── resend-confirmation/route.ts   # NEW — POST
│   ├── components/
│   │   └── auth/                                  # NEW
│   │       ├── login-panel.tsx                    # Client Component wrapper that toggles sign-in / sign-up
│   │       ├── login-panel.test.tsx
│   │       ├── sign-in-form.tsx
│   │       ├── sign-in-form.test.tsx
│   │       ├── sign-up-form.tsx
│   │       ├── sign-up-form.test.tsx
│   │       ├── auth-pill.tsx                      # Top-bar affordance (Sign in | Signed in as X / Sign out)
│   │       └── auth-pill.test.tsx
│   └── lib/
│       ├── auth/                                  # NEW
│       │   ├── schemas.ts                         # Zod schemas: signUpInput, signInInput, resendInput
│       │   ├── schemas.test.ts
│       │   ├── require-auth.ts                    # Helper for future gated routes/layouts
│       │   ├── require-auth.test.ts
│       │   ├── log-auth-event.ts                  # Structured-log helper per Constitution VI
│       │   └── errors.ts                          # AuthErrorCode union + toJsonError helper
│       └── supabase/                              # EXISTING placeholder files filled in
│           ├── admin.ts                           # server-only — uses SERVICE_ROLE
│           ├── client.ts                          # browser client (anon)
│           ├── server.ts                          # server client for Route Handlers / Server Components
│           └── database.types.ts                  # NEW — generated via `supabase gen types typescript`
└── tests/
    ├── integration/                               # NEW
    │   └── auth/
    │       ├── sign-up.test.ts
    │       ├── sign-in.test.ts
    │       ├── sign-out.test.ts
    │       ├── resend-confirmation.test.ts
    │       ├── callback.test.ts
    │       └── brute-force-backoff.test.ts
    └── e2e/
        └── auth.spec.ts                           # NEW — full sign-up → confirm → sign-in → sign-out flow + deep-link redirect
```

**Structure Decision**: Single-package full-stack layout in `packages/web` per
Constitution v1.1.0 ("Backend: Next.js Route Handlers and Server Actions
inside the existing `packages/web` package"). No new top-level package. The
three existing empty Supabase placeholder files at
`packages/web/src/lib/supabase/{admin,client,server}.ts` are filled in
(rather than replaced), preserving the import paths the user has already
anchored elsewhere in the project.

## Complexity Tracking

> No constitutional violations identified. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *(none)* | | |
