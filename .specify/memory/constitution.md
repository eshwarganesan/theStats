<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.1.0
Bump rationale: MINOR — adds a new principle (VI. Secure & Typed Backend Boundary)
  and materially expands the Technology & Quality Standards "Backend" guidance
  to codify Supabase + Next.js Route Handlers as the backend stack. No prior
  principle is redefined or removed; existing principles I–V are unchanged in
  meaning.

Modified principles:
  - (no renames; I–V unchanged in title and meaning)

Added principles:
  - VI. Secure & Typed Backend Boundary (NON-NEGOTIABLE)

Added/expanded sections:
  - Technology & Quality Standards → "Backend" bullet rewritten for
    Supabase + Next.js Route Handlers; new bullets for "Database & RLS",
    "Migrations", and "Environment & Secrets".
  - Development Workflow & Quality Gates → added gate covering schema
    migrations and RLS verification on backend PRs.

Removed sections: none

Templates requiring updates:
  - ✅ .specify/templates/plan-template.md — Constitution Check references
       constitution dynamically; no structural change required (verified).
  - ✅ .specify/templates/tasks-template.md — Phase 2 (Foundational) already
       calls out database schema, auth, migrations, env config; no structural
       change required.
  - ✅ .specify/templates/spec-template.md — no new mandatory spec sections;
       backend principle constrains implementation, not user-facing scope.
  - ✅ .specify/templates/agent-file-template.md — no changes required.
  - ⚠ CLAUDE.md — "Active Technologies" section does not yet list Supabase /
       Next.js Route Handlers as backend. Follow-up: append a backend
       technology entry when the first backend feature lands via
       /speckit.specify (`update-agent-context.sh` will refresh it).
  - ⚠ README.md / docs/quickstart.md — still do not exist at repo root;
       carried over from 1.0.0 as a follow-up.

Follow-up TODOs:
  - Land a top-level README.md referencing this constitution (carried from
    1.0.0).
  - Add an `env.ts` (Zod-validated startup env parser) when backend work
    begins, per Principle VI "Environment & Secrets".
  - Create `supabase/migrations/` and commit the initial baseline migration
    when the first backend feature lands.
-->

# theStats Constitution

## Core Principles

### I. Test-Driven Development (NON-NEGOTIABLE)

Every behavior change MUST follow Red → Green → Refactor:

- A failing test (unit, component, integration, or end-to-end as appropriate) MUST be
  written and committed (or staged) BEFORE the implementation that makes it pass.
- Pull requests that introduce new behavior without an accompanying failing-then-passing
  test MUST be rejected.
- The default test stack is Vitest + Testing Library for unit/component coverage and
  Playwright for end-to-end flows. Coverage MUST NOT regress on `main`.

**Rationale**: theStats is a live scorekeeping system where incorrect stats or play-by-play
state corrupts the official record of a game. TDD is the cheapest defense against
regressions in scoring logic, undo/redo, and play-by-play sequencing.

### II. Strict Type Safety

All TypeScript code MUST compile under `strict: true` with no escape hatches:

- `any`, `@ts-ignore`, `@ts-expect-error` (without a written reason), non-null assertions
  (`!`), and unchecked casts (`as Foo`) are PROHIBITED in production code. Narrow with
  type guards or `unknown` instead.
- Public function signatures, exported types, React component props, and store/state
  shapes MUST be explicitly typed — inferred return types are allowed only for trivial
  internal helpers.
- `npm run typecheck` MUST pass on every commit pushed to a shared branch.

**Rationale**: Strict typing is the only mechanism that can statically catch the kind of
shape/contract errors that produce bad stats lines (e.g., a misspelled `fgm` field or a
nullable player reference). The cost of opting out is paid back in production bugs.

### III. Component-Driven Architecture

The Next.js frontend MUST be built from small, composable, single-purpose components:

- Components MUST have a single responsibility; mixing data-fetching, state mutation,
  and presentation in one component is PROHIBITED. Split into container/presentational
  layers or use hooks to isolate concerns.
- Shared UI primitives MUST live in a clearly named shared location (e.g.
  `packages/web/src/components/ui/`) and MUST NOT depend on feature-specific state.
- Each component MUST have an associated test (unit/component) that exercises its
  rendered output and key interactions in isolation.
- Server/Client component boundaries MUST be intentional: data-fetching belongs in
  Server Components or server actions; interactivity belongs in Client Components
  marked with `"use client"`.

**Rationale**: Live scorekeeping has many small, repeated UI surfaces (player rows,
score deltas, foul indicators). Composability keeps these consistent and lets us swap
or restyle them without rewriting screens.

### IV. Performant & Responsive UX

The user-facing experience MUST remain fast and usable on the devices scorekeepers
actually use (tablets and phones courtside):

- All interactive screens MUST be responsive from 360px width upward. Layout MUST NOT
  rely on hover-only affordances.
- A user-initiated action (recording a basket, foul, substitution) MUST reflect in the
  UI within 100ms on a mid-tier mobile device. Heavy work MUST move off the main
  thread or be deferred.
- Production builds MUST meet a Lighthouse Performance score ≥ 90 on the primary
  scorekeeping screen, and Core Web Vitals MUST stay in the "Good" range (LCP < 2.5s,
  INP < 200ms, CLS < 0.1).
- Bundle additions > 20KB gzipped to a route MUST be justified in the PR description.

**Rationale**: A scorekeeper using this app cannot wait on a slow tap during live play.
Performance is a correctness concern, not a polish item.

### V. Engineering Discipline & Industry Standards

All code MUST adhere to widely accepted software engineering practices:

- SOLID principles, DRY, and YAGNI guide design decisions. Premature abstraction is
  a defect; so is duplication that hides a real concept.
- Lint (`npm run lint`) and format checks MUST pass before merge. Warnings introduced
  by a PR MUST be resolved, not suppressed.
- Every PR MUST be reviewed by at least one other contributor (or, in solo periods,
  by the author after a documented self-review checklist) before merging to `main`.
- Public-facing modules MUST have meaningful names; comments are reserved for the
  non-obvious *why*, not the *what*.
- Secrets, credentials, and tokens MUST NEVER be committed. Configuration MUST be
  read from environment variables and validated at startup.

**Rationale**: theStats is intended to grow into a full-stack product. Discipline now
keeps refactor cost linear instead of exponential as the codebase grows.

### VI. Secure & Typed Backend Boundary (NON-NEGOTIABLE)

Every server endpoint — Next.js Route Handler (`app/api/**/route.ts`) or Server
Action — MUST be treated as a hardened, typed boundary between untrusted input and the
Supabase data layer:

- **Authentication at the boundary**: Every non-public handler MUST verify the
  caller's Supabase session via the server-side Supabase client (`@supabase/ssr` or
  equivalent) at the top of the handler. Authorization decisions (who may read/write
  what) MUST NOT rely on the client to send the right `userId` — derive the identity
  from the verified session.
- **Server-only secrets**: The Supabase `service_role` key MUST NEVER appear in a
  client bundle, a `NEXT_PUBLIC_*` env var, or a request initiated by a browser. Only
  the `anon` key and a user's authenticated JWT ship to the client. Server-only
  modules MUST be marked with `import "server-only"` so a misuse is a build error,
  not a runtime leak.
- **Row Level Security (RLS)**: RLS MUST be enabled on every Supabase table holding
  user- or game-scoped data, with explicit `SELECT`, `INSERT`, `UPDATE`, and `DELETE`
  policies. Shipping a table without policies is PROHIBITED. Using `service_role` to
  bypass RLS in a user-facing request path is PROHIBITED unless the PR description
  justifies it and the bypass is confined to admin/system endpoints.
- **Input validation**: Every Route Handler and Server Action MUST validate the
  request body, query params, path params, and any consumed headers using a schema
  validator (Zod) at the top of the handler. Untyped inputs, `as Foo` casts of
  parsed JSON, and "trust the client" branches are PROHIBITED. Validation failures
  MUST return `400` with a consistent error shape.
- **Generated DB types**: Supabase TypeScript types MUST be generated via
  `supabase gen types typescript` and committed to the repo. Table, column, and RPC
  names MUST be referenced through these generated types — string literals at call
  sites for `from('...')` / `rpc('...')` are PROHIBITED.
- **HTTP semantics & error shape**: Handlers MUST use correct HTTP methods (GET
  pure, POST/PUT/PATCH/DELETE mutating) and return correct status codes
  (`200/201/204`, `400`, `401`, `403`, `404`, `409`, `422`, `500`). Errors returned
  to the client MUST follow a single shape (`{ error: { code, message } }`) and MUST
  NOT include stack traces, raw Postgres error strings, or internal IDs.
- **Atomicity & idempotency**: Endpoints that touch multiple tables in one logical
  operation MUST execute the writes atomically — preferably via a Postgres function
  (RPC). Endpoints the client can retry (recording a play, ending a quarter) MUST
  be safely retryable: accept a client-provided idempotency key and enforce it with
  a unique constraint, or design the operation as a true upsert.
- **Migrations as code**: All schema changes (tables, columns, RLS policies, RPC
  functions, indexes) MUST be expressed as Supabase migrations under
  `supabase/migrations/` and checked into the repo. Editing schema directly via the
  Supabase dashboard on a shared environment is PROHIBITED.
- **Observability**: Every Route Handler MUST emit a structured log on entry and
  on exit (including the error path) with at least a request ID, the handler name,
  the authenticated user ID (if any), and the outcome (status code or error code).
  Unhandled errors MUST be reported to the project's error tracker once one is
  configured.

**Rationale**: The backend is the source of truth for game state and the only
enforcement point for who may read or change a game. A scoreboard with a leaky RLS
policy or an unvalidated body parameter is worse than no backend — it lies
confidently. Supabase + Route Handlers put the boundary in the same TypeScript
codebase as the UI, which makes doing this right cheap *and* makes skipping it cheap;
this principle removes the choice.

## Technology & Quality Standards

The canonical stack and tooling are non-negotiable unless amended via the governance
process:

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript 5.6+ in strict mode,
  Tailwind CSS for styling, Zustand for client state.
- **Backend**: Next.js 15 Route Handlers (`app/api/**/route.ts`) and Server Actions
  inside the existing `packages/web` package. Supabase (Postgres + Auth + Storage) is
  the persistence and authentication layer. Server-only code MUST be marked with
  `import "server-only"` or be reachable only from server runtime files. Database
  access MUST go through the generated Supabase TypeScript client; raw SQL is
  permitted inside Postgres RPC functions stored in migrations but MUST NOT be
  embedded as string literals in TypeScript. Shared types used by both client and
  server (e.g. domain models) MUST live in `packages/core`; backend-only helpers
  (handler utilities, Zod schemas for request bodies, Supabase server client
  factories) MUST live under `packages/web` server-only paths.
- **Database & RLS**: RLS MUST be enabled on every user- or game-scoped table.
  Policies MUST be written in migration files alongside the table definitions and
  reviewed in the same PR as the table. There is no "we'll add policies later" path.
- **Migrations**: All schema changes live in `supabase/migrations/`. PRs that change
  data shape MUST include the migration; PRs that only change application code MUST
  NOT silently rely on schema drift.
- **Environment & Secrets**: Environment variables MUST be parsed and validated at
  startup using a Zod schema (e.g. `env.ts`). Secrets (Supabase `service_role` key,
  third-party API keys) MUST live only in server-side env vars; the `NEXT_PUBLIC_*`
  prefix is reserved for non-secret client-visible config. Committing `.env*` files
  with real values is PROHIBITED.
- **Testing**: Vitest + @testing-library/react for unit/component, Playwright for
  end-to-end. Coverage report MUST be produced via `npm run test:coverage`. Route
  Handlers MUST have integration tests that exercise the auth + validation +
  Supabase paths (using a Supabase test project or a local Supabase instance).
- **Quality gates per PR**: `npm run typecheck`, `npm run lint`, `npm run test:coverage`,
  and `npm run test:e2e` MUST all pass. The aggregate `npm run test:all` exists for
  this purpose and MUST be green in CI.
- **Accessibility**: Interactive elements MUST be keyboard-operable and meet WCAG 2.1
  AA contrast requirements. Components MUST use semantic HTML and ARIA only where
  semantic elements are insufficient.
- **Dependencies**: New runtime dependencies MUST be justified in the PR description
  (problem solved, alternatives considered, bundle-size impact).

## Development Workflow & Quality Gates

- **Branching**: Feature work happens on branches created via the speckit feature
  workflow. Direct commits to `main` are PROHIBITED.
- **Spec-first**: Non-trivial features MUST go through `/speckit.specify` →
  `/speckit.plan` → `/speckit.tasks` before implementation. The plan's Constitution
  Check gate MUST be satisfied (or its violations justified in Complexity Tracking)
  before Phase 0 research begins.
- **Test order within a task**: For every implementation task, the corresponding test
  task MUST be completed first and MUST be observed failing before the implementation
  task begins (Principle I).
- **Backend PR gate**: Any PR that adds or changes a Route Handler, Server Action,
  or Supabase schema MUST (a) include the relevant `supabase/migrations/` file,
  (b) include or update the RLS policies for any touched table, and (c) include an
  integration test that exercises the auth + validation path. Reviewers MUST verify
  Principle VI compliance explicitly.
- **CI**: All quality gates above run in CI on every PR. A red CI run blocks merge.
- **Reviews**: Reviewers MUST verify constitution compliance — especially Principles
  I (TDD), II (type safety), IV (performance budgets), and VI (backend boundary) —
  and MUST request changes if any principle is violated without justification.

## Governance

- This constitution supersedes ad-hoc conventions, prior practices, and individual
  preferences. Where this document and other guidance conflict, this document wins.
- **Amendments**: Any contributor MAY propose an amendment via a PR that modifies
  `.specify/memory/constitution.md`. The PR description MUST state (a) what is
  changing, (b) why, and (c) the proposed semver bump and rationale. Amendments
  require approval from at least one other contributor.
- **Versioning policy**: Semantic versioning of this document — MAJOR for backward
  incompatible removals or redefinitions of a principle; MINOR for newly added
  principles or materially expanded guidance; PATCH for clarifications, wording, or
  typo fixes that do not change meaning.
- **Compliance reviews**: Every PR review MUST treat the constitution as a checklist.
  Any complexity that violates a principle MUST be recorded in the plan's
  Complexity Tracking table with a concrete justification and a rejected simpler
  alternative.
- **Runtime guidance**: Agent-facing operational guidance (file layouts, command
  conventions, etc.) belongs in agent guidance files (e.g. `CLAUDE.md`,
  `.specify/templates/agent-file-template.md`) — not in this constitution. This
  document is for principles, not procedures.

**Version**: 1.1.0 | **Ratified**: 2026-04-26 | **Last Amended**: 2026-05-31
