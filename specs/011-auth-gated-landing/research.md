# Phase 0 — Research

**Feature**: 011-auth-gated-landing
**Date**: 2026-09-10

The Technical Context in `plan.md` carries **zero** `NEEDS CLARIFICATION` markers. Every technology decision falls out of prior features or the user's explicit plan direction. The purpose of this document is therefore to record the **rationale and rejected alternatives** for each non-obvious design choice, so a future maintainer (or `/speckit.tasks`) does not re-litigate them.

---

## R1 — Enforce the auth wall in middleware, not in `requireAuth()`

**Decision**: Move the primary auth gate for protected page routes into `packages/web/middleware.ts`. Middleware inspects the just-refreshed session, and for unauthenticated hits on `/setup`, `/game/**`, `/games/**`, `/account/**` it returns a `307` redirect to `/login?from=<encoded path>`. `requireAuth()` (feature 005) is retained inside Server Components as a defense-in-depth check but is no longer the primary enforcement point.

**Rationale**:
- **Satisfies FR-007 "no flash of landing content" and the parallel "no flash of protected content" implied by FR-009.** A middleware redirect is issued before any Server Component render begins, so the browser never receives partial protected-page HTML.
- **Removes a whole class of hydration bugs.** Under the current setup, `/setup` and `/game` render anonymously today; if we simply add `requireAuth()` inside each of them, we still pay for the render up to the `redirect()` call. The middleware bounce eliminates that wasted work entirely.
- **Single choke point.** All protected paths flow through one file (`middleware.ts`) — reviewers and future contributors have one place to audit the gating rules, rather than N Server Components.

**Alternatives considered**:
- **Only use `requireAuth()` per page (no middleware change)**: rejected. Loses the "no flash" guarantee, spreads the enforcement decision across every new authenticated page, and creates a real risk that a future page forgets to call it.
- **Push the entire check onto RLS at the API level and let pages render blank when data is missing**: rejected. Violates FR-002 (landing must not display sidebar/chrome) and FR-007 (no flash) simultaneously — the page shell still paints, only the content falls out.
- **Delete `requireAuth()` entirely**: rejected. It's cheap belt-and-suspenders, prevents a middleware misconfiguration from silently serving a protected page, and still returns the typed `User` object that Server Components consume.

## R2 — Route-group layout (`(authenticated)/layout.tsx`) is the sidebar owner

**Decision**: Create `packages/web/src/app/(authenticated)/layout.tsx` that renders `<AppSidebar>`, `<SidebarProfileIcon>`, `<WriteThroughProvider>`, `<RecoveryFailedBanner>`, `<StorageUnavailableModal>`, and applies the existing `pl-14` inset. Move `<StorageAvailabilityProvider>` up in the tree so both public and authenticated pages get storage-availability signals (the modal itself only mounts under `(authenticated)`). `app/layout.tsx` shrinks to HTML shell + fonts + `StorageAvailabilityProvider`.

**Rationale**:
- **This is the idiomatic App Router way** to share a layout across a *subset* of routes without adding a URL segment. Route groups are a first-class Next.js feature; nothing bespoke.
- **Solves FR-002 and FR-011 by construction.** Because `/`, `/login`, `/auth/callback` sit at the root (not inside `(authenticated)/`), they simply do not inherit the sidebar layout — no conditional-render logic on the sidebar itself, no CSS hacks, no `usePathname()` inside `AppSidebar`.
- **`WriteThroughProvider` semantically belongs on authenticated routes only.** It performs authenticated writes back to the games API; running it for a signed-out user is either wasted work or a source of 401s in the console.

**Alternatives considered**:
- **Keep sidebar in root layout and conditionally render it based on `usePathname()`**: rejected. Client-side conditional rendering means the sidebar's DOM briefly appears then disappears on `/`, undermining FR-002 and FR-007. Also forces `AppSidebar` to become session-aware, dragging auth concerns into a shell component.
- **Duplicate the sidebar wrapper in each authenticated page**: rejected. Violates Constitution Principle V (DRY) and Principle III (single-responsibility components).
- **Introduce a parallel `(public)/layout.tsx`**: rejected. Only three public routes exist (`/`, `/login`, `/auth/callback`), and none of them share meaningful chrome. The root layout is enough.

## R3 — Relocate `/setup` and `/game/**` under `(authenticated)/`

**Decision**: Move `packages/web/src/app/setup/` → `packages/web/src/app/(authenticated)/setup/`, and `packages/web/src/app/game/` → `packages/web/src/app/(authenticated)/game/`. All existing subtrees (`game/stats`, `game/scoresheet`, `game/layout.tsx`) move as-is with the parent folder.

**Rationale**:
- **FR-008 requires these routes to be authenticated**; the fastest way to enforce that layout-wise is to place them under the same group whose layout owns the authenticated shell, so they receive the same sidebar / providers / chrome as `/games` and `/account` automatically.
- **Middleware still runs regardless of whether a page is in the group** — the physical folder move is about which layout tree the page inherits, not about auth enforcement. But it means the sidebar-showing behavior is coherent: every protected page shows the sidebar, no protected page shows a bare frame.

**Alternatives considered**:
- **Leave `/setup` and `/game` at the root and add `requireAuth()` to each page**: rejected. Would work for gating, but breaks FR-002-in-spirit (setup/game would render without the sidebar chrome, unlike the sibling authenticated routes), and creates two parallel layout patterns for authenticated pages.
- **Move only `/game` and leave `/setup` at the root** (arguing setup is a "wizard"): rejected. Neither the spec nor the codebase distinguishes setup from other authenticated pages. Consistency wins.

## R4 — `from`-param open-redirect protection is centralized in `safeFrom()`

**Decision**: Extract the existing inline `safeFrom()` helper from `packages/web/src/app/login/page.tsx` into a standalone module `packages/web/src/lib/auth/safe-from.ts` and reuse it from (a) the middleware when composing the redirect URL and (b) the login page when reading the query param. Rules: reject values > 512 chars, require a leading `/` that is NOT followed by another `/` (blocks protocol-relative `//attacker.com`), and reject anything that isn't a relative path.

**Rationale**:
- **The login page already enforces this guard** — the middleware would silently regress security if it composed `/login?from=<raw pathname>` without the same guard, because a malicious redirect chain could smuggle `from=//attacker.com` back into the browser.
- **Single implementation, single test suite.** Constitution Principle V (DRY): the guard is nine lines of regex-adjacent code; having one canonical version prevents drift.

**Alternatives considered**:
- **Duplicate the guard in middleware**: rejected — drift risk.
- **Skip the guard in middleware because the login page validates on read**: rejected. If the middleware composes an unsafe URL, an attacker's controlled redirect chain could exploit *other* handlers that trust `from` without re-validating (e.g., a future sign-up page). Validating at write-time closes the door earlier.

## R5 — Middleware matcher stays broad; branching logic lives inside

**Decision**: Keep the current matcher (`"/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"` — everything except static assets) rather than switching to a narrow allow-list of protected paths. Inside the middleware body, use a small `PROTECTED_PREFIXES` list + explicit checks for `/` and `/login` to decide the response.

**Rationale**:
- **Cookie refresh must run on every non-static request** (the whole reason today's middleware exists — feature 005's FR-008 sliding session). A narrower matcher would break session freshness for `/` and other public pages.
- **A single matcher plus centralized branching is easier to reason about** than two matchers (one for cookies, one for redirects). Reviewers can read the entire routing decision as one function.

**Alternatives considered**:
- **Two separate middlewares (one for cookies, one for gating)**: rejected — Next.js supports exactly one `middleware.ts` per project; simulating two via chaining would be complexity for no gain.
- **Narrow matcher to only `/setup`, `/game/*`, `/games/*`, `/account/*`**: rejected — kills cookie refresh on the landing page, so a signed-in user who leaves the tab on `/` overnight loses session freshness they would otherwise retain.

## R6 — Redirect-authenticated-users-away-from-`/`-and-`/login` in the same middleware

**Decision**: In addition to bouncing unauthenticated hits on protected routes, the middleware also handles the two "authenticated user in the wrong place" cases: `/` → `/games` (FR-006 / FR-007) and `/login` → `/games` (FR-012). These use the same session lookup already performed for cookie rotation, so they add zero extra Supabase round-trips.

**Rationale**:
- **FR-007 explicitly forbids a landing-hero flash for signed-in users.** A middleware 307 is the only place the redirect happens *before* the Server Component render begins. Putting the check inside `app/page.tsx` as `if (user) redirect("/games")` would work correctness-wise but would still cost the initial render invocation and would race with any client-side hydration.
- **Removes the need for `app/page.tsx` to know about auth at all.** The landing becomes a pure marketing surface: it never even mounts for a signed-in user.

**Alternatives considered**:
- **Do the `/ → /games` redirect inside `app/page.tsx` via `redirect()`**: rejected — see above (still runs the Server Component, less clean).
- **Do it via a client-side `useEffect` on the landing**: rejected — guarantees a flash of the landing, directly violating FR-007.
- **Change the login page's existing `redirect(from ?? "/")`**: still needed (FR-012), but changing it to `redirect(from ?? "/games")` is a *complement* to the middleware bounce, not a substitute — the middleware handles the "user arrives at `/login` while signed in" case; the login page's own guard handles the "user submitted the form while somehow already signed in" race.

## R7 — Clear anonymous local game state on sign-in (FR-016) in the login form's success handler

**Decision**: Wire the `LoginPanel` client component's sign-in success path to invoke the existing `clearPersistedGame()` helper (which already wipes both `thestats.game.v1` and `thestats.clock.v1`, and also resets the Zustand store) *before* it triggers the post-login navigation.

**Rationale**:
- **Client-side is the only place with access to `localStorage`.** Middleware runs on the edge; the sign-in Route Handler runs server-side; neither can touch the browser's storage. The login form component that receives the success response is the natural hook point.
- **`clearPersistedGame()` already exists** and is what today's landing `NewGameButton` invokes — reusing it means zero new persistence logic, and the same wipe semantics used by the "start fresh" flow.
- **Order matters** (per `NewGameButton.tsx`'s comment): clear → navigate. If navigation happens first, a race with any listener re-hydrating from localStorage could leak old state into the newly authenticated session.

**Alternatives considered**:
- **Clear on sign-out instead of sign-in**: rejected — a signed-out session that then signs back in for a *different* user (shared browser) would still inherit the state.
- **Clear on every session change via a store subscription**: rejected — adds a permanent listener for a one-shot need, and creates confusing semantics if the same user's session refreshes mid-game.
- **Add a server-side sign-in trigger that returns a "please clear local state" flag**: rejected — over-engineered; the client already knows the sign-in just succeeded.

## R8 — Landing CTAs become plain `<Link href="/login">`; delete mutating `NewGameButton`

**Decision**: Replace the two landing hero CTAs (`<NewGameButton>New Game →</NewGameButton>` and `<Link href="/game"><Button>Continue Game</Button></Link>`) with plain `<Link href="/login"><Button …>…</Button></Link>` pairs. Delete `packages/web/src/components/home/NewGameButton.tsx` and its test.

**Rationale**:
- **FR-004 forbids a signed-out click from clearing persisted game state.** Today's `NewGameButton` calls `clearPersistedGame()` unconditionally. Making it session-aware would be one option, but the landing page is *only ever served to signed-out visitors* (per R6, signed-in visitors never see it), so the "signed-in" branch would be dead code.
- **A plain `<Link>` is smaller.** Removes a `"use client"` component, a `useRouter` hook, and a click handler from the landing bundle. Net bundle-size decrease.
- **The mutating "New Game" flow still exists in exactly one place: the `<NewGameCta>` on `/games`** (feature 010). That's the correct home for it now.

**Alternatives considered**:
- **Keep `NewGameButton` and neuter it (always route to `/login`)**: rejected — dead branch, misleading name, needless client component.
- **Route the landing CTAs directly to `/setup` and `/game`, letting middleware bounce them to `/login` naturally**: rejected — technically works (the visible user experience is the same one 307 later), but SC-006 asks for "single click, no intermediate stops". A direct `<Link href="/login">` is one hop; the alternative is one hop plus an internal redirect. Cleaner to be explicit.

## R9 — API endpoint gating is already complete; no work needed on the API surface

**Decision**: No changes to `packages/web/src/app/api/**`. The only internal API family is `/api/games/*`, which flows through `withAuthenticatedHandler` (verifies session, applies Zod validation, returns the uniform error envelope). RLS on `public.games` provides the authoritative ownership check. `/api/auth/*` is public by intent.

**Rationale**:
- **FR-015 is satisfied by the existing implementation** delivered in features 009/010. Verified by reading `packages/web/src/app/api/games/route.ts` and confirming `withAuthenticatedHandler` is the top-level wrapper.
- **Adding middleware-level API gating on top would be duplicative** and could interfere with the handlers' uniform error envelope (Constitution Principle VI: single, consistent `{ error: { code, message } }` shape).

**Alternatives considered**:
- **Have middleware return `401 JSON` for unauthenticated `/api/games/*` requests**: rejected — the handler already does this and does so with the constitutional error shape. Middleware-level 401s would need to duplicate that shape or diverge from it.

## R10 — `requireAuth()` stays as belt-and-suspenders inside Server Components

**Decision**: Leave the existing `requireAuth()` calls in place inside protected Server Components (`/games/page.tsx` already has one; when relocating `/setup/page.tsx` and `/game/*/page.tsx` into the `(authenticated)/` group, add `requireAuth({ from: "<their path>" })` to each). Middleware is the primary gate; `requireAuth` is the safety net.

**Rationale**:
- **Cost is negligible** — the middleware just refreshed the session cookie, so `requireAuth`'s `getUser()` hits the same in-request session context and does not incur an extra network call.
- **Prevents a whole class of misconfiguration** — if `middleware.ts` is ever accidentally shipped with a broken matcher or a bug in the `PROTECTED_PREFIXES` list, `requireAuth` catches the miss and still redirects.
- **Provides the `User` object to the Server Component** so it doesn't need a second lookup for user-scoped rendering decisions.

**Alternatives considered**:
- **Remove `requireAuth()` from pages and trust middleware alone**: rejected — cheap safety net worth keeping.

---

## Summary of outputs

- All decisions above are recorded — no `NEEDS CLARIFICATION` remaining.
- Ready for Phase 1 (data-model.md, contracts/middleware.md, quickstart.md).
