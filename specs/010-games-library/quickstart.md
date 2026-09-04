# Phase 1 — Quickstart: Games Page (Sidebar Library + New Game Entry)

**Feature**: `010-games-library` | **Plan**: [plan.md](./plan.md)

Practical entry point for a contributor picking up this feature. Assumes the repo is already cloned and `npm install` has run at the workspace root.

## Prerequisites

- Node.js — matches the CI version (see `.github/workflows/*.yml`; currently Node 22).
- Supabase env vars in `packages/web/.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` for E2E only). Integration and E2E tests self-skip when these are missing, so you can start without them — but the acceptance criteria for this feature need them.
- Migration `0002_account_library.sql` already applied to the hosted Supabase (it's the feature-009 migration; already present on any branch based on `main`). **This feature adds no new migration.**
- You are on branch `010-games-library` (created by `/speckit.specify`).

## Local dev loop

From `packages/web/`:

```bash
npm run dev          # starts Next.js at http://localhost:3000
npm run test:watch   # vitest in watch mode — leave running while you TDD
```

The Games page mounts at http://localhost:3000/games after this feature ships. Until then, the account page (http://localhost:3000/account) still shows the library section — treat it as the "before" state.

## Recommended task order (TDD)

Constitution Principle I: red before green. Work each row top-to-bottom.

1. **Failing test for the sidebar item** → `src/components/shell/SidebarNavItem.test.tsx` + updated `AppSidebar.test.tsx`. Assert (a) `<a href="/games">` rendered, (b) `aria-label="Games"` in collapsed, (c) `data-active="true"` when `usePathname()` returns `/games` or `/games/abc`. Run `npm run test`; watch it fail. Implement `SidebarNavItem.tsx` + `IconGames.tsx`; mount in `AppSidebar.tsx`. Watch it pass.
2. **Failing Playwright spec for sidebar behavior** → `tests/e2e/games-sidebar.spec.ts`. Then wire the item into `AppSidebar.tsx`.
3. **Failing test for `NewGameCta`** → `src/components/games/NewGameCta.test.tsx`. Assert the three-step click sequence (`clearPersistedGame` → `resetAll` → `router.push("/setup")`), same order as `NewGameButton`. Implement `NewGameCta.tsx`.
4. **Move the library components** → `git mv src/components/account/{GameLibrary,GameLibrary.test,LibraryEntry,LibraryEntry.test,LibraryErrorBoundary,LibraryErrorBoundary.test,DeleteGameDialog,DeleteGameDialog.test,GameReviewView,GameReviewView.test}.{tsx,ts} src/components/games/`. Update `LibraryEntry.tsx`'s Review target from `/account/games/${entry.id}` to `/games/${entry.id}`, and update its test to assert the new href. `npm run typecheck` will flag every stale import — update them (the only remaining consumer of the old paths is `src/app/(authenticated)/account/page.tsx`, which will be edited in step 6).
5. **Create the Games page route** → failing Playwright spec `tests/e2e/games-library.spec.ts` first (US1 scenarios 1–4). Then create `src/app/(authenticated)/games/page.tsx` following the shape documented in `data-model.md`. Then create `src/app/(authenticated)/games/[id]/page.tsx` by copying `src/app/(authenticated)/account/games/[id]/page.tsx` and swapping the `/account` redirect target for `/games`. Delete the old file when the Playwright suites are green.
6. **Trim the account page** → remove the `<GameLibrary>` mount + `<LibraryErrorBoundary>` wrapper + `loadInitialLibrary()` helper from `src/app/(authenticated)/account/page.tsx`. Update `tests/e2e/account-profile.spec.ts` if it asserts the presence of the library section (it shouldn't — but check). Delete `tests/e2e/account-library.spec.ts` and `tests/e2e/account-continue.spec.ts` in the same commit as the new `games-*` specs.
7. **Wire the redirect** → add the `redirects()` entry in `next.config.mjs`. Failing spec: `tests/e2e/games-redirect.spec.ts` (asserts 30x + resolved page). Green when the config is in place.
8. **New-game flow spec** → `tests/e2e/games-new.spec.ts` (US2). Verifies the CTA's presence in both populated and empty states, click takes user to `/setup`, completing setup produces a row on `/games`.
9. **Run the full gate**: `npm run test:all` from `packages/web/` (or the workspace root). This runs `typecheck`, `lint`, `test:coverage`, `test:e2e`. All must pass.

## Coverage checkpoint

`vitest.config.ts` enforces 90 % lines/functions/branches/statements globally and 95 % for `src/lib/**`. Because `src/app/**` is coverage-excluded, the new page files do not lower the numerator — but every new `src/components/games/*` and `src/components/shell/*` file must be covered by a `.test.tsx` sibling. If `npm run test:coverage` prints a threshold failure, fix the test (do not lower the threshold).

## E2E acceptance matrix (traceability)

| Spec (from `spec.md`) | Playwright spec | Notes |
|----------------------|-----------------|-------|
| US1 · Scenario 1 (list rendering) | `games-library.spec.ts` | seeded games via service role admin client |
| US1 · Scenario 2 (empty state) | `games-library.spec.ts` | fresh user, no rows |
| US1 · Scenario 3 (ordering) | `games-library.spec.ts` | assert row order by `last_activity_at` |
| US1 · Scenario 4 (50+ games) | `games-library.spec.ts` | seed 50+ games, scroll, assert incremental load |
| US1 · Scenario 5 (collapsed rail) | `games-sidebar.spec.ts` | assert icon-only + `aria-label` |
| US2 · Scenario 1 (CTA visible) | `games-new.spec.ts` | populated + empty state |
| US2 · Scenario 2 (CTA opens setup) | `games-new.spec.ts` | click → `/setup` |
| US2 · Scenario 3 (empty state CTA) | `games-new.spec.ts` | no games; empty-state layout |
| US2 · Scenario 4 (new game shows up) | `games-new.spec.ts` | full setup → back to `/games` → assert row present |
| US3 · Scenario 1 (in-progress opens live) | `games-continue.spec.ts` | replaces `account-continue.spec.ts` |
| US3 · Scenario 2 (finished opens review) | `account-review.spec.ts` (updated URLs) | in place; URL targets swap |
| US3 · Scenario 3 (return-to-list reflects updates) | `games-continue.spec.ts` | record events → back → assert updated status/score |
| US3 · Scenario 4 (deleted game unavailable) | `games-continue.spec.ts` | delete via admin client between renders |
| Edge · Signed-out clicks Games | `games-sidebar.spec.ts` | assert redirect to `/login?from=%2Fgames` and return |
| Edge · Games list fetch fails | `games-library.spec.ts` | mock `/api/games` to 500; assert shell renders + retry |
| Edge · Deep link to non-owned id | `games-continue.spec.ts` (or `games-library.spec.ts`) | assert notFound() → back-to-list notice |
| FR-021 · Old `/account/games/[id]` bookmark | `games-redirect.spec.ts` | assert 30x + resolved page |

## Rollback plan

Because no migration and no server contract change, rolling back is: revert the branch's commits, and the app returns to feature 009's account-page library behavior. No data migration is required in either direction. The one-way "old bookmark → new URL" 301 becomes a plain 200 again once the code is reverted.
