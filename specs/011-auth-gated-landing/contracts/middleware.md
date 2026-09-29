# Contract — `packages/web/middleware.ts`

**Feature**: 011-auth-gated-landing
**Date**: 2026-09-10
**Scope**: the *only* new "interface" this feature ships is the routing contract enforced by `middleware.ts`. There are no new HTTP endpoints, no library APIs, and no schema. This document is the authoritative specification of the middleware's input → output behavior; `/speckit.tasks` should use it directly to generate branch-coverage tests.

## Runtime

- Runs on Next.js Edge Runtime (existing).
- Matcher (unchanged from today):
  ```
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
  ```
- Cookie-refresh behavior (unchanged) uses `@supabase/ssr` `createServerClient` with `getAll` / `setAll` cookie adapters and calls `supabase.auth.getUser()` exactly once per request.

## Inputs

| Input | Source | Notes |
|---|---|---|
| `request.nextUrl.pathname` | `NextRequest` | Used for both the "is protected?" check and, when composing a redirect, as the encoded `from` value. |
| `request.nextUrl.search` | `NextRequest` | Appended to `pathname` when composing `from` so query params survive the round-trip. |
| `{ data: { user }, error }` | `supabase.auth.getUser()` | The one Supabase call; already made today for cookie rotation. |

## Response matrix (must be covered by tests)

`P` = pass through (`NextResponse.next()` with rotated cookies).
`R(x)` = `NextResponse.redirect(x, 307)` with rotated cookies preserved on the redirect response.

| # | Path (`pathname`) | Session state | Expected response | Rationale |
|---|---|---|---|---|
| 1 | `/` | Unauthenticated | `P` | Render public landing (FR-001) |
| 2 | `/` | Authenticated | `R(/games)` | Never let a signed-in user see the marketing hero (FR-006, FR-007) |
| 3 | `/login` | Unauthenticated | `P` | Sign-in surface must be reachable (FR-011) |
| 4 | `/login` | Authenticated | `R(/games)` | Don't show sign-in to someone already signed in (FR-012) |
| 5 | `/login?from=/games` | Unauthenticated | `P` | Query preserved so post-sign-in navigation can honor it |
| 6 | `/auth/callback` (any query) | Either | `P` | Callback must complete regardless of session state |
| 7 | `/setup` | Unauthenticated | `R(/login?from=%2Fsetup)` | Newly gated by this feature (FR-008) |
| 8 | `/setup` | Authenticated | `P` | Normal use |
| 9 | `/game` (or any `/game/*`) | Unauthenticated | `R(/login?from=<encoded>)` | FR-008; deep-link `from` preserved (FR-009) |
| 10 | `/game/stats` | Unauthenticated | `R(/login?from=%2Fgame%2Fstats)` | FR-009 |
| 11 | `/games` | Unauthenticated | `R(/login?from=%2Fgames)` | FR-008 — now enforced at middleware in addition to page-level `requireAuth` |
| 12 | `/games/abc123?tab=history` | Unauthenticated | `R(/login?from=%2Fgames%2Fabc123%3Ftab%3Dhistory)` | Query survives via `pathname + search` (FR-009) |
| 13 | `/account` (or any `/account/*`) | Unauthenticated | `R(/login?from=<encoded>)` | FR-008 |
| 14 | `/api/games` (GET) | Unauthenticated | `P` | Handler-gated; middleware defers to `withAuthenticatedHandler` (R9) |
| 15 | `/api/auth/sign-in` (POST) | Unauthenticated | `P` | Public by design; needed to *become* authenticated |
| 16 | `/setup` with a Supabase `getUser()` error (e.g., malformed cookie) | Treated as unauthenticated | `R(/login?from=%2Fsetup)` | Same convention as feature 005's `requireAuth` — error means "no verified user"; fail closed. |
| 17 | Any protected path with a `from`-poisoned URL bar (e.g., `/setup?from=//evil.com`) | Unauthenticated | `R(/login?from=%2Fsetup%3Ffrom%3D%2F%2Fevil.com)` — the composed `from` is later re-validated by `safeFrom()` when the login page (or the login POST success handler) reads it, and would be rejected there | Defense in depth: middleware composes an encoded pathname; the guard is applied where `from` is *used*, not where it's carried. |

## Redirect-URL composition rules

The redirect target for row 7–13 is composed as:

```
new URL(
  `/login?from=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`,
  request.nextUrl.origin,
)
```

- `pathname + search` guarantees the original query survives the sign-in round-trip.
- `encodeURIComponent` prevents ambiguity between "the pathname contains an `&`" and "the caller is trying to inject a second query param on `/login`".
- Constructing a URL from `request.nextUrl.origin` ensures the redirect target is always same-origin, independent of any `Host` header shenanigans.

## Ordering rules (matter for correctness)

1. Build the Supabase server client and call `getUser()` **first** — the cookie rotation from feature 005 must still run on every request, including public ones.
2. Only *after* the cookie response has been prepared, evaluate the routing decision. Both the pass-through and the redirect responses MUST inherit the same rotated cookies, so the redirect must be built from the same `NextResponse` object (or its cookies copied).
3. If the routing decision is "redirect", set the 307 target and return; do **not** run further route logic.

## Non-behaviors (explicit)

- Middleware MUST NOT read or write `localStorage` — impossible on the edge runtime and out of scope (FR-016's cleanup is client-side).
- Middleware MUST NOT emit a JSON 401 for `/api/games/**` — the handler owns that error shape (Constitution Principle VI).
- Middleware MUST NOT redirect authenticated users away from *any* protected page (rows 8, 10 authenticated, etc.) — only from `/` and `/login`.
- Middleware MUST NOT enforce ownership of a specific game (e.g. `/games/[id]`); RLS + the page's own render logic handle that.

## Test contract

Each row in the response matrix maps to one Vitest test case in `packages/web/middleware.test.ts` (new file). The test harness stubs `@supabase/ssr`'s `createServerClient` to return a controllable `getUser()` promise and asserts on the resulting `NextResponse` (status code, `Location` header, and preserved `Set-Cookie` headers for cookie-rotation regression coverage).

E2E acceptance for the same rows is delivered via `packages/web/tests/e2e/auth-gated-landing.spec.ts` (P1/P2/P3 spec scenarios).
