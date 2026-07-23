# Implementation Plan: Account Page & Saved Games Library

**Branch**: `009-account-library` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-account-library/spec.md`

## Summary

Deliver an account-gated page (`/account`) that lets a signed-in user view their email, edit a display name, and change their password (US1 / P1); shows a cloud-synced library of every game they own with continue and review affordances (US2/3/4); and reworks the app shell entry point to a new collapsible sidebar that hosts the AuthPill and — when signed in — a profile icon at the bottom that opens the account page. The library is backed by a new `public.games` table plus a new `public.profiles` table on Supabase, each with strict RLS, and is written through as the user scores (write-through save via a `PATCH /api/games/[id]` Route Handler protected by an idempotency key). Anonymous local persistence (feature 006) is preserved for signed-out sessions; when an anonymous user signs in on a device with a local in-progress game, a one-time three-choice prompt (Save to my account / Keep local / Discard) blocks the sign-in flow until resolved.

**Plan-time scope refinement (from the `/speckit.plan` invocation):** FR-001's abstract "obvious entry point in the app shell" is realised here as a *new collapsible sidebar* on the left of every page. The `AuthPill` moves out of the fixed top-right corner in `packages/web/src/app/layout.tsx` and into that sidebar. When signed in, a profile icon at the bottom of the sidebar navigates to `/account`. This scope addition is captured under Story 1 as the entry point that unblocks the account page; it does not change any acceptance criteria.

## Technical Context

**Language/Version**: TypeScript 5.6 (strict mode, no escape hatches per Constitution Principle II)
**Primary Dependencies**: Next.js 15 (App Router — Server Components, Server Actions, Route Handlers, middleware), React 19, Zustand 5 (`persist` + `subscribeWithSelector`, existing), `@supabase/ssr` 0.10, `@supabase/supabase-js` 2.106, **Zod** (already added by feature 005 — reused for new endpoint validation), Tailwind CSS 3.4, `clsx` + `tailwind-merge` (existing `cn` helper).
**Storage**: Supabase Postgres — two new tables (`public.profiles`, `public.games`) with RLS. Browser `localStorage` (feature 006 key `thestats.game.v1`) remains for anonymous sessions. No new persistence layer.
**Testing**: Vitest + `@testing-library/react` for unit/component (colocated `*.test.tsx`), Playwright for e2e (`packages/web/tests/e2e/`). Route Handler integration tests exercise auth + Zod validation + Supabase RLS per Constitution Principle VI.
**Target Platform**: Modern evergreen browsers on desktop, tablet, and mobile from 360px width up (Constitution Principle IV).
**Project Type**: Monorepo — `packages/web` (Next.js frontend + backend Route Handlers) + `packages/core` (domain types shared by both).
**Performance Goals**: SC-003 first library batch ≤ 2s under normal network; SC-005 statsheet + game log ≤ 2s to load; INP < 200ms per constitution.
**Constraints**: All new tables MUST have RLS enabled with explicit `SELECT/INSERT/UPDATE/DELETE` policies (Principle VI). Every new Route Handler MUST verify the Supabase session server-side (no client-sent user IDs) and MUST Zod-validate its inputs. Every schema change lives in `packages/web/supabase/migrations/` as a new numbered migration; generated Supabase TS types are committed and used for every `from(...)` / `rpc(...)` call.
**Scale/Scope**: 50+ games per user library at launch (SC-003 target). One profile row per user. Idempotency-key deduplication on `POST /api/games` and `PATCH /api/games/[id]` to allow safe client retries per Principle VI.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Verdict | Notes |
|-----------|---------|-------|
| I. Test-Driven Development (NON-NEGOTIABLE) | ✅ | Every task in Phase 2 pairs a failing test (Vitest component/unit or Playwright e2e for the flow) with the implementation. Route Handler tasks include an integration test in the "test-first" step per Principle VI. |
| II. Strict Type Safety | ✅ | No `any`, no `!`, no `as`. New Supabase TS types come from `supabase gen types typescript`. Zod schemas produce typed `z.infer<>` request bodies. Store extensions typed at the module boundary. |
| III. Component-Driven Architecture | ✅ | New UI decomposes into `AppSidebar`, `SidebarProfileIcon`, `AccountPage`, `ProfileForm`, `ChangePasswordForm`, `GameLibrary`, `LibraryEntry`, `DeleteGameDialog`, `AnonymousGameOnSignInPrompt`, `GameReviewView`, `StatSheet`. Server/Client boundary intentional: `AccountPage` and `GameReviewView` are Server Components; sidebar interactivity, forms, and library actions are Client Components. |
| IV. Performant & Responsive UX | ✅ | Library denormalizes summary columns onto `public.games` so the list renders without hydrating full JSON per row (protects SC-003). Sidebar is CSS-transform collapsible (no layout thrash). No `hover:`-only affordances. 360px baseline. |
| V. Engineering Discipline & Industry Standards | ✅ | SOLID: profile + games are separate tables with distinct policies. DRY: reuse existing `require-auth.ts`, `createServerClient`, `Modal`, `Button`, `Input`. YAGNI: no email change, no user-editable game names, no sort options, no import/export in v1 (see Assumptions in spec). |
| VI. Secure & Typed Backend Boundary (NON-NEGOTIABLE) | ✅ | (a) Every new Route Handler starts with `createServerClient()` + `getUser()`; owner ID derived from session, never from request body. (b) `service_role` key untouched. (c) RLS on both new tables with SELECT/INSERT/UPDATE/DELETE policies keyed on `owner_id = auth.uid()`. (d) Zod validation on every request body and path param. (e) Supabase types generated + committed under `packages/web/src/lib/supabase/types.gen.ts`. (f) HTTP semantics: `GET /api/games` (list), `POST /api/games` (create), `GET/PATCH/DELETE /api/games/[id]` (single). Error shape `{ error: { code, message } }`. (g) `PATCH /api/games/[id]` and `POST /api/games` accept `Idempotency-Key` header enforced via `game_writes(idempotency_key text primary key, game_id uuid, created_at timestamptz)` dedupe table. (h) One migration `0002_account_library.sql`. (i) Structured log on entry / exit per Route Handler. |

**Gate result: PASS.** No violations; Complexity Tracking section deliberately empty.

### Post-design re-check (after Phase 1)

Re-evaluated on 2026-07-22 after data-model.md, contracts/, and quickstart.md were written:

- Principle I (TDD): each Phase 2 task will be paired with a red test; integration tests for `app/api/games/**` are the first artifact created for those routes.
- Principle II (Strict types): every DB access flows through the regenerated `types.gen.ts`; Zod schemas produce inferred types with no `as` casts anywhere in `route.ts` or `actions.ts`.
- Principle III (Component-driven): decomposition in Project Structure held after contracts landed; no combined data-fetching + presentation surface exists.
- Principle IV (Performant UX): denormalized summary columns + `(owner_id, last_activity_at DESC)` index preserve SC-003; no bundle additions above the 20 KB threshold (Research R-10).
- Principle V (Discipline): scope stayed inside the spec's stated boundaries; no speculative sort/filter/export/rename affordances were introduced.
- Principle VI (Backend boundary): every new endpoint verifies session server-side, Zod-validates inputs, uses generated types, honours `Idempotency-Key`, returns the shared error envelope. Migration `0002_account_library.sql` includes all four RLS policies on `games` and three on `profiles`; `game_writes` is deny-all with a SECURITY DEFINER RPC.

**Post-design gate: PASS.** No new violations surfaced during design.

## Project Structure

### Documentation (this feature)

```text
specs/009-account-library/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── api-games.md         # /api/games and /api/games/[id] HTTP contract
│   ├── server-actions.md    # updateDisplayName, changePassword server actions
│   └── openapi.yaml         # machine-readable schema for the Route Handlers
├── checklists/
│   └── requirements.md  # From /speckit.specify (already exists)
└── tasks.md             # /speckit.tasks output (NOT written by /speckit.plan)
```

### Source Code (repository root)

```text
packages/core/src/
└── types.ts                            # + Profile, SavedGameRecord, LibraryEntry, GameLibrarySort types (shared)

packages/web/src/
├── app/
│   ├── layout.tsx                      # MODIFIED: remove <AuthPill/> from fixed top-right; render <AppSidebar/> alongside {children}
│   ├── account/
│   │   ├── page.tsx                    # Account Page (Server Component). Loads profile + library first batch via server client, renders <ProfileSection/> + <GameLibrary/>
│   │   └── games/
│   │       └── [id]/
│   │           └── page.tsx            # Review view (Server Component). Renders read-only <StatSheet/> + <GameLog readOnly/>
│   └── api/
│       └── games/
│           ├── route.ts                # GET (list library, paginated) + POST (create — write-through save start; idempotent)
│           └── [id]/
│               └── route.ts            # GET (single game full state) + PATCH (write-through save; idempotent) + DELETE
├── components/
│   ├── shell/
│   │   ├── AppSidebar.tsx              # NEW. Collapsible sidebar (CSS transform). Holds AuthPill + (signed-in) SidebarProfileIcon at bottom
│   │   ├── AppSidebar.test.tsx
│   │   └── SidebarProfileIcon.tsx      # NEW. Inline SVG profile icon, links to /account, keyboard-operable
│   ├── auth/
│   │   ├── auth-pill.tsx               # UNCHANGED behavior; now rendered from AppSidebar rather than layout
│   │   └── AnonymousGameOnSignInPrompt.tsx  # NEW Client Component. Blocks post-sign-in navigation until user picks Save/Keep/Discard
│   ├── account/
│   │   ├── ProfileSection.tsx          # NEW. Composes ProfileForm + ChangePasswordForm
│   │   ├── ProfileForm.tsx             # NEW. Display name + email (read-only). Uses updateDisplayName server action
│   │   ├── ChangePasswordForm.tsx      # NEW. Current + new password. Uses changePassword server action
│   │   ├── GameLibrary.tsx             # NEW. Server-rendered first batch, client hydration for scroll-into-view pagination
│   │   ├── LibraryEntry.tsx            # NEW. One row: teams, date + start time, status pill, score, actions (Continue / Review / Delete)
│   │   ├── DeleteGameDialog.tsx        # NEW. Uses <Modal>. Warning surface for in-progress: event count + period
│   │   └── GameReviewView.tsx          # NEW. Composes StatSheet + read-only GameLog for one finished game
│   └── game/
│       ├── StatSheet.tsx               # NEW (see Research decision R-05). Renders PlayerStats/TeamStats from core aggregations
│       └── GameLog.tsx                 # MODIFIED: accept readOnly prop that suppresses edit/delete affordances
├── lib/
│   ├── auth/
│   │   └── require-auth.ts             # UNCHANGED — reused by /account
│   ├── supabase/
│   │   ├── server.ts                   # UNCHANGED
│   │   ├── client.ts                   # UNCHANGED
│   │   └── types.gen.ts                # REGENERATED after 0002 migration
│   ├── games/
│   │   ├── serialize.ts                # NEW. Converts in-memory Zustand game state ↔ SavedGameRecord row
│   │   ├── writeThrough.ts             # NEW. Client-side hook: subscribeWithSelector -> PATCH /api/games/:id (debounced, idempotency-key)
│   │   └── writeThrough.test.ts
│   ├── validation/
│   │   ├── games.ts                    # NEW. Zod schemas for POST/PATCH /api/games bodies + query params
│   │   ├── games.test.ts
│   │   ├── profile.ts                  # NEW. Zod schemas for updateDisplayName + changePassword actions
│   │   └── profile.test.ts
│   ├── store.ts                        # MODIFIED: expose hydrateFromLibrary(record) and integrate writeThrough for signed-in sessions
│   └── persistence.ts                  # UNCHANGED (still owns local key thestats.game.v1)
└── (existing)

packages/web/supabase/migrations/
├── 0001_user_auth.sql                  # existing
└── 0002_account_library.sql            # NEW. profiles + games + game_writes (idempotency) + RLS + indexes

packages/web/tests/e2e/
├── auth.spec.ts                        # existing
├── account-profile.spec.ts             # NEW
└── account-library.spec.ts             # NEW
```

**Structure Decision**: This feature stays inside the existing monorepo layout (`packages/web` for Next.js + Route Handlers, `packages/core` for shared domain types). No new package is added. The account page and library live under `packages/web/src/app/account/`; new Route Handlers live under `packages/web/src/app/api/games/`; the collapsible sidebar and profile icon join the shell layer at `packages/web/src/components/shell/`. Server-only Supabase interactions (server client factory, Zod schemas, generated types) stay in `packages/web/src/lib/`, keeping shared domain types in `packages/core/src/types.ts` per Constitution Principle VI.

## Complexity Tracking

> No Constitution Check violations. Section intentionally left empty.
