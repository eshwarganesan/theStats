# Phase 0 — Research: Games Page (Sidebar Library + New Game Entry)

**Feature**: `010-games-library` | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

The plan's Technical Context has zero `NEEDS CLARIFICATION` markers (spec was cleared by three clarification passes; no new stack, storage, or dependency is introduced). This document therefore focuses on **design decisions** the plan already leans on, each with rationale and rejected alternatives so downstream tasks and reviewers can trace the reasoning without re-deriving it.

---

## R-01 — How to introduce nav items into the existing `AppSidebar` without breaking the collapsed-rail / expanded-overlay pattern

**Decision**: Introduce a single new presentational component `SidebarNavItem` under `src/components/shell/`. It accepts `{ href, label, icon, className? }`, uses `usePathname()` from `next/navigation` to decide `data-active`, and renders differently based on a sibling `data-collapsed` attribute already exposed by `AppSidebar` on its `<nav>` element:

- **Collapsed rail (56 px)**: icon-only button, 40×40 hit target, `aria-label={label}`. The label is still discoverable via a `<span className="sr-only">`.
- **Expanded overlay (256 px)**: icon + label side-by-side, same 40 px row height.

The item is mounted at the top of the sidebar's middle slot (the current `<div className="flex-1" />` on line 140 of `AppSidebar.tsx`), immediately below the collapse toggle. Adding more items later is a matter of stacking additional `<SidebarNavItem>` instances in that slot.

**Rationale**:
- Keeps `AppSidebar` a pure layout Client Component. It already reads `usePathname()`-friendly context via being mounted in the root layout, so an item inside it can do the same without new prop drilling.
- The existing sidebar sets `data-collapsed` on the root `<nav>` — that attribute is enough for the item's CSS-only responsive behavior (icon vs. icon + label) without duplicating the `readInitialCollapsed()` logic or plumbing state through props.
- Presentational + single-purpose per Constitution III; testable in isolation with Vitest + RTL.
- The `sr-only` label preserves keyboard/screen-reader parity in the collapsed rail, satisfying the Constitution "Accessibility" clause and spec FR-002.

**Alternatives considered**:
- **Prop-drill an array of `NavItem`s into `AppSidebar`**: rejected — one item today, and prop-drilling would push a decision the sidebar shouldn't own (which items exist). A composition-first sibling component keeps the sidebar layout-focused.
- **Render the nav item inside `layout.tsx` alongside the sidebar**: rejected — the item must be *inside* the sidebar's fixed-position `<nav>` so it participates in the collapse/expand animation, sits under the click-to-close backdrop, and stays visible in the always-mounted 56 px rail.
- **Have the sidebar itself track and render its item list**: rejected — that turns the sidebar into a route registry, coupling shell layout to product surface.

---

## R-02 — Should feature 009's library components stay in `components/account/` or move to `components/games/`?

**Decision**: Move `GameLibrary.tsx`, `LibraryEntry.tsx`, `LibraryErrorBoundary.tsx`, `DeleteGameDialog.tsx`, and `GameReviewView.tsx` (plus their `.test.tsx` siblings) from `src/components/account/` to a new `src/components/games/` folder. Their internal logic is unchanged; only two things update:

- Import paths at consumer sites (the new `/games/page.tsx`, the modified `/account/page.tsx` which no longer imports any of them, and the moved test files themselves).
- `LibraryEntry.tsx`'s Review button navigates to `/games/${entry.id}` instead of `/account/games/${entry.id}` (one-line change; the accompanying test asserts the new href).

**Rationale**:
- After Q1's decision (Games page replaces the account-page library), keeping these files under `components/account/` misrepresents ownership — they now serve a page that is not the account page. A future reader looking at `components/account/` should see profile-only surfaces (Profile, ChangePassword). Anything else is a live trap.
- Feature-scoped folders under `components/` are the established convention in this repo (`components/account/`, `components/home/`, `components/shell/`). A `components/games/` folder extends that convention rather than introducing a new one.
- Move is mechanical (`git mv`) and preserves history, so blame/log for the moved files continues to resolve to feature 009's original authorship.

**Alternatives considered**:
- **Leave the components in `components/account/` and import from `/games/page.tsx`**: rejected — creates a permanent misdirection (`components/account/GameLibrary.tsx` isn't rendered by the account page anymore). Adds cognitive tax without saving effort.
- **Move to `components/library/`** (a name mirroring "library section"): rejected — the user-facing name of the page and the sidebar item is "Games", so the folder should match. Terminology consistency with the spec (Clarifications session, FR-001, FR-005).
- **Move to `packages/core/`**: rejected — these are React components with Zustand `useGameStore` bindings, not shared domain types. `packages/core` is for framework-neutral shared types.

---

## R-03 — How to implement the `/account/games/[id]` → `/games/[id]` 301 redirect (FR-021)

**Decision**: Declare the redirect in `next.config.mjs` via the `redirects()` async function, using the App Router path pattern:

```js
async redirects() {
  return [
    {
      source: "/account/games/:id",
      destination: "/games/:id",
      permanent: true,
    },
  ];
}
```

The concrete `/account/games/[id]/page.tsx` file is deleted in the same commit that introduces `/games/[id]/page.tsx`, so there is no ambiguity between a route-file match and the redirect. Internal in-app navigation (currently `LibraryEntry.tsx`'s Review button) is updated to target `/games/[id]` directly per FR-021's second sentence — nothing in the codebase relies on the redirect after this feature ships. The redirect only exists for external bookmarks / shared links.

**Rationale**:
- Framework-native, resolved at the edge before hitting any route handler — cheapest path.
- `permanent: true` produces a 308 (which most crawlers and browsers treat equivalently to a 301 for the purpose FR-021 describes) and updates cached client-side navigation state cleanly.
- Middleware would work too but would run on every request path (matcher permitting) and adds one branch per request; a static config-level redirect is O(1) at the router.
- A Server-Component `redirect()` would only fire *after* the Server Component has been requested, meaning the browser would first hit `/account/games/[id]`, get a 200 from the redirect page, then be told to bounce. That's a strictly worse UX than a top-of-request redirect.

**Alternatives considered**:
- **Keep `/account/games/[id]/page.tsx` as a stub that calls `redirect("/games/[id]")` from a Server Component**: rejected — extra file, extra render pass, no benefit.
- **Handle the redirect in `middleware.ts`**: rejected — the existing middleware's job is Supabase cookie refresh; overloading it here couples two unrelated concerns.
- **Skip the redirect and let old bookmarks 404**: rejected — violates FR-021 and SC-004's "0 dead ends" guarantee.

---

## R-04 — Is the existing `last_activity_at desc` sort still correct for the Games page, and does the interleave decision (Clarification Q3) require any query change?

**Decision**: Reuse `GET /api/games`'s existing `ORDER BY last_activity_at DESC LIMIT :limit` (with `< :cursor` for pagination) exactly as it is. The Q3 decision — a single interleaved list with per-row status pills — is served *by that same query*, because `last_activity_at` is status-agnostic: an in-progress game the user just edited and a finished game whose scoresheet was reviewed both update `last_activity_at` on write. No `ORDER BY status …` fragment is added; no separate query for in-progress vs. finished is issued.

**Rationale**:
- Aligns with the spec's Clarifications session (Q3 → single interleaved list) and FR-009's "MUST interleave / MUST NOT split into sections, tabs, or filtered views".
- Preserves the `games_owner_last_activity_idx` composite index that migration `0002_account_library.sql` already declares — no schema or query-plan changes.
- Preserves the cursor-pagination invariant (`last_activity_at` monotonically decreasing across the list): swapping in a secondary sort key would break cursor arithmetic.
- Preserves feature 009's behavior for the sole consumer that continues to exist (the moved `GameLibrary` client component).

**Alternatives considered**:
- **`ORDER BY (status='in-progress') DESC, last_activity_at DESC`** to pin in-progress rows to the top: rejected — contradicts Q3 (would create implicit sectioning) and complicates cursor pagination.
- **Two separate queries + merge on the client**: rejected — doubles round-trips and re-introduces the sectioning contradicted by Q3.

---

## R-05 — Test strategy that keeps the repo's coverage thresholds (90 % global, 95 % `src/lib/**`) green

**Decision**: Every new `src/**` module (excluding `src/app/**`, which is coverage-excluded and covered by Playwright) ships with a Vitest test file mirroring the module name. Concretely:

| New / touched source file | Test file | What it must exercise |
|--------------------------|-----------|----------------------|
| `src/components/shell/SidebarNavItem.tsx` | `SidebarNavItem.test.tsx` | Renders icon-only in collapsed context; icon + label in expanded context; `data-active="true"` when `usePathname()` matches `href` or a descendant path (`/games/abc` matches `/games` item); `aria-label` present in both modes; keyboard-activatable. |
| `src/components/shell/AppSidebar.tsx` (modified) | `AppSidebar.test.tsx` (modified) | Existing collapse tests preserved. New assertion: the Games nav item is mounted, is a link to `/games`, and is present in both collapsed and expanded snapshots. |
| `src/components/shell/icons/IconGames.tsx` | (covered transitively via `SidebarNavItem.test.tsx` snapshot / `role="img"` presence) | Renders an accessible inline SVG. |
| `src/components/games/*.tsx` (moved) | `*.test.tsx` (moved) | Existing feature-009 tests carry over unchanged. The one modified test is `LibraryEntry.test.tsx`: update the "Review" href assertion from `/account/games/:id` to `/games/:id`. |
| `src/components/games/NewGameCta.tsx` | `NewGameCta.test.tsx` | Renders a `<button>` with label "New game"; on click clears persisted local game via `clearPersistedGame`, resets the store via `useGameStore.getState().resetAll()`, and pushes `/setup` — the same three-step order documented in `NewGameButton.tsx`. Covers the click handler and its `defaultPrevented` short-circuit. |
| `src/app/(authenticated)/account/page.tsx` (modified) | (no new unit test; page-level; covered by `account-profile.spec.ts` Playwright suite) | Removal of `GameLibrary` mount + `LibraryErrorBoundary` wrapper. |
| `src/app/(authenticated)/games/page.tsx` (new) | (page-level; covered by `games-*.spec.ts` Playwright suites) | Server Component; auth-gated via `requireAuth`; loads initial batch; renders `<NewGameCta>` above `<GameLibrary>` inside `<LibraryErrorBoundary>`. |
| `src/app/(authenticated)/games/[id]/page.tsx` (new) | (page-level; covered by `games-review.spec.ts` / e2e) | Server Component; auth-gated; loads full record; delegates to `<GameReviewView>` for finished, `redirect("/games")` for in-progress (parallels the existing `/account/games/[id]` behavior). |

Because `src/app/**` is excluded from `vitest.config.ts` coverage (verified: lines 44–48), new page files do not lower the numerator. New `src/components/**` files must clear ≥ 90 %; new `src/lib/**` files must clear ≥ 95 %. This feature adds no new `src/lib/**` files (existing types + serializers are reused verbatim), so the 95 % override is not stressed. The two moved `components/account/*` → `components/games/*` files carry their existing coverage forward.

Run before opening the PR: `npm run test:coverage` and `npm run test:e2e` — both must be green.

**Rationale**:
- The thresholds in `vitest.config.ts` block a red PR from merging even if reviewers miss a gap. Failing the coverage gate is the *design*, not an accident to work around.
- Constitution I (TDD, non-negotiable) requires the tests be written first. This table is the checklist.
- Excluding `src/app/**` from unit-test coverage is an existing repo choice tied to the Server/Client boundary — pages don't render usefully in jsdom without extensive mocking, and their behavior is more faithfully asserted by Playwright.

**Alternatives considered**:
- **Bypass the thresholds for the moved files**: rejected — coverage regression is explicitly prohibited by Constitution I.
- **Skip a dedicated `NewGameCta.test.tsx` and rely on the existing `NewGameButton.test.tsx`**: rejected — they are separate components (different labels, different visual affordances, potentially different empty-state variants); each needs its own test file per Constitution III's "each component MUST have an associated test".

---

## R-06 — Migrating the existing account-library E2E specs to Games-page equivalents without dropping any acceptance coverage

**Decision**: The following mapping is applied in the same PR that introduces `/games`:

| Existing spec | Fate | New spec |
|--------------|------|----------|
| `account-library.spec.ts` | Delete | `games-library.spec.ts` — covers US1 acceptance scenarios 1–4 (list rendering, empty state, ordering, pagination on 50+ games). Reuses the existing seed helpers (`createConfirmedUser`, seeded `games` rows via the service-role admin client). |
| `account-continue.spec.ts` | Delete | `games-continue.spec.ts` — covers US3 acceptance scenarios 1 & 4 (in-progress restoration on click; return-to-list reflects updates). |
| `account-review.spec.ts` | **Modify in place** — change URL targets from `/account/games/[id]` to `/games/[id]`; keep test file name for git history clarity. Rename to `games-review.spec.ts` only if the whole file is being restructured (author's discretion). | (same file, updated) — covers US3 acceptance scenario 2 (finished game → read-only review view). |
| `account-profile.spec.ts` | Keep unchanged | (unchanged) — profile section still lives at `/account`, unaffected. |
| `auth.spec.ts` | Keep unchanged | (unchanged) |
| All other `*.spec.ts` (adjust-clock, foul-out, live-scoring, persistence, etc.) | Keep unchanged | (unchanged) |
| — | Add | `games-new.spec.ts` — covers US2 (New game CTA visible with populated list, empty state; click routes to `/setup`; created game appears back on `/games`). |
| — | Add | `games-sidebar.spec.ts` — covers US1 acceptance scenarios 1 & 5 (sidebar item visible in collapsed rail + expanded overlay; click navigates; active-state indicator on both `/games` and `/games/:id`). Also covers Edge Case "Sidebar Games item when signed out" (item present, click routes through login). |
| — | Add | `games-redirect.spec.ts` — covers FR-021 (`/account/games/[id]` returns a 30x redirect to `/games/[id]` with the same id; the final resolved page renders the game). One test with `page.route()` interception to observe the 3xx status; one test asserting the browser lands on `/games/[id]`. |

**Rationale**:
- Every acceptance scenario in `spec.md` and every FR listed in `plan.md` maps to at least one Playwright spec. The user's `/speckit.plan` directive explicitly called out "all e2e tests are covered"; the table above is the traceability matrix.
- Deletion of `account-library.spec.ts` / `account-continue.spec.ts` (rather than modification) is intentional: the Given clauses would no longer make sense on `/account` after FR-020 lands. Keeping stale specs "as is" would either fail forever or silently pass against a non-existent code path. Deletion + new spec = same coverage, clearer intent.
- `account-review.spec.ts` is modified in place because feature 009 already flowed the finished-review page under that name; only the URL changes. Renaming is optional and left to the author of the tasks PR.

**Alternatives considered**:
- **Add new `games-*` specs while leaving the old `account-*` specs in place**: rejected — they'd exercise routes that no longer exist and CI would fail permanently.
- **Move the assertions inline via a shared helper and dispatch by URL**: rejected — tests should read straight-through; helper indirection defeats the "acceptance scenario ↔ test" map.
- **Skip the redirect test (`games-redirect.spec.ts`) on the grounds that a route-level `redirects()` entry is "obviously right"**: rejected — FR-021 is a promise to users with existing bookmarks and SC-004 measures it; it must be asserted.

---

## Cross-references

- Constitution: `.specify/memory/constitution.md` (v 1.1.0) — Principles I (TDD), II (types), III (components), IV (performance), V (discipline), VI (backend).
- Vitest config: `packages/web/vitest.config.ts` — thresholds and coverage excludes are the authoritative gate.
- Playwright config: `packages/web/playwright.config.ts` — reuses local `next dev`.
- Feature 009 spec: `specs/009-account-library/spec.md` — the source of the components, types, endpoints, and migration this feature reuses.
- Feature 009 migration: `packages/web/supabase/migrations/0002_account_library.sql` — reused unchanged.
