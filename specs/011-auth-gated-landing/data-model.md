# Phase 1 — Data Model

**Feature**: 011-auth-gated-landing
**Date**: 2026-09-10

## Summary

**This feature introduces no new persistent entities and no schema changes.** No Supabase migration is required. What follows is an inventory of the existing types this feature *consumes* — reproduced here so `/speckit.tasks` and reviewers can see exactly which shapes are load-bearing for the routing decisions the middleware and the login flow now make.

## Consumed shapes (existing — no changes)

### Session identity (Supabase)

| Field | Type | Source | Used by |
|---|---|---|---|
| `data.user` | `User \| null` | `supabase.auth.getUser()` (from `@supabase/ssr`'s server client) | Middleware branching (`unauth vs auth`), `requireAuth()` guard, login page's already-signed-in redirect |
| `data.user.id` | `string` (uuid) | same | Not read by this feature — kept for downstream RLS |
| `error` | `AuthError \| null` | same | Middleware treats a non-null `error` as "no session" (same convention feature 005 established in `requireAuth`) |

**Lifecycle**: the session is *rotated* on every non-static request by the existing cookie-refresh path in `middleware.ts`. This feature does not change that lifecycle — it only adds a routing decision that reads the rotated session.

### Query parameters on `/login`

| Field | Type | Constraint | Handled by |
|---|---|---|---|
| `from` | `string \| undefined` | Length ≤ 512, must start with `/`, must NOT start with `//`, no scheme, no protocol-relative form | `safeFrom()` (extracted to `packages/web/src/lib/auth/safe-from.ts` per R4) |
| `error` | `string \| undefined` | Free-form; only known codes render a message | `errorMessage()` in `login/page.tsx` (unchanged) |

**Validation rule** (unchanged from feature 005, now shared with middleware): `safeFrom(raw)` returns `undefined` for any value that could result in an open redirect. Middleware composes `/login?from=<encoded pathname>` using the request's own `nextUrl.pathname + nextUrl.search`, which is guaranteed same-origin — the guard is defense in depth against future callers.

### Anonymous local game state (browser)

| Storage key | Type (persisted) | Cleared by |
|---|---|---|
| `thestats.game.v1` | Zustand `persist` slice (see feature 006 `partialize`) — game settings, events, possession-arrow, team-actions | `clearPersistedGame()` — invoked by `LoginPanel` on sign-in success (new for this feature, satisfies FR-016) |
| `thestats.clock.v1` | `{ clockSeconds: number, breakSeconds: number, savedAt: number }` (feature 006 clock checkpoint) | Same — `clearPersistedGame()` clears both keys atomically |

**Lifecycle change introduced by this feature**: on a successful sign-in, both keys are wiped BEFORE the post-login navigation fires. That is the entirety of the persistence change; no keys are added, no schemas migrated, no server-side records touched.

## Route inventory (the surface the middleware branches on)

This is not a "data model" in the traditional sense, but it is the *state space* the middleware evaluates against. It is included here so `/speckit.tasks` can generate direct test cases from it.

| Path pattern | Public? | Middleware behavior for signed-out | Middleware behavior for signed-in |
|---|---|---|---|
| `/` | Yes | Pass through (render landing) | 307 → `/games` |
| `/login` | Yes | Pass through | 307 → `/games` |
| `/auth/callback` (and any sub-path under `/auth/**` reserved for post-auth flows) | Yes | Pass through | Pass through (callback needs to complete regardless) |
| `/setup` | No | 307 → `/login?from=/setup` | Pass through |
| `/game`, `/game/stats`, `/game/scoresheet` | No | 307 → `/login?from=<encoded path>` | Pass through |
| `/games`, `/games/[id]` | No | 307 → `/login?from=<encoded path>` | Pass through |
| `/account`, `/account/[…]` | No | 307 → `/login?from=<encoded path>` | Pass through |
| `/api/auth/**` | Yes (public endpoints) | Pass through | Pass through |
| `/api/games/**` | No (handler-gated already) | Pass through — handler returns `401` via `withAuthenticatedHandler` | Pass through |
| Static assets (`_next/**`, `favicon.ico`, `*.svg/png/…`) | N/A | Not matched by middleware (existing matcher exclusion) | Not matched |

**Note on `/api/games/**`**: middleware does not attempt to gate this at the middleware layer per R9 — the handler is the authoritative boundary and returns the constitutional `{ error: { code, message } }` shape on unauthenticated requests. Middleware still runs on these paths (for cookie rotation) but does not add a redirect decision.

## Invariants

1. **Every request** — including public routes and API routes — goes through the cookie-refresh path exactly once (existing behavior; must not regress).
2. **Every unauthenticated request to a protected page pattern** in the table above receives a `307` response, never a `200` with content.
3. **Every authenticated request to `/` or `/login`** receives a `307` response, never a `200` with landing/login content.
4. **The `from` query param on `/login`** is either absent or a `safeFrom()`-valid same-origin path.
5. **On a successful sign-in**, `thestats.game.v1` and `thestats.clock.v1` are absent from `localStorage` before the post-login navigation completes.
