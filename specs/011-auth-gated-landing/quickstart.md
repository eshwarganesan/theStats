# Quickstart — Auth-Gated App with Public Landing Page

**Feature**: 011-auth-gated-landing
**Date**: 2026-09-10
**Audience**: whoever picks up implementation after `/speckit.tasks` fans out the work — or a reviewer who wants to smoke-test the branch locally before approving.

This quickstart is the shortest path from a fresh checkout of `011-auth-gated-landing` to seeing every acceptance scenario pass by eye.

## 1. Environment

```bash
# From repo root
nvm use 22           # per CI (main branch pinned to Node 22)
npm ci               # respects package-lock.json
```

Environment variables required (`packages/web/.env.local`):

- `NEXT_PUBLIC_SUPABASE_URL` — same as prior features
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — same
- `SUPABASE_SERVICE_ROLE_KEY` — server-only; do NOT expose

No new env vars are introduced by this feature.

## 2. Run the app

```bash
npm run dev --workspace=packages/web
# → http://localhost:3000
```

## 3. Smoke test the three user stories

### P1 — Public landing for signed-out visitors

1. In an incognito window, visit `http://localhost:3000/`.
2. **Expect**: The CourtLog hero renders **without a sidebar** — no left-rail, no in-app chrome. Left edge of hero content sits flush against the viewport.
3. Click **"New Game →"**. **Expect**: browser lands on `/login`. No `/setup` flash. No local persisted game was cleared.
4. Hit back. Click **"Continue Game"**. **Expect**: browser lands on `/login`.
5. On `/login`, complete a valid sign-in. **Expect**: browser lands on `/games`. (Not the landing, not `/setup`.)

### P2 — Signed-in users skip the landing

1. While signed in from step P1, open a new tab to `http://localhost:3000/`.
2. **Expect**: URL immediately becomes `/games`. No hero flashes; no landing content ever paints.
3. Sign out (via the profile menu). **Expect**: browser lands back on `/` (landing).

### P3 — Deep-link protection

1. Signed out again, paste `http://localhost:3000/setup` into the address bar.
2. **Expect**: URL becomes `http://localhost:3000/login?from=%2Fsetup`. Login page renders without a sidebar.
3. Sign in. **Expect**: browser lands on `/setup`.
4. Sign out. Repeat with `/game`, `/games`, `/games/<any-id>`, and `/account` — each should redirect to `/login?from=<encoded>`.

### FR-016 — Anonymous local game state cleared on sign-in

1. Sign out.
2. Open DevTools → Application → Local Storage. Manually set:
   - `thestats.game.v1` to any JSON value (e.g. `{"stub":true}`)
   - `thestats.clock.v1` to any JSON value
3. Sign in.
4. **Expect**: both keys are absent from local storage before the destination page paints.

### FR-002 / FR-011 — Sidebar-free public shell

1. Signed out, visit `/`, `/login`, and `/auth/callback` (any query) in turn.
2. **Expect**: none of them render `<AppSidebar>` (assert: no `aside[data-testid="app-sidebar"]` — or the currently-shipped selector — in the DOM).

## 4. Run the automated suite

```bash
npm run typecheck --workspace=packages/web
npm run lint --workspace=packages/web
npm run test --workspace=packages/web            # Vitest — middleware + component
npm run test:e2e --workspace=packages/web        # Playwright — acceptance scenarios
```

Every command must pass. The middleware branch table in `contracts/middleware.md` maps 1:1 to Vitest cases; the P1/P2/P3 scenarios above map to Playwright tests in `packages/web/tests/e2e/auth-gated-landing.spec.ts`.

## 5. Common pitfalls to watch for during review

- **Rotated cookies missing on the redirect response.** If a signed-in user visits `/` and the resulting redirect response does *not* carry the rotated `sb-*` cookies, the next request will find them stale and the user will bounce back to `/login` — subtle logout loop. Test: assert `Set-Cookie` headers are present on the 307 response, not just on `NextResponse.next()`.
- **`safeFrom()` not called at read-time.** Middleware composes the encoded `from`; the login page reads and validates it. Regressing the read-side guard would re-open the open-redirect hole.
- **Sidebar leaks onto `/login`.** The bug that this feature fixes. Manually verify with a signed-out incognito visit to `/login`.
- **`/setup` or `/game` still rendering for a signed-out user.** Would mean the middleware matcher or `PROTECTED_PREFIXES` doesn't cover that route.
- **A brief hero flash before the `/ → /games` redirect for a signed-in user.** Would mean the redirect is happening inside `app/page.tsx` instead of in middleware. Move it up.
