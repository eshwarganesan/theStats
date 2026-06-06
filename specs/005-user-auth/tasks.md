---
description: "Task list for the User Authentication feature"
---

# Tasks: User Authentication

**Input**: Design documents from `/specs/005-user-auth/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Tests are MANDATORY for theStats per Constitution Principle I (Test-Driven Development, NON-NEGOTIABLE). Every user story below ships failing tests authored BEFORE the implementation tasks for that story. Additionally, Constitution Principle VI (Secure & Typed Backend Boundary) "Backend PR gate" requires integration tests on every Route Handler — these are included in each story phase.

**Organization**: Tasks are grouped by user story so each P1/P2/P3 increment can be implemented, tested, and demoed independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Task can run in parallel with other [P] tasks in the same phase (different files, no upstream dependency on an in-flight task)
- **[Story]**: Which user story this task belongs to ([US1], [US2], [US3]). Setup, Foundational, and Polish tasks have no story label.
- Each task names the **exact file path** to create or modify.

## Path Conventions

This is a Next.js 15 monorepo (per [plan.md](./plan.md)). All paths below are relative to the repository root unless noted:

- Frontend + backend: `packages/web/`
- Shared domain code: `packages/core/`
- Supabase CLI workspace: `packages/web/supabase/`
- Tests (co-located): `packages/web/src/**/*.test.{ts,tsx}`
- Integration tests (Route Handlers): `packages/web/tests/integration/auth/`
- E2E (Playwright): `packages/web/tests/e2e/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bring Supabase tooling into the repo, install the one new dependency (Zod), and lay down the schema + generated types every later phase depends on.

- [X] T001 Install Zod as a runtime dependency in `packages/web` (`cd packages/web && npm install zod`) and commit the updated `packages/web/package.json` + root `package-lock.json`. Justify the new dep in the PR description per Constitution Principle V.
- [X] T002 Run `supabase init` from `packages/web/` to scaffold `packages/web/supabase/config.toml` and `packages/web/supabase/migrations/`. Commit both.
- [X] T003 Edit `packages/web/supabase/config.toml`: set `[api] site_url = "http://localhost:3000"`, add `/auth/callback` to `additional_redirect_urls`, set `[auth] enable_signup = true`, `enable_confirmations = true`, `jwt_expiry = 3600`, and `[auth.security] refresh_token_lifetime = 2592000` (30 days per Clarification Q3 / FR-008).
- [X] T004 [P] Author `packages/web/supabase/migrations/0001_user_auth.sql` per [data-model.md](./data-model.md): (a) `CREATE TABLE public.auth_attempts (key text PRIMARY KEY, consecutive_failures int NOT NULL DEFAULT 0 CHECK (...), next_allowed_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`; (b) `ALTER TABLE public.auth_attempts ENABLE ROW LEVEL SECURITY` with deny-all policies for anon/authenticated; (c) `CREATE OR REPLACE FUNCTION public.is_auth_attempt_allowed(keys text[]) RETURNS jsonb SECURITY DEFINER ...`; (d) `CREATE OR REPLACE FUNCTION public.record_auth_attempt(keys text[], success boolean) RETURNS void SECURITY DEFINER ...` with the backoff formula `least(power(2, consecutive_failures - 1)::int, 30)`; (e) `GRANT EXECUTE` on both functions to `anon` and `authenticated`; (f) `CREATE EXTENSION IF NOT EXISTS pg_cron`; (g) `SELECT cron.schedule('purge_unconfirmed_users', '0 4 * * *', $$ DELETE FROM auth.users WHERE email_confirmed_at IS NULL AND created_at < now() - interval '7 days' $$)`.
- [X] T005 [P] Create `packages/web/.env.example` listing the three vars with inline comments: `NEXT_PUBLIC_SUPABASE_URL=`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=`, `SUPABASE_SERVICE_ROLE_KEY=` plus a warning that `SUPABASE_SERVICE_ROLE_KEY` MUST NEVER be prefixed with `NEXT_PUBLIC_` (Constitution Principle VI). Ensure `.env.local` is already gitignored.
- [X] T006 With `supabase start` running locally, generate the Supabase TypeScript types: `cd packages/web && npx supabase gen types typescript --local > src/lib/supabase/database.types.ts`. Commit `packages/web/src/lib/supabase/database.types.ts`. Document the regeneration command in the PR description per Constitution Principle VI ("Generated DB types MUST be generated via `supabase gen types typescript` and committed").

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The auth-shared modules that every Route Handler and Server Component will import. This phase delivers env validation, Zod schemas, the typed error model, the three Supabase clients (admin/server/client), the session-refresh middleware, the `requireAuth()` helper, and the structured logger.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests for Foundational layer (MANDATORY — write FIRST and observe FAIL)

- [X] T007 [P] Author failing unit test `packages/web/src/env.test.ts` asserting (a) a complete env parses, (b) missing `SUPABASE_SERVICE_ROLE_KEY` throws at parse time, (c) a `NEXT_PUBLIC_SUPABASE_URL` that is not a URL throws.
- [X] T008 [P] Author failing unit test `packages/web/src/lib/auth/schemas.test.ts` covering `signUpInput` (rejects bad emails, lowercases/trims email, accepts any non-empty password per R5, rejects absolute-URL `next` values), `signInInput` (identical password rule), `resendInput` (email-only).
- [X] T009 [P] Author failing unit test `packages/web/src/lib/auth/errors.test.ts` asserting `toJsonError()` produces the exact response shapes documented in [contracts/post_sign_up.md](./contracts/post_sign_up.md) and [contracts/post_sign_in.md](./contracts/post_sign_in.md): `{ error: { code, message, details?, retry_after_seconds? } }` and that codes are constrained to the `AuthErrorCode` union.
- [X] T010 [P] Author failing unit test `packages/web/src/lib/auth/require-auth.test.ts` covering (a) returns the session when a session cookie is present, (b) calls Next's `redirect()` to `/login?from=<encoded path>` when no session is present.
- [X] T011 [P] Author failing integration test `packages/web/tests/integration/auth/brute-force-backoff.test.ts` against local Supabase: calls `record_auth_attempt(['e:test@example.com', 'ip:1.2.3.4'], false)` five times, asserts the returned `is_auth_attempt_allowed` `retry_after_seconds` sequence is monotonically non-decreasing and capped at 30, then calls `record_auth_attempt([...], true)` and asserts the next `is_auth_attempt_allowed` returns `{ allowed: true, retry_after_seconds: 0 }`.

### Foundational implementation

- [X] T012 Implement `packages/web/src/env.ts` exporting a Zod-parsed `env` object (server-only secrets and `NEXT_PUBLIC_*` split into two schemas). Mark the file `import "server-only"` only if it also exposes the service-role key; otherwise split into `env.server.ts` and `env.public.ts`. Make T007 pass.
- [X] T013 [P] Implement `packages/web/src/lib/auth/schemas.ts` exporting `signUpInput`, `signInInput`, `resendInput` per the validation rules in `contracts/*.md`. Make T008 pass.
- [X] T014 [P] Implement `packages/web/src/lib/auth/errors.ts` exporting an `AuthErrorCode` union (`"invalid_input" | "email_exists" | "invalid_credentials" | "email_unconfirmed" | "rate_limited" | "missing_code" | "internal_error"`) and a `toJsonError(code, message, opts?)` helper that emits `NextResponse.json` with the correct status code and the contract-documented body shape. Make T009 pass.
- [X] T015 [P] Implement `packages/web/src/lib/auth/log-auth-event.ts` exporting `logAuthEvent(handler: string, userId: string | null, outcome: string, requestId: string)` that emits a single structured JSON line via `console.log` for now (TODO comment referencing the Constitution VI "report to error tracker once configured" follow-up).
- [X] T016 [P] Implement `packages/web/src/lib/supabase/admin.ts` (fill in the existing empty file): `import "server-only"` at the top, export a `createAdminClient()` factory that uses `env.SUPABASE_SERVICE_ROLE_KEY` and the Supabase URL. Add a JSDoc warning that this client bypasses RLS and MUST only be used from the unconfirmed-purge path / admin-only routes.
- [X] T017 [P] Implement `packages/web/src/lib/supabase/server.ts` (fill in the existing empty file): export `createServerClient()` using `@supabase/ssr`'s `createServerClient` helper wired to Next's `cookies()` (read/write) so Route Handlers and Server Components can read sessions and let the middleware refresh cookies on subsequent requests.
- [X] T018 [P] Implement `packages/web/src/lib/supabase/client.ts` (fill in the existing empty file): export `createBrowserClient()` using `@supabase/ssr`'s browser helper. Anon key only; never references the service-role key (verified by ESLint rule against importing `env.SUPABASE_SERVICE_ROLE_KEY` from a non-`server-only` file).
- [X] T019 Implement `packages/web/middleware.ts` at the workspace root: on every request, instantiate a server Supabase client wired to the incoming request's cookies and call `supabase.auth.getUser()` to refresh the access token; pass through the (possibly updated) response. Export the standard Next.js `config = { matcher: [...] }` that runs on all paths except `/_next/static`, images, and the favicon (so the cookie refresh happens on every page load, satisfying FR-008's 30-day sliding window).
- [X] T020 Implement `packages/web/src/lib/auth/require-auth.ts`: exports `async function requireAuth(opts?: { from?: string })` which calls `createServerClient()`, reads the session, and if absent calls Next's `redirect("/login?from=<encoded>")`; otherwise returns `{ session, user }`. Make T010 pass.

**Checkpoint**: Foundation ready — all three user stories can now proceed in parallel (subject to their inter-story dependencies stated below).

---

## Phase 3: User Story 1 - Sign up for a new account (Priority: P1) 🎯 MVP

**Goal**: A visitor with no account can reach `/login`, switch to "Sign up", enter an email and password, submit, receive a confirmation email, click the confirmation link, and land back in the app authenticated and confirmed. The top-bar `AuthPill` reflects their signed-in identity.

**Independent Test**: Per spec US1: a fresh-browser visitor signs up with a new email + valid password, then clicks the confirmation link delivered by the test Mailpit, and is redirected to `/` with the `AuthPill` showing their email. The end-to-end Playwright spec exercises this.

### Tests for User Story 1 (MANDATORY per Constitution Principle I) ⚠️

> Write each test FIRST and observe it FAIL before starting the matching implementation task.

- [X] T021 [P] [US1] Author failing integration test `packages/web/tests/integration/auth/sign-up.test.ts` covering every scenario in [contracts/post_sign_up.md](./contracts/post_sign_up.md): happy path → 200 + cookies + outbox entry, duplicate email → 409, invalid email → 400, provider-rejected password → 400 with `details.reason` echoing the provider's message, backoff progression on repeated submits, `next: "https://evil.com"` → 400 invalid_input.
- [X] T022 [P] [US1] Author failing integration test `packages/web/tests/integration/auth/callback.test.ts` covering every scenario in [contracts/get_auth_callback.md](./contracts/get_auth_callback.md): valid code → 303 to `/` + cookies + `email_confirmed_at` set, `next: "/some/path"` → 303 to `/some/path`, `next: "https://evil.com"` → 303 to `/` (fallback), expired/invalid code → 303 to `/login?error=confirmation_failed`, missing code → 303 to `/login?error=missing_code`.
- [X] T023 [P] [US1] Author failing component test `packages/web/src/components/auth/sign-up-form.test.tsx`: renders email + password inputs with `type="email"` and `type="password"` + `autoComplete="new-password"`, submit calls `fetch('/api/auth/sign-up', ...)` with the typed body, on 400 surfaces the `details.reason` next to the field, on 409 surfaces a "Sign in instead" call to action that switches the panel mode.
- [X] T024 [P] [US1] Author failing component test `packages/web/src/components/auth/login-panel.test.tsx` (US1 scope): renders the `<SignUpForm />` and an unconfirmed-account banner state when prompted; does NOT yet render a sign-in toggle (US2 adds that).
- [X] T025 [P] [US1] Author failing component test `packages/web/src/app/login/page.test.tsx`: when no session, renders `<LoginPanel />`; when a session is present (mocked), invokes Next's `redirect()` to `/` (FR-014). Reads `?from=` and forwards it to the panel as the post-auth destination.
- [X] T026 [P] [US1] Author failing component test `packages/web/src/components/auth/auth-pill.test.tsx` (US1 scope): renders "Sign in" link for an anonymous viewer; renders the email + "Pending confirmation" badge when a session exists but `email_confirmed_at` is null; renders just the email when confirmed. NO sign-out button yet (US3 adds it).
- [X] T027 [US1] Author the initial failing Playwright spec `packages/web/tests/e2e/auth.spec.ts`: a `test.describe("US1: sign up", ...)` block that completes the full sign-up → mailpit-pickup → callback → home flow against the dev server + local Supabase, asserting the `AuthPill` shows the registered email on `/` after confirmation.

### Implementation for User Story 1

- [X] T028 [P] [US1] Implement `packages/web/src/app/api/auth/sign-up/route.ts` per [contracts/post_sign_up.md](./contracts/post_sign_up.md): Zod-parse body, throttle-check via `is_auth_attempt_allowed`, call `supabase.auth.signUp({ email, password, options: { emailRedirectTo } })`, map provider errors to the contract's status codes, record the attempt, call `logAuthEvent`. Make T021 pass.
- [X] T029 [P] [US1] Implement `packages/web/src/app/auth/callback/route.ts` per [contracts/get_auth_callback.md](./contracts/get_auth_callback.md): parse `code` + `next`, open-redirect-guard `next`, call `supabase.auth.exchangeCodeForSession(code)`, redirect to `next || "/"` on success or `/login?error=confirmation_failed` on failure, call `logAuthEvent`. Make T022 pass.
- [X] T030 [P] [US1] Implement `packages/web/src/components/auth/sign-up-form.tsx` as a Client Component: controlled email + password fields, submit handler that POSTs to `/api/auth/sign-up`, surfaces the typed error responses to the UI per T023. Use the existing `cn` helper from `packages/web/src/lib/utils.ts`. Make T023 pass.
- [X] T031 [P] [US1] Implement `packages/web/src/components/auth/auth-pill.tsx` (US1 scope) as a Server Component that reads the current session via `createServerClient()` and renders one of: anonymous "Sign in" link, signed-in email with "Pending confirmation" badge, or signed-in email. Make T026 pass.
- [X] T032 [US1] Implement `packages/web/src/components/auth/login-panel.tsx` (US1 scope): Client Component that renders the `<SignUpForm />`. Accepts a `from` prop to forward into the form. Depends on T030. Make T024 pass.
- [X] T033 [US1] Implement `packages/web/src/app/login/page.tsx` as a Server Component: read the session via `createServerClient()`, `redirect()` to `searchParams.from || "/"` if signed in (FR-014), otherwise render `<LoginPanel from={searchParams.from} />`. Depends on T032. Make T025 pass.
- [X] T034 [US1] Update `packages/web/src/app/layout.tsx` to render `<AuthPill />` inside the page chrome (e.g. a header slot). Verify Constitution IV's 360px responsiveness holds; the pill MUST NOT push existing UI off-screen on a 360px viewport. Depends on T031.

**Checkpoint**: User Story 1 is fully functional. A new visitor can sign up, confirm, and see their identity in the `AuthPill`. The login page is reachable; the panel currently only offers sign-up (the sign-in tab arrives in US2).

---

## Phase 4: User Story 2 - Sign in to an existing account (Priority: P2)

**Goal**: A returning user with a confirmed account can sign in via the existing `/login` page (now with a Sign in / Sign up toggle), land back in the app or on their deep-linked destination, and stay signed in across reloads and browser restarts within the 30-day sliding window.

**Independent Test**: Per spec US2: with a previously created + confirmed account, navigate to `/login`, sign in, verify the user is taken to `/` and remains signed in after a full page reload. Plus: an unconfirmed user signing in receives a 403 with the resend-confirmation affordance; backoff progresses on repeated wrong-password submits and resets on a correct submit.

### Tests for User Story 2 (MANDATORY per Constitution Principle I) ⚠️

- [X] T035 [P] [US2] Author failing integration test `packages/web/tests/integration/auth/sign-in.test.ts` covering every scenario in [contracts/post_sign_in.md](./contracts/post_sign_in.md): happy path → 200 + cookies, wrong password → 401 generic, nonexistent email → 401 with **identical** body and status as wrong password (FR-015), case-insensitive email match, unconfirmed user → 403 `email_unconfirmed` and NO session cookies, backoff sequence 1→2→4→8→16→30 across consecutive failures, successful sign-in resets the counter.
- [X] T036 [P] [US2] Author failing integration test `packages/web/tests/integration/auth/resend-confirmation.test.ts` covering [contracts/post_resend_confirmation.md](./contracts/post_resend_confirmation.md): unconfirmed email → 200 + queued message, already-confirmed email → 200 + NO queued message + identical body, unknown email → 200 + NO queued message + identical body, throttle shared with sign-up/sign-in for the same email.
- [X] T037 [P] [US2] Author failing component test `packages/web/src/components/auth/sign-in-form.test.tsx`: renders email + password inputs with `autoComplete="email"` / `current-password`, submit calls `fetch('/api/auth/sign-in', ...)`, on 401 shows the generic error, on 403 `email_unconfirmed` shows a "Resend confirmation email" button that POSTs to `/api/auth/resend-confirmation`, on 429 disables the submit button for the returned `retry_after_seconds`.
- [X] T038 [US2] Extend `packages/web/src/components/auth/login-panel.test.tsx` (modifies the file created in T024) to cover the new mode toggle: panel defaults to whichever mode `props.initialMode` requests (default `"sign-in"`); toggling between Sign in / Sign up swaps which form is mounted; the toggle preserves any `from` query param.
- [X] T039 [US2] Extend `packages/web/tests/e2e/auth.spec.ts` (modifies the file created in T027) with a `test.describe("US2: sign in", ...)` block: signs out an existing user (using the API directly to skip US3), then drives the UI flow of switching to the Sign in tab, entering credentials, and asserting redirect to `/`. Also verifies survival of a full-page reload and a brand-new browser context with the persisted cookies.

### Implementation for User Story 2

- [X] T040 [P] [US2] Implement `packages/web/src/app/api/auth/sign-in/route.ts` per [contracts/post_sign_in.md](./contracts/post_sign_in.md): Zod parse, throttle-check, call `supabase.auth.signInWithPassword`, branch on `email_confirmed_at`, return 401 for invalid creds OR nonexistent email with identical bodies, return 403 `email_unconfirmed` for the unconfirmed branch (after a server-side `signOut` to ensure no session is established), record attempts, `logAuthEvent`. Make T035 pass.
- [X] T041 [P] [US2] Implement `packages/web/src/app/api/auth/resend-confirmation/route.ts` per [contracts/post_resend_confirmation.md](./contracts/post_resend_confirmation.md): Zod parse, throttle-check, call `supabase.auth.resend({ type: "signup", email })`, **always** return 200 (FR-015) regardless of provider outcome, record attempts, `logAuthEvent`. Make T036 pass.
- [X] T042 [P] [US2] Implement `packages/web/src/components/auth/sign-in-form.tsx` mirroring the sign-up form's contract-handling pattern; on a 403 `email_unconfirmed` render the resend CTA bound to the resend endpoint. Make T037 pass.
- [X] T043 [US2] Update `packages/web/src/components/auth/login-panel.tsx` (modifies the file from T032): introduce an internal `mode: "sign-in" | "sign-up"` state, render an accessible tablist toggle, and mount the corresponding form. Depends on T042. Make T038 pass.

**Checkpoint**: User Stories 1 AND 2 both work. A visitor can sign up, confirm, sign out (via cookie clearing for now — sign-out endpoint arrives in US3), and sign back in.

---

## Phase 5: User Story 3 - Sign out of the current session (Priority: P3)

**Goal**: A signed-in user has a clearly visible sign-out control in the `AuthPill`. Triggering it ends the session, returns the user to the main scorekeeping screen in anonymous mode, and any subsequent attempt to reach an account-gated screen redirects to `/login` (FR-009, hybrid mode per Clarification Q1). Anonymous-accessible screens remain reachable without redirect.

**Independent Test**: Per spec US3: while signed in, click the sign-out control in the `AuthPill`, then attempt to navigate directly to the demonstration account-gated route `/account` (added in this phase), and assert the redirect to `/login?from=%2Faccount`. Hitting `/` after sign-out continues to load normally (anonymous local mode).

### Tests for User Story 3 (MANDATORY per Constitution Principle I) ⚠️

- [X] T044 [P] [US3] Author failing integration test `packages/web/tests/integration/auth/sign-out.test.ts` covering [contracts/post_sign_out.md](./contracts/post_sign_out.md): signed-in caller → 204 + cookies cleared + subsequent authenticated request fails, unauthenticated caller → 204 (no-op), sign-out on one cookie set does not invalidate a second device's session.
- [X] T045 [US3] Extend `packages/web/src/components/auth/auth-pill.test.tsx` (modifies the file from T026): when signed in, renders a sign-out button; clicking it calls `fetch('/api/auth/sign-out', { method: 'POST' })` and then refreshes the page (or navigates to `/`).
- [X] T046 [US3] Extend `packages/web/tests/e2e/auth.spec.ts` (modifies the file from T027 / T039) with a `test.describe("US3: sign out + auth gate", ...)` block: covers (a) sign-out reverts the app to anonymous mode on `/` (no redirect), (b) hitting `/account` after sign-out redirects to `/login?from=%2Faccount`, (c) hitting `/account` while signed in renders the demonstration page.

### Implementation for User Story 3

- [X] T047 [P] [US3] Implement `packages/web/src/app/api/auth/sign-out/route.ts` per [contracts/post_sign_out.md](./contracts/post_sign_out.md): read session via `createServerClient()`, call `supabase.auth.signOut()` if a session exists, return 204; `logAuthEvent` on entry/exit. Make T044 pass.
- [X] T048 [US3] Update `packages/web/src/components/auth/auth-pill.tsx` (modifies the file from T031) to add a Client Component child that renders the sign-out button when a session is present, POSTs to `/api/auth/sign-out`, then calls `router.refresh()` (or `router.push("/")` if the current route is account-gated). Make T045 pass.
- [X] T049 [P] [US3] Implement the demonstration account-gated route `packages/web/src/app/(authenticated)/account/page.tsx` as a Server Component that calls `await requireAuth({ from: "/account" })` at the top and renders a minimal "Signed in as {email}" view. This is intentionally bare — it exists to anchor the auth gate and provide a test target; future features will expand it. (Per spec Assumptions: profile management is out of scope; this page reads `email` only.) Make T046 pass.

**Checkpoint**: All three user stories functional. The auth feature is end-to-end usable: sign up → confirm → sign in → use the app → sign out → revert to anonymous → hit an account-gated route → redirected to `/login`.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify constitution gates one more time, lock down budgets, and capture any deferred follow-ups in the PR description.

- [X] T050 Run `npm run test:all` from the repo root. Resolve any coverage regressions in `packages/web` so the new code does not drop overall coverage on `main` (Constitution Principle I).
- [X] T051 Add a `size-limit` budget for the `/login` and `/account` route bundles in `packages/web/package.json`'s `size-limit` section (Constitution Principle IV: bundle additions >20KB gzipped MUST be justified). Pick a budget ≤30KB gzipped for `/login` and ≤20KB for `/account`.
- [X] T052 Add a `lhci` audit for `/login` in `packages/web/lighthouserc.json` so the login screen is gated by the same Lighthouse Performance ≥90 and Core Web Vitals "Good" bands as the rest of the app (Constitution Principle IV).
- [X] T053 Audit `packages/web/src/app/api/auth/**/route.ts`, `packages/web/src/app/auth/callback/route.ts`, and `packages/web/middleware.ts` for any introduced `any`, `as Foo`, `!`, or `@ts-ignore` (Constitution Principle II). Fix in place; do not justify.
- [X] T054 Edit `packages/web/eslint.config.mjs` to add a rule forbidding `import` of `env.SUPABASE_SERVICE_ROLE_KEY` from any file that is not under `src/lib/supabase/admin.ts` or marked `import "server-only"` (defense-in-depth on the Constitution Principle VI "server-only secrets" rule). Add a test that runs `npm run lint` and asserts a sample violation file fails.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: T001–T006 have no upstream dependencies and run first.
  - T002 must precede T003 (config edits) and T004 (migration directory).
  - T003 and T004 must precede T006 (types are generated from the applied schema + config).
- **Phase 2 (Foundational)**: T007–T020 depend on Phase 1's generated types (T006) and config (T003). BLOCKS all user stories.
  - Within Phase 2: tests T007–T011 are written first (all [P] — different files). Then T012 (env) precedes T016/T017/T018 (clients read env). T017 (server.ts) precedes T019 (middleware imports it) and T020 (`requireAuth` imports it).
- **Phase 3 (US1)**: depends on Phase 2 complete.
- **Phase 4 (US2)**: depends on Phase 2 complete; spec-level dependency on US1 (a confirmed account must exist to sign into — the US2 integration test creates one via the admin client).
- **Phase 5 (US3)**: depends on Phase 2 complete; spec-level dependency on US1 + US2 (the sign-out flow assumes a signed-in user, established by either prior story).
- **Phase 6 (Polish)**: depends on Phases 3–5 being feature-complete.

### Within Each User Story

- All test tasks for the story MUST be written and observed failing BEFORE any implementation task in that same story begins (Constitution Principle I).
- Within a story, [P] tasks operate on different files and may be authored in parallel. Sequential tasks depend on a parallel task being merged or on a shared file (called out inline).

### Parallel Opportunities Summary

- **Phase 1**: T004 and T005 are [P] (independent files) after T002.
- **Phase 2 tests**: T007, T008, T009, T010, T011 all [P] (different files).
- **Phase 2 implementation**: T013, T014, T015 are [P] with each other; T016, T017, T018 are [P] with each other after T012.
- **Phase 3 tests**: T021–T026 all [P] (different files). T027 is non-[P] because it owns a file that US2 and US3 also extend.
- **Phase 3 implementation**: T028, T029, T030, T031 all [P]. T032 sequential (depends on T030). T033 sequential (depends on T032). T034 sequential (depends on T031).
- **Phase 4 tests**: T035, T036, T037 [P]; T038 and T039 non-[P] (touch files US1 already owns).
- **Phase 4 implementation**: T040, T041, T042 [P]; T043 sequential (depends on T042; touches login-panel.tsx).
- **Phase 5 tests**: T044 [P]; T045 and T046 non-[P] (touch shared files).
- **Phase 5 implementation**: T047 [P] with T049; T048 sequential (touches auth-pill.tsx).
- **Phase 6**: T053 and T054 may run in parallel; T050, T051, T052 each gate on prior phases being feature-complete.

### Parallel Example: User Story 1 implementation kickoff

After all US1 test tasks (T021–T027) are written and failing, four implementation tasks can launch in parallel:

```bash
# Different developers / agents pick these up in parallel:
Task: T028 — Implement packages/web/src/app/api/auth/sign-up/route.ts
Task: T029 — Implement packages/web/src/app/auth/callback/route.ts
Task: T030 — Implement packages/web/src/components/auth/sign-up-form.tsx
Task: T031 — Implement packages/web/src/components/auth/auth-pill.tsx
# Then sequentially:
Task: T032 — Implement login-panel.tsx (uses sign-up-form.tsx from T030)
Task: T033 — Implement app/login/page.tsx (uses login-panel.tsx from T032)
Task: T034 — Update app/layout.tsx to mount <AuthPill /> (uses auth-pill.tsx from T031)
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup (T001–T006)
2. Complete Phase 2: Foundational (T007–T020) — BLOCKING for all stories
3. Complete Phase 3: User Story 1 (T021–T034) — write tests, observe red, implement to green
4. **STOP and VALIDATE**: Drive the sign-up → confirm → app entry flow end-to-end. This is shippable as an MVP: existing users can adopt accounts without losing anonymous mode.
5. Run `npm run test:all`; ensure green.

### Incremental Delivery

1. Setup + Foundational → foundation is reusable
2. US1 → first shippable increment (accounts can be created and confirmed; identity surfaced in `AuthPill`)
3. US2 → returning users can sign back in; resend-confirmation supported
4. US3 → shared-device safety: explicit sign-out; demonstration of the auth gate via `/account`
5. Polish phase locks down budgets and final type-safety / secret-leak audits

### Parallel Team Strategy

After Phase 2 completes, three developers can pick up the three user stories simultaneously. The only cross-story coordination point is the small set of shared files (`login-panel.tsx`, `auth-pill.tsx`, `auth.spec.ts`, `layout.tsx`) — these are mutated by US1 first, then extended by US2 and US3 (sequencing called out in the Dependencies section). All Route Handler implementations and Zod schema tasks are file-disjoint and fully parallelizable.

---

## Notes

- [P] tasks = different files, no upstream incomplete dependency.
- [US#] label maps every story task back to its acceptance scenarios for traceability.
- Each user story is independently completable and testable; checkpoints mark the boundary.
- Verify every test fails for the right reason before implementing.
- Commit after each task or logical group; follow the project's existing commit style (see `git log`).
- The Constitution VI "Backend PR gate" requires (a) the migration file, (b) RLS policies, (c) an integration test exercising the auth + validation path — all three are present in this task list (T004, T004 again, T021/T035/T036/T044 respectively). Reviewers MUST verify this gate explicitly.
