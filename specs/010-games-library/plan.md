# Implementation Plan: Games Page (Sidebar Library + New Game Entry)

**Branch**: `010-games-library` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/010-games-library/spec.md`

## Summary

Move feature 009's account-page library section out to a new dedicated top-level page at `/games`, reachable from a new first nav item in the existing `AppSidebar`, and add a prominent "New game" entry point on that page. The `/games/[id]` per-game route hosts the same review view feature 009 defined; the old `/account/games/[id]` route 301-redirects to it. The account page keeps only profile info (email display, editable display name, password change).

Approach (per the user's `/speckit.plan` directive "Use the existing game library. Ensure test coverage satisfies threshold and all e2e tests are covered."):

- **No new persistence, no new API endpoints, no new domain entities.** Reuse feature 009's `public.games` / `public.profiles` tables (RLS unchanged), the `GET /api/games` cursor-paginated handler, the `GET /api/games/[id]` handler, and the `DELETE /api/games/[id]` handler exactly as they exist today. Reuse the `LibraryEntry` / `SavedGameRecord` / `LibraryPage` types from `src/lib/games/types.ts`.
- **Component reuse over duplication.** The existing `GameLibrary`, `LibraryEntry`, `DeleteGameDialog`, `LibraryErrorBoundary`, and `GameReviewView` components move from `src/components/account/` to `src/components/games/` (single mv + import-path refresh) and become the building blocks of the new page. Two internal link targets change (`/account/games/[id]` → `/games/[id]`); everything else is behavior-preserving.
- **Sidebar nav plumbing.** The existing `AppSidebar` already reserves a middle slot (`<div className="flex-1" />`) between the collapse toggle and the profile icon. We introduce a small `SidebarNavItem` presentational component (icon-only in the 56px rail, icon + label in the expanded overlay, active-state indicator on `/games` and `/games/[id]`) and mount a single instance for "Games". The sidebar stays a Client Component; the item is fully driven by `usePathname` (no server round-trip).
- **Coverage & tests as first-class deliverables.** Every new `src/**` module ships with a Vitest suite that clears the repo's 90% global / 95% `src/lib/**` thresholds (see `vitest.config.ts`). Every acceptance scenario in `spec.md` — including the ones inherited from feature 009 that now live on `/games` — has a matching Playwright spec; `account-library.spec.ts` and `account-continue.spec.ts` are ported to `games-*.spec.ts` with the new URL targets and the account-page suite is trimmed to profile-only assertions.

## Technical Context

**Language/Version**: TypeScript 5.6.3 (strict mode; no escape hatches per Constitution Principle II)
**Primary Dependencies**: Next.js 15.1 (App Router — Server Components, Route Handlers, `next/navigation`, middleware, `redirects()` in `next.config.mjs`), React 19, Zustand 5 (existing store with `persist` + `subscribeWithSelector`), `@supabase/ssr` 0.10, `@supabase/supabase-js` 2.106, Zod 3.25 (existing — already used by `LibraryQuerySchema`, no new schemas), Tailwind CSS 3.4, `clsx` + `tailwind-merge` (existing `cn` helper). **No new runtime dependencies.**
**Storage**: Supabase Postgres. Reuses `public.games`, `public.profiles`, `public.game_writes`, RLS policies, and the `record_game_write` / `get_game_write_game_id` RPCs exactly as delivered by migration `0002_account_library.sql`. **No new migration required.**
**Testing**: Vitest 2.1 + `@testing-library/react` 16.1 (unit / component, jsdom env), Playwright 1.48 (end-to-end, Chromium project against `next dev`).
**Target Platform**: Web (Next.js 15 on Node runtime for server, modern evergreen browsers for client). Responsive from 360px width upward per Constitution IV.
**Project Type**: Web application inside the existing npm workspace (`packages/web` = the Next.js app; `packages/core` = shared domain types). No mobile / no CLI.
**Performance Goals**: `/games` first meaningful content ≤ 2s on typical broadband for ≤ 50 games (spec SC-003). Interaction feedback ≤ 100ms on mid-tier mobile (Constitution IV). Lighthouse Performance ≥ 90 on the scorekeeping screen — unchanged; adding a nav item and a route MUST NOT push route bundle beyond +20 KB gz per Constitution IV (expected addition is well under that — one server component, one client component, one presentational SidebarNavItem).
**Constraints**: WCAG 2.1 AA (Constitution "Accessibility"); no `any` / `@ts-ignore` / `!` / unchecked casts (Constitution II); Vitest thresholds — lines/functions/branches/statements ≥ 90% overall and ≥ 95% for `src/lib/**` (see `vitest.config.ts`), with `src/app/**` excluded from coverage because pages are exercised by Playwright.
**Scale/Scope**: Additive-refactor. New: 1 top-level route group (`/games` + `/games/[id]`), 1 sidebar `<SidebarNavItem>` component, 1 "New game" CTA on the Games page. Moved: 5 components from `components/account/` → `components/games/` (rename + import refresh only, no logic changes). Modified: `AppSidebar` (mount the nav item), `AccountPage` (remove `GameLibrary`), `LibraryEntry` (Review target URL), `next.config.mjs` (add the `/account/games/[id]` → `/games/[id]` 301). Ported: 2 e2e specs (`account-library` → `games-library`, `account-continue` → `games-continue`); trimmed: `account-library.spec.ts`, `account-review.spec.ts`; added: `games-new.spec.ts` (US2), `games-sidebar.spec.ts` (US1 sidebar affordance).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | How this feature satisfies it |
|-----------|------------|-------------------------------|
| I. Test-Driven Development (NON-NEGOTIABLE) | ✅ | Every new component (`SidebarNavItem`, `GamesPage`, `NewGameCta`, the two moved index files) ships with a failing Vitest suite BEFORE implementation. Each Playwright spec in the map below is committed with failing assertions BEFORE the route it targets exists. `npm run test:coverage` and `npm run test:e2e` are run locally before opening the PR. No behavior change lands without a red-then-green test. |
| II. Strict Type Safety | ✅ | Reuses the existing `LibraryEntry`, `SavedGameRecord`, `LibraryPage`, and `ProfileRow` types verbatim. New surfaces (`SidebarNavItemProps`, `GamesPageProps`) get explicit interfaces. No `any`, no `!`, no `as X` on any parsed JSON — the reused route handlers already Zod-validate. `npm run typecheck` must be green. |
| III. Component-Driven Architecture | ✅ | The Games page is a Server Component that composes existing presentational + client components. The new `SidebarNavItem` is a single-purpose presentational component (icon + label + active state) with its own test. Data-fetching stays in the Server Component (initial 20-game batch); interactive load-more stays in the already-hydrated `<GameLibrary>` client component. `"use client"` boundaries stay intentional. |
| IV. Performant & Responsive UX | ✅ | Server-rendered initial batch keeps `/games` LCP under 2s. Sidebar item adds a fixed-position icon in the collapsed rail (already-mounted DOM) and a labeled row in the expanded overlay — no layout thrash. Bundle delta well under the 20 KB gz PR threshold. |
| V. Engineering Discipline & Industry Standards | ✅ | Zero net-new abstractions; the change is largely a rename + import path refresh + one new page + one new nav item. Lint clean; no warnings suppressed. No secrets touched. |
| VI. Secure & Typed Backend Boundary (NON-NEGOTIABLE) | ✅ | No new server endpoints, no new tables, no new RPCs, no new RLS policies. The two new Server Components (`/games/page.tsx`, `/games/[id]/page.tsx`) reuse `requireAuth` and the same Supabase server client, and are auth-gated at the top of the handler. The `/account/games/[id]` → `/games/[id]` 301 is a route-level redirect declared in `next.config.mjs`; the target page still runs `requireAuth` and RLS on `public.games` remains the authoritative ownership check. No `service_role` usage. |

**Verdict**: All gates pass. No entries in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/010-games-library/
├── plan.md              # This file (/speckit.plan output)
├── research.md          # Phase 0 output (this command)
├── data-model.md        # Phase 1 output (this command)
├── quickstart.md        # Phase 1 output (this command)
├── contracts/           # Phase 1 output (this command) — reuses existing endpoints
│   └── README.md
├── spec.md              # (from /speckit.specify + /speckit.clarify)
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output — created by /speckit.tasks (NOT here)
```

### Source Code (repository root)

Reflects the existing repo layout (npm workspaces: `packages/core`, `packages/web`). Only the files this feature touches are shown; `…` marks unchanged siblings.

```text
packages/
├── core/                                        # unchanged
└── web/
    ├── next.config.mjs                          # MODIFIED — add redirect() for /account/games/[id] → /games/[id]
    ├── vitest.config.ts                         # unchanged (thresholds already 90 % / 95 %)
    ├── playwright.config.ts                     # unchanged
    ├── supabase/
    │   └── migrations/                          # unchanged (no new migration)
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx                       # unchanged — <AppSidebar/> is already mounted
    │   │   ├── page.tsx                         # unchanged — home page
    │   │   ├── (authenticated)/
    │   │   │   ├── account/
    │   │   │   │   ├── page.tsx                 # MODIFIED — drop <GameLibrary> + <LibraryErrorBoundary>, keep profile
    │   │   │   │   ├── actions.ts               # unchanged
    │   │   │   │   └── games/                   # DELETED — /account/games/[id]/page.tsx removed after redirect lands
    │   │   │   └── games/                       # NEW route group (top-level)
    │   │   │       ├── page.tsx                 # NEW — GamesPage (Server Component, initial batch)
    │   │   │       └── [id]/
    │   │   │           └── page.tsx             # NEW — GameDetailPage (same logic as former /account/games/[id])
    │   │   └── api/
    │   │       └── games/                       # unchanged — reused verbatim
    │   ├── components/
    │   │   ├── shell/
    │   │   │   ├── AppSidebar.tsx               # MODIFIED — mount the primary <SidebarNavItem>
    │   │   │   ├── AppSidebar.test.tsx          # MODIFIED — cover the Games nav item rendering in rail + overlay
    │   │   │   ├── SidebarNavItem.tsx           # NEW — presentational nav item (icon, label, href, active state)
    │   │   │   ├── SidebarNavItem.test.tsx      # NEW — unit tests for rail-vs-overlay + active state matching
    │   │   │   └── icons/
    │   │   │       └── IconGames.tsx            # NEW — small SVG icon for the Games item
    │   │   ├── account/
    │   │   │   ├── ProfileSection.tsx           # unchanged
    │   │   │   ├── ProfileForm.tsx              # unchanged
    │   │   │   └── ChangePasswordForm.tsx       # unchanged
    │   │   └── games/                           # NEW folder — receives moved feature-009 library components
    │   │       ├── GameLibrary.tsx              # MOVED from components/account/, unchanged logic
    │   │       ├── GameLibrary.test.tsx         # MOVED
    │   │       ├── LibraryEntry.tsx             # MOVED + MODIFIED (Review href → /games/[id])
    │   │       ├── LibraryEntry.test.tsx        # MOVED + MODIFIED (assert new href)
    │   │       ├── LibraryErrorBoundary.tsx     # MOVED, unchanged
    │   │       ├── LibraryErrorBoundary.test.tsx# MOVED
    │   │       ├── DeleteGameDialog.tsx         # MOVED, unchanged
    │   │       ├── DeleteGameDialog.test.tsx    # MOVED
    │   │       ├── GameReviewView.tsx           # MOVED, unchanged
    │   │       ├── GameReviewView.test.tsx      # MOVED
    │   │       ├── NewGameCta.tsx               # NEW — Games-page "New game" button (thin wrapper over NewGameButton semantics)
    │   │       └── NewGameCta.test.tsx          # NEW
    │   └── lib/
    │       └── games/                           # unchanged — types.ts, serialize.ts, idempotency.ts reused as-is
    └── tests/
        └── e2e/
            ├── account-library.spec.ts          # DELETED — replaced by games-library.spec.ts
            ├── account-continue.spec.ts        # DELETED — replaced by games-continue.spec.ts
            ├── account-review.spec.ts           # MODIFIED — assertions retargeted to /games/[id]
            ├── account-profile.spec.ts          # unchanged (profile still on /account)
            ├── games-library.spec.ts            # NEW — US1 acceptance scenarios (list, ordering, pagination, empty state)
            ├── games-new.spec.ts                # NEW — US2 acceptance scenarios (New game CTA in populated + empty states)
            ├── games-continue.spec.ts           # NEW — US3 in-progress restoration flow (replaces account-continue)
            ├── games-sidebar.spec.ts            # NEW — sidebar item visibility, active state, collapsed-rail behavior
            └── games-redirect.spec.ts           # NEW — /account/games/[id] → /games/[id] 301 (FR-021)
```

**Structure Decision**: Web-app (Option 2 in the template's suggested layouts), but the concrete tree above is the source of truth — this monorepo pins everything under `packages/web`. Feature-scoped components live under `src/components/<feature>/` (matching the existing `components/account/`, `components/shell/`, `components/home/` convention). Shared domain types stay in `src/lib/games/` and `packages/core` where they already are; this feature adds nothing there.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*No violations. Table intentionally empty.*
