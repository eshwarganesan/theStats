# Implementation Plan: Auth-Gated App with Public Landing Page

**Branch**: `011-auth-gated-landing` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-auth-gated-landing/spec.md`

## Summary

Turn the current always-authenticated-looking home page into two distinct surfaces: a public landing at `/` (marketing hero, no sidebar, CTAs that route to sign-in) and an authenticated shell for everything else (sidebar, in-app chrome). Enforce the wall in middleware so unauthenticated hits on protected routes bounce to `/login?from=…` *before any server render*, satisfying FR-007's "no flash of landing content" constraint. The technical approach — dictated by the user's plan direction — is:

1. **Move the sidebar out of the root layout into a nested `(authenticated)/layout.tsx`** using Next.js route groups, so only routes inside the group inherit the sidebar and its providers. `/`, `/login`, and `/auth/callback` remain at the root and therefore render without a sidebar.
2. **Relocate `/setup` and `/game/**` under `(authenticated)/`** so they inherit the same shell as `/games` and `/account`, closing the gap where they were previously reachable anonymously.
3. **Extend `packages/web/middleware.ts` (which today only refreshes the Supabase session cookie)** so the same request that rotates the cookie also decides — from the just-verified session — whether to bounce unauthenticated hits on `/setup`, `/game/**`, `/games/**`, `/account/**` to `/login?from=<encoded path>`, and whether to bounce authenticated hits on `/` or `/login` to `/games`.
4. **Rework the landing CTAs** to plain `<Link href="/login">` navigations so a signed-out click never mutates local persisted game state (FR-004 / SC-005). The `NewGameButton` component in its current mutating form is deleted; the authenticated "New Game" CTA on `/games` (already provided by feature 010's `NewGameCta`) is the only surviving mutating entry point.
5. **Clear anonymous local game state on sign-in** (FR-016) — the login form's success handler wipes `thestats.game.v1` and `thestats.clock.v1` before navigating onward.

Existing internal API endpoints (`/api/games`, `/api/games/[id]`) already gate at handler level via `withAuthenticatedHandler` and the RLS policies delivered by feature 009 — they satisfy FR-015 without change. `/api/auth/**` remains public by design.

## Technical Context

**Language/Version**: TypeScript 5.6.3 (strict mode; no escape hatches per Constitution Principle II)
**Primary Dependencies**: Next.js 15.1 (App Router — route groups, `middleware.ts`, `redirect()` in Server Components, `next/navigation`), React 19, `@supabase/ssr` 0.10 (edge-compatible server client for middleware), `@supabase/supabase-js` 2.106, Zustand 5 (existing store with `persist` + `subscribeWithSelector`), Tailwind CSS 3.4, `clsx` + `tailwind-merge` (existing `cn` helper). **No new runtime dependencies.**
**Storage**: Supabase Postgres (unchanged — feature reuses existing `auth.users`, `public.games`, `public.profiles`, `public.game_writes`, and their RLS policies as-is). Browser `localStorage` keys `thestats.game.v1` and `thestats.clock.v1` are cleared on sign-in per FR-016; no other localStorage changes.
**Testing**: Vitest + `@testing-library/react` for unit/component (middleware branch coverage, layout composition, CTA click behavior, login success handler); Playwright for end-to-end (P1/P2/P3 acceptance scenarios, sign-out returns-to-landing, deep-link `from` round-trip). Middleware is exercised with a lightweight `NextRequest`/`NextResponse` mock plus a stubbed Supabase server client that returns preset session shapes.
**Target Platform**: Web. Middleware runs on Next.js's edge runtime (per current `middleware.ts`); `@supabase/ssr` supports the edge runtime for `getUser()` cookie-refresh flows.
**Project Type**: Web application (monorepo package `packages/web`, App Router).
**Performance Goals**: Middleware adds one `supabase.auth.getUser()` call per matched request — the exact same call already made today for cookie rotation. The added logic is pure branching on the resolved user + URL path, so the median middleware cost is unchanged and worst-case adds ≤ 1ms of routing math. FR-007 ("no flash of landing content for signed-in users") is guaranteed by doing the `/ → /games` redirect at the middleware layer, before any Server Component render begins.
**Constraints**:
- The `from` param on `/login` MUST be validated to a same-origin path (`/…` only, no `//`, no scheme). The existing `safeFrom()` helper on `packages/web/src/app/login/page.tsx` already implements this; middleware MUST call the same helper when composing the redirect URL so validation is done in one place.
- Middleware MUST preserve the existing cookie-rotation contract from feature 005: build a fresh `NextResponse` each time cookies are written, and stamp both request and response cookie jars.
- No new Supabase migrations; no changes to RLS policies.
- The public landing page's marketing content (hero copy, feature callouts) MUST be preserved verbatim (FR-003).
**Scale/Scope**: Middleware runs on every non-static request (existing matcher). No additional load beyond a couple of `redirect()` decisions per request. Feature touches routing/layout only — no data model, no schema, no queries.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Test-Driven Development (NON-NEGOTIABLE) | ✅ PASS | Every change lands with a failing test first: middleware branches (unauthed on protected → 307 to `/login?from=…`; authed on `/` → 307 to `/games`; authed on `/login` → 307 to `/games`; unauthed on `/` → pass-through; malformed `from` → discarded), layout composition (sidebar present under `(authenticated)/`, absent on `/`, `/login`, `/auth/callback`), landing CTA behavior (no persisted-state mutation on click by a signed-out visitor), sign-in success clears `thestats.game.v1` and `thestats.clock.v1`, and Playwright E2E for each acceptance scenario. |
| II. Strict Type Safety | ✅ PASS | New middleware code uses `NextRequest` / `NextResponse` and the `Database` generic on `createServerClient` (both already imported by today's `middleware.ts`). The session is read via `supabase.auth.getUser()` — the returned `User` type is used directly, never widened to `any`. `from` is a `string | undefined` narrowed by `safeFrom()` before use. No `any`, no `!`, no `as` casts of parsed data. |
| III. Component-Driven Architecture | ✅ PASS | The new `(authenticated)/layout.tsx` is a thin composition of existing components (`<AppSidebar>`, `<SidebarProfileIcon>`, `<WriteThroughProvider>`, `<RecoveryFailedBanner>`, `<StorageUnavailableModal>`) — no logic beyond mounting them. `app/layout.tsx` shrinks to HTML shell + fonts + `<StorageAvailabilityProvider>` only. The landing CTAs become plain `<Link>` elements; `NewGameButton`'s mutating client-component form is deleted (its live authenticated replacement `NewGameCta` already exists on `/games`). |
| IV. Performant & Responsive UX | ✅ PASS | Zero new bundle impact for the landing page (client-component `NewGameButton` is *removed*, replaced by pure `<Link>`s — net bundle size DECREASES). Middleware cost is unchanged in the median (same `getUser()` call). Redirect-before-render eliminates the "landing flashes then games loads" jank called out in FR-007. |
| V. Engineering Discipline & Industry Standards | ✅ PASS | Removes a dead code path (mutating landing CTA on a signed-out visitor) rather than adding a feature flag around it. Reuses the existing `safeFrom()` guard rather than re-implementing it. Adds no dependencies. |
| VI. Secure & Typed Backend Boundary (NON-NEGOTIABLE) | ✅ PASS | No new Route Handlers or Server Actions. Existing `/api/games/**` handlers already flow through `withAuthenticatedHandler` (session verify + Zod input validation + uniform error envelope + structured logs, per Principle VI). `/api/auth/**` is public by design. Middleware only makes decisions from the *server-verified* session — it never trusts a client-supplied user id. The `service_role` key is not read anywhere in this feature. RLS on `public.games` continues to be the authoritative ownership gate. |

**Gate result**: PASS. No violations to justify; **Complexity Tracking section left empty**.

**Post-design recheck (after Phase 0 + Phase 1 artifacts written)**: PASS. Phase 0 (`research.md`) confirmed no new dependencies; Phase 1 (`data-model.md`) confirmed no schema changes and no new entities; `contracts/middleware.md` documents a single-file boundary with explicit test cases per row. No principle status changes; Complexity Tracking remains empty.

## Project Structure

### Documentation (this feature)

```text
specs/011-auth-gated-landing/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── middleware.md    # Redirect matrix for packages/web/middleware.ts
├── checklists/
│   └── requirements.md  # Existing — from /speckit.specify
└── tasks.md             # Phase 2 output (/speckit.tasks command — NOT created here)
```

### Source Code (repository root)

```text
packages/web/
├── middleware.ts                          # EXTENDED — cookie refresh (existing) + protected-route bounce + landing redirect
├── src/
│   ├── app/
│   │   ├── layout.tsx                     # SLIMMED — HTML shell, fonts, StorageAvailabilityProvider only (sidebar/providers moved out)
│   │   ├── page.tsx                       # UPDATED — landing hero; CTAs become plain <Link href="/login">; NewGameButton import removed
│   │   ├── globals.css                    # unchanged
│   │   ├── login/
│   │   │   └── page.tsx                   # UPDATED — signed-in default destination is /games (was "/"); safeFrom() reused
│   │   ├── auth/
│   │   │   └── callback/route.ts          # unchanged (public)
│   │   ├── api/
│   │   │   ├── auth/                      # unchanged (public sign-in / sign-up / sign-out / resend / callback)
│   │   │   └── games/                     # unchanged (already gated via withAuthenticatedHandler)
│   │   └── (authenticated)/
│   │       ├── layout.tsx                 # NEW — AppSidebar + SidebarProfileIcon + WriteThroughProvider + RecoveryFailedBanner + StorageUnavailableModal + pl-14 wrapper
│   │       ├── setup/                     # MOVED here from app/setup
│   │       │   └── page.tsx
│   │       ├── game/                      # MOVED here from app/game (retains its own client layout)
│   │       │   ├── layout.tsx
│   │       │   ├── page.tsx
│   │       │   ├── stats/…
│   │       │   └── scoresheet/…
│   │       ├── games/                     # unchanged location
│   │       └── account/                   # unchanged location
│   ├── components/
│   │   ├── home/
│   │   │   ├── NewGameButton.tsx          # DELETED (mutating landing CTA obsolete)
│   │   │   └── NewGameButton.test.tsx     # DELETED
│   │   ├── shell/                         # AppSidebar, SidebarProfileIcon, RecoveryFailedBanner, StorageUnavailableModal (unchanged, now imported from (authenticated)/layout.tsx)
│   │   └── auth/
│   │       └── login-panel.tsx            # UPDATED — on sign-in success: clear thestats.game.v1 + thestats.clock.v1, then navigate to from ?? "/games"
│   └── lib/
│       ├── auth/
│       │   ├── require-auth.ts            # RETAINED as belt-and-suspenders inside Server Components; primary gate is now middleware
│       │   └── safe-from.ts               # NEW — extracted from login/page.tsx so middleware and the login page share one open-redirect guard
│       └── persistence/
│           └── clearPersistedGame.ts      # existing wipe of thestats.game.v1 + thestats.clock.v1; reused by login-panel on sign-in success
└── tests/
    └── e2e/
        └── auth-gated-landing.spec.ts     # NEW — P1/P2/P3 acceptance scenarios end-to-end
```

**Structure Decision**: Retain the existing monorepo layout (`packages/web` is the only package touched). The App Router route-group pattern (`(authenticated)/`) is the idiomatic Next.js mechanism for "these routes share a layout" without touching the URL, so it maps 1:1 to the spec's split between public landing/auth pages and the authenticated app. Middleware placement (`packages/web/middleware.ts`) is fixed by Next.js and unchanged from today; only its body grows.

## Complexity Tracking

> No Constitution violations to justify — this section is intentionally left empty.
